// LFM2.5-230M standalone chat demo - copied from /files/testlfm/lfm2.5-230m-web/index.html
// Provides its own load-model UI + chat UI, independent of the agent brain system.
import { AutoTokenizer, AutoModelForCausalLM, TextStreamer } from "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";

const MODEL_ID = "LiquidAI/LFM2.5-230M-ONNX";

function sanitizeChatTemplate(template) {
  if (typeof template !== "string") return template;
  return template
    .replace(/{%-?\s*generation\s*-?%}/g, "")
    .replace(/{%-?\s*endgeneration\s*-?%}/g, "");
}

// Build JSON-schema tools for the LFM2.5 native tool-call format
// (<|tool_call_start|>[func(args)]<|tool_call_end|>).
function buildTools(allowed) {
  const paramTools = {
    say: { text: { type: 'string', description: 'Text to speak' } },
    walk: { dir: { type: 'string', description: 'Direction n/s/e/w or coordinate' } },
    build: { thing: { type: 'string' }, at: { type: 'string' } },
    spell: { spell: { type: 'string' } },
    emote: { emote: { type: 'string' } },
    face: { dir: { type: 'string' } },
    goal: { text: { type: 'string' } },
    give_quest: { text: { type: 'string' } },
    give: { item: { type: 'string' } },
    sell: { item: { type: 'string' }, price: { type: 'integer' } },
    note: { html: { type: 'string' } },
    touch: { target: { type: 'string' } },
  };
  return (allowed || []).map(k => {
    const name = String(k).split('.')[0];
    const params = paramTools[name];
    return {
      type: 'function',
      function: {
        name,
        description: 'Execute the ' + name + ' command',
        parameters: params ? { type: 'object', properties: params, required: Object.keys(params) } : { type: 'object', properties: {} },
      },
    };
  });
}

