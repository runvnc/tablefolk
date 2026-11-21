// reply-clean.js -- small, pure pieces of reading a character's reply
// (world-integration.js runOneAgentTurn), kept here so they can be tested in
// Node (tools/browser-test/reply-parse-test.mjs).

// Tidy command lines before they are split and parsed:
//  - a stray quote after the closing bracket, say("...")" (Raon-1 nano wrote
//    it, and the next call on that line leaked into speech: '"...tam!"). walk(tam'),
//    ends the command, and a call after it starts a new line;
//  - a command ended like code, say("...");  or say("..."). , is the command.
export function cleanReply(text) {
  return String(text || '')
    .replace(/\)[ \t]*["'”]+[ \t]*[.;,]?[ \t]*(?=[A-Za-z_][\w.-]*\s*\(|$)/gm, ')\n')
    .replace(/\)[ \t]*[.;][ \t]*(?=[A-Za-z_][\w.-]*\s*\()/gm, ')\n')
    .replace(/\)[ \t]*[;.][ \t]*$/gm, ')')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}

// Words in a spoken line, in any script: a "word" is anything with a letter
// or a digit (Korean, Japanese, Cyrillic... counted, not only a-z). A line in a
// script written without spaces (Chinese, Japanese) counts two characters a word.
export function wordCount(text) {
  const t = String(text || '').trim(); if (!t) return 0;
  const parts = t.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w));
  const cjk = (t.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu) || []).length;
  return Math.max(parts.length, Math.ceil(cjk / 2));
}
