// Structured-output helpers for WebLLM constrained decoding.
// The simple command-spec mode compiles to a plain command DSL, not JSON.

function stringRules() {
  // Simple xgrammar-safe printable character set. This mirrors the first working
  // command grammar style; avoid char? char? bounded expansion because that froze.
  return `string ::= "\\"" char* "\\""
char ::= [A-Za-z0-9 .,!?;:'_<>/=-]`;
}

const STRING_RULES = stringRules();

export const GRAMMARS = {
  none: { label: 'No constraint', grammar: '' },
  number: { label: 'Number only', grammar: `root ::= [0-9]+` },
  integer: { label: 'Integer (maybe negative)', grammar: `root ::= "-"? [0-9]+` },
  yesno: { label: 'Yes / No', grammar: `root ::= "yes" | "no"` },
  singleword: { label: 'Single word', grammar: `root ::= [a-zA-Z]+` },
  commands: {
    label: 'Commands: say/walk',
    grammar: commandSpecToGrammar(`say(text)
walk(direction: north|south|east|west)`),
    instruction: 'Output only plain command lines, one command per line. Choose only commands that are relevant to the user request.',
  },
  choice: { label: 'Custom choice example', grammar: `root ::= "option-a" | "option-b" | "option-c"` },
};

function grammarLiteral(s) {
  const escaped = String(s)
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t')
    .replace(/"/g, '\\"');
  return `"${escaped}"`;
}

function ruleName(name) {
  return String(name).trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^([0-9])/, '_$1');
}

function literalRule(values) {
  return values.map(v => grammarLiteral(String(v).trim())).join(' | ');
}

// Simple command-spec format:
//   say(text)
//   walk(direction: north|south|east|west)
//   spell(name: heal|shield|lightning|fireball, target)
// Output:
//   say("hello")
//   walk(north)
// Default is one to four commands. Directives: @one, @many, @count N, @max N.
function parseCommandSpec(specText) {
  const lines = String(specText || '')
    .split('\n')
    .map(l => l.replace(/#.*/, '').trim())
    .filter(Boolean);

  const options = { min: 1, max: 4 };
  const commands = [];

  for (const line of lines) {
    if (line.startsWith('@')) {
      const match = line.match(/^@(one|single|many|count|max)\s*(.*)$/i);
      if (!match) throw new Error(`Bad command spec directive: ${line}`);
      const kind = match[1].toLowerCase();
      const arg = match[2].trim();
      if (kind === 'one' || kind === 'single') {
        options.min = 1; options.max = 1;
      } else if (kind === 'many') {
        options.min = 1; options.max = 4;
      } else if (kind === 'count') {
        if (!/^\d+$/.test(arg)) throw new Error('@count needs a number, e.g. @count 2');
        const n = Number(arg);
        if (n < 1 || n > 20) throw new Error('@count must be between 1 and 20.');
        options.min = n; options.max = n;
      } else if (kind === 'max') {
        if (!/^\d+$/.test(arg)) throw new Error('@max needs a number, e.g. @max 4');
        const n = Number(arg);
        if (n < 1 || n > 20) throw new Error('@max must be between 1 and 20.');
        options.min = 1; options.max = n;
      }
      continue;
    }

    const match = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*(?:\((.*)\))?$/);
    if (!match) throw new Error(`Bad command spec line: ${line}`);
    const name = match[1];
    const fieldsText = (match[2] || '').trim();
    const fields = [];
    if (fieldsText) {
      for (const rawPart of fieldsText.split(',')) {
        const part = rawPart.trim();
        if (!part) continue;
        const [rawField, rawValues] = part.split(':').map(x => x.trim());
        if (!rawField || !/^[A-Za-z_][A-Za-z0-9_-]*$/.test(rawField)) throw new Error(`Bad field in command spec line: ${line}`);
        const values = rawValues ? rawValues.split('|').map(v => v.trim()).filter(Boolean) : null;
        fields.push({ name: rawField, values });
      }
    }
    commands.push({ name, fields });
  }
  if (!commands.length) throw new Error('Command spec is empty.');
  return { commands, options };
}

function commandSpecInstruction(specText) {
  const { options } = parseCommandSpec(specText);
  let countText = 'one to four command lines';
  if (options.max === 1) countText = 'exactly one command line';
  else if (options.max && options.min === options.max) countText = `exactly ${options.max} command lines`;
  else if (options.max) countText = `one to ${options.max} command lines`;
  return `Output only ${countText}, using this plain command syntax. Do not output JSON. Put each command on its own line. Follow this command spec:\n${String(specText).trim()}`;
}

export function commandSpecToGrammar(specText) {
  const { commands, options } = parseCommandSpec(specText);
  const commandRules = [];
  const valueRules = [];

  for (const cmd of commands) {
    const rn = `cmd_${ruleName(cmd.name)}`;
    const pieces = [grammarLiteral(`${cmd.name}(`)];
    cmd.fields.forEach((field, idx) => {
      const fr = `${rn}_${ruleName(field.name)}`;
      if (idx > 0) pieces.push(grammarLiteral(','));
      pieces.push(fr);
      if (field.values && field.values.length) valueRules.push(`${fr} ::= ${literalRule(field.values)}`);
      else valueRules.push(`${fr} ::= string`);
    });
    pieces.push(grammarLiteral(')'));
    commandRules.push(`${rn} ::= ${pieces.join(' ')}`);
  }

  const commandNames = commands.map(c => `cmd_${ruleName(c.name)}`);
  const rules = [`command ::= ${commandNames.join(' | ')}`];

  if (options.min === 1 && options.max === 1) {
    rules.unshift('root ::= command');
  } else {
    const countRules = [];
    for (let n = options.min; n <= options.max; n++) {
      const rn = `commands_${n}`;
      const pieces = ['command'];
      for (let i = 1; i < n; i++) pieces.push(grammarLiteral('\n'), 'command');
      rules.push(`${rn} ::= ${pieces.join(' ')}`);
      countRules.push(rn);
    }
    rules.unshift(`root ::= ${countRules.join(' | ')}`);
  }

  return [...rules, ...commandRules, ...valueRules, STRING_RULES.trim()].join('\n');
}

export function getGrammarKeys() { return Object.keys(GRAMMARS); }
export function getGrammar(key) { return GRAMMARS[key]?.grammar || ''; }
export function getGrammarLabel(key) { return GRAMMARS[key]?.label || key; }
export function getGrammarInstruction(key) { return GRAMMARS[key]?.instruction || ''; }
export function getBuiltInResponseFormat(key) {
  const g = GRAMMARS[key];
  if (!g) return null;
  if (g.grammar) return { type: 'grammar', grammar: g.grammar };
  return null;
}
export function parseCustomConstraint(text) {
  const raw = String(text || '').trim();
  if (!raw) return { responseFormat: null, instruction: '' };
  if (raw.includes('::=')) return { responseFormat: { type: 'grammar', grammar: raw }, instruction: 'Follow the supplied grammar exactly.' };
  const grammar = commandSpecToGrammar(raw);
  return { responseFormat: { type: 'grammar', grammar }, instruction: commandSpecInstruction(raw) };
}