export function initDemoChat() {
  const statusEl = document.getElementById("demoStatus");
  const chatEl = document.getElementById("demoChat");
  const inputEl = document.getElementById("demoInput");
  const sendBtn = document.getElementById("demoSendBtn");
  const loadBtn = document.getElementById("demoLoadBtn");
  const badge = document.getElementById("demoDeviceBadge");
  const bar = document.getElementById("demoProgressBar");
  const track = document.getElementById("demoProgressTrack");
  if (!statusEl || !chatEl || !inputEl || !sendBtn || !loadBtn) return;

  let tokenizer = null;
  let model = null;
  let loaded = false;

  function setStatus(text) { statusEl.textContent = text; }
  function setProgress(pct) {
    if (bar && track) {
      bar.style.width = (pct || 0) + "%";
      track.setAttribute("aria-valuenow", String(Math.round(pct || 0)));
    }
  }
  function addMsg(role, text) {
    const div = document.createElement("div");
    div.className = "msg " + role;
    div.textContent = text;
    chatEl.appendChild(div);
    chatEl.scrollTop = chatEl.scrollHeight;
  }

  async function loadModel() {
    loadBtn.disabled = true;
    setStatus("Loading tokenizer...");
    setProgress(0);
    try {
      tokenizer = await AutoTokenizer.from_pretrained(MODEL_ID, {
        progress_callback: (p) => { if (p.status === "progress") { setStatus(`Tokenizer: ${Math.round(p.progress||0)}%`); setProgress(p.progress); } },
      });
      if (tokenizer?.chat_template) {
        const cleaned = sanitizeChatTemplate(tokenizer.chat_template);
        if (cleaned !== tokenizer.chat_template) {
          tokenizer.chat_template = cleaned;
          console.log("[demo-chat] sanitized chat_template");
        }
      }
    } catch (e) {
      setStatus("Tokenizer load failed: " + e.message);
      loadBtn.disabled = false;
      return;
    }

    // Try q4 WebGPU first, then q8 WebGPU, then q8 WASM (same as the working demo).
    const attempts = [
      { dtype: "q4", device: "webgpu", label: "q4 WebGPU" },
      { dtype: "q8", device: "webgpu", label: "q8 WebGPU" },
      { dtype: "q8", device: "wasm", label: "q8 WASM" },
    ];
    for (const attempt of attempts) {
      setStatus(`Loading model (${attempt.label})...`);
      setProgress(0);
      try {
        model = await AutoModelForCausalLM.from_pretrained(MODEL_ID, {
          dtype: attempt.dtype,
          device: attempt.device,
          progress_callback: (p) => {
            if (p.status === "progress") { setStatus(`Model (${attempt.label}): ${Math.round(p.progress||0)}%`); setProgress(p.progress); }
            else if (p.status === "ready") setStatus(`Model (${attempt.label}) ready`);
          },
        });
        loaded = true;
        const isWebGPU = attempt.device === "webgpu";
        const deviceName = isWebGPU ? "WebGPU (GPU)" : "WASM (CPU)";
        console.log(`[demo-chat] Model loaded using ${deviceName} (dtype=${attempt.dtype})`);
        if (badge) {
          badge.style.display = "block";
          badge.textContent = "Running on: " + deviceName;
          badge.style.background = isWebGPU ? "#1e5f2a" : "#5f4a1e";
        }
        setStatus(`Loaded: ${attempt.label} (${deviceName})`);
        setProgress(100);
        inputEl.disabled = false;
        sendBtn.disabled = false;
        addMsg("bot", "Model loaded (" + attempt.label + ", " + deviceName + "). Say hello!");
        return;
      } catch (e) {
        console.warn(`[demo-chat] ${attempt.label} failed:`, e);
        setStatus(`${attempt.label} failed: ${e.message}. Trying next...`);
      }
    }
    setStatus("All attempts failed. See console for details.");
    loadBtn.disabled = false;
  }

  async function generate() {
    const text = inputEl.value.trim();
    if (!text || !loaded) return;
    inputEl.value = "";
    addMsg("user", text);
    sendBtn.disabled = true;
    try {
      const world = window.tablefolk;
      const g = world?.getSelectedAgent?.();
      if (!g) { addMsg("err", "No agent selected. Click a character first."); sendBtn.disabled = false; return; }
      const cfg = world.getBrainConfig(g.id);
      // Set pendingChat exactly like the existing chat panel (sendChatToAgent):
      // default name 'God', stored as 'God says: <text>'.
      const name = document.getElementById('chatName')?.value || 'God';
      cfg.pendingChat = (cfg.pendingChat || []).concat([`${name} says: ${text}`]);
      if (cfg.pendingChat.length > 5) cfg.pendingChat = cfg.pendingChat.slice(-5);
      world.setBrainConfig(g.id, cfg);
      // Build the same prompt the agent brain would use, via the existing function.
      const { messages } = world.buildAgentMessages(g, cfg);
      console.log('[demo-chat] prompt:', JSON.stringify(messages, null, 2));
      // Pass the available commands as native tools so the model uses its
      // <|tool_call_start|>[func(args)]<|tool_call_end|> format.
      const tools = buildTools(world.getAllowedCommands(g.id));
      const input = tokenizer.apply_chat_template(messages, {
        tools,
        add_generation_prompt: true,
        return_dict: true,
      });
      let fullText = "";
      const streamer = new TextStreamer(tokenizer, {
        skip_prompt: true,
        skip_special_tokens: true,
        callback_function: (out) => {
          fullText += out;
          const last = chatEl.lastElementChild;
          if (last && last.classList.contains("bot")) last.textContent = fullText;
          else addMsg("bot", fullText);
          chatEl.scrollTop = chatEl.scrollHeight;
        },
      });
      await model.generate({
        ...input,
        max_new_tokens: 256,
        do_sample: true,
        temperature: 0.7,
        top_p: 0.95,
        repetition_penalty: 1.05,
        streamer,
      });

      // Feed the model output into tablefolk.world's existing command processing.
      if (world && g) {
        const line = fullText.trim();
        console.log("[demo-chat] feeding into tablefolk.world:", line);
        // Parse native tool calls: <|tool_call_start|>[func(args)]<|tool_call_end|>
        const toolCallRegex = /<\|tool_call_start\|>(.*?)<\|tool_call_end\|>/gs;
        const planCmds = [];
        let m;
        while ((m = toolCallRegex.exec(line)) !== null) {
          const inner = m[1].trim().replace(/^\[/, '').replace(/\]$/, '').trim();
          const cmd = world.parseLLMCommandLine(inner);
          if (cmd) planCmds.push(cmd);
        }
        // Fallback: also try plain command lines if no native tool calls found.
        if (!planCmds.length) {
          const planLines = (typeof window.splitPlanLines === "function" ? window.splitPlanLines(line) : String(line || "").split("\n").map(l => l.trim()).filter(Boolean));
          for (const l of planLines) {
            const cmd = world.parseLLMCommandLine(l);
            if (cmd) planCmds.push(cmd);
          }
        }
        if (!planCmds.length) planCmds.push({ kind: "look" });
        for (const planCmd of planCmds) await world.stepAgentTurn(g.id, planCmd, "llm");
      }
    } catch (e) {
      console.error("[demo-chat] generate error:", e);
      addMsg("err", "Error: " + e.message);
    }
    sendBtn.disabled = false;
  }

  loadBtn.addEventListener("click", loadModel);
  sendBtn.addEventListener("click", generate);
  inputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") generate(); });
}
