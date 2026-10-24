// A small OpenAI-compatible client, shaped like the official openai package:
//
//   const client = new OpenAI({ baseURL, apiKey });
//   const r = await client.chat.completions.create({ model, messages });
//   r.choices[0].message.content
//
//   for await (const chunk of await client.chat.completions.create({ ..., stream: true }))
//     process.stdout.write(chunk.choices[0]?.delta?.content || '');
//
// Plain fetch and no dependencies, so the same file runs in the browser and
// in Bun (the server imports it from here). Any OpenAI-compatible server
// works: OpenRouter, OpenAI, litert-lm serve, llama.cpp, vLLM, Ollama...
//
// localClient(engine) gives an in-page engine (the LiteRT-LM worker) the same
// interface, so callers never care where the model runs.

export class OpenAIError extends Error {
  constructor(status, body) {
    const msg = body?.error?.message || body?.message || (typeof body === 'string' ? body : JSON.stringify(body));
    super(`LLM request failed (${status}): ${String(msg).slice(0, 400)}`);
    this.status = status; this.body = body;
  }
}

export class OpenAI {
  constructor({ baseURL = 'https://api.openai.com/v1', apiKey = '', defaultHeaders = {}, fetch: f = null, timeout = 120000 } = {}) {
    this.baseURL = String(baseURL).replace(/\/+$/, '');
    this.apiKey = apiKey; this.defaultHeaders = defaultHeaders; this.timeout = timeout;
    this._fetch = f || ((...a) => fetch(...a));
    this.chat = { completions: { create: (body, opts) => this._chat(body, opts) } };
    this.models = { list: async () => { const { res, done } = await this._request('GET', '/models'); try { return await res.json(); } finally { done(); } } };
  }

  _headers() {
    return { 'Content-Type': 'application/json', ...(this.apiKey ? { Authorization: 'Bearer ' + this.apiKey } : {}), ...this.defaultHeaders };
  }

  async _request(method, path, body = null, { signal } = {}) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(new Error('LLM request timed out')), this.timeout);
    signal?.addEventListener('abort', () => ctl.abort(signal.reason));
    try {
      const res = await this._fetch(this.baseURL + path, { method, headers: this._headers(), body: body ? JSON.stringify(body) : undefined, signal: ctl.signal });
      if (!res.ok) throw new OpenAIError(res.status, await res.json().catch(() => res.statusText));
      return { res, done: () => clearTimeout(t) };
    } catch (e) { clearTimeout(t); throw e; }
  }

  async _chat(body, { signal } = {}) {
    const { res, done } = await this._request('POST', '/chat/completions', body, { signal });
    if (!body.stream) { try { return await res.json(); } finally { done(); } }
    return (async function* () { try { yield* sseChunks(res.body); } finally { done(); } })();
  }
}

// Server-sent events from a chat completion stream, as parsed chunks.
async function* sseChunks(stream) {
  const reader = stream.getReader(), dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try { yield JSON.parse(data); } catch {}
    }
  }
}

// Collect a stream (or a whole response) into { text, finish_reason, usage },
// calling onToken(fullTextSoFar) as text arrives.
// onReasoning(chars) reports a reasoning model's hidden thinking as it streams
// (OpenRouter's delta.reasoning), which can come seconds before any content.
export async function collect(result, onToken = null, onReasoning = null) {
  if (!result?.[Symbol.asyncIterator]) {
    const c = result?.choices?.[0];
    return { text: c?.message?.content || '', finish_reason: c?.finish_reason, usage: result?.usage };
  }
  let text = '', finish_reason = null, usage = null, thought = 0, tail = '';
  for await (const chunk of result) {
    const c = chunk.choices?.[0];
    const r = c?.delta?.reasoning ?? c?.delta?.reasoning_content;
    // onReasoning(chars so far, the last ~600 chars of the thought text)
    if (r) { thought += r.length; tail = (tail + r).slice(-600); onReasoning?.(thought, tail); }
    if (c?.delta?.content) { text += c.delta.content; onToken?.(text); }
    if (c?.finish_reason) finish_reason = c.finish_reason;
    if (chunk.usage) usage = chunk.usage;
  }
  return { text, finish_reason, usage };
}

// An in-page engine behind the same interface. `engine.generate(messages,
// opts, onToken)` returns the full text (the LiteRT worker client's shape).
export function localClient(engine, { model = 'local' } = {}) {
  const create = async (body) => {
    const opts = { ...body, max_tokens: body.max_tokens ?? 256, temperature: body.temperature ?? 0.7 };
    if (!body.stream) {
      const text = await engine.generate(body.messages, opts, null);
      return { id: 'local-' + Date.now(), object: 'chat.completion', model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }] };
    }
    // Stream: the engine reports the whole text so far; emit the new part.
    const queue = [], waiters = [];
    let done = false, seen = '';
    const push = v => { const w = waiters.shift(); w ? w(v) : queue.push(v); };
    engine.generate(body.messages, opts, full => {
      const delta = String(full).slice(seen.length); seen = String(full);
      if (delta) push({ choices: [{ index: 0, delta: { content: delta } }] });
    }).then(text => {
      const rest = String(text || '').slice(seen.length);
      if (rest) push({ choices: [{ index: 0, delta: { content: rest } }] });
      push({ choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] }); done = true; push(null);
    }, err => { done = true; push(err instanceof Error ? err : new Error(String(err))); });
    return {
      async *[Symbol.asyncIterator]() {
        for (;;) {
          const v = queue.length ? queue.shift() : await new Promise(r => waiters.push(r));
          if (v === null) return;
          if (v instanceof Error) throw v;
          yield v;
        }
      },
    };
  };
  return { chat: { completions: { create } }, models: { list: async () => ({ data: [{ id: model, object: 'model' }] }) } };
}
