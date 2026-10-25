/*
 * Add future recordings here. Public copy is optional; the world setup and
 * recording facts are read directly from each PNG's embedded metadata.
 */
const INCIDENTS = [
  {
    src: "/incidents/o1findthehouse.png",
    title: "Incident 01: Find the House",
    goal: "Follow the lamps to the house and then go inside.",
    result: "Partial success · divine intervention required",
    summary:
      "It set off the wrong way and needed God to redirect it twice before it finally approached the entrance.",
    interpretation:
      "The character got close to the house, although its local map may have made the route less obvious than the 3D scene."
  }
];

const metadataKeyword = "tablefolk.initial-state";

function readPngTextChunks(buffer) {
  const bytes = new Uint8Array(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, i) => bytes[i] === value)) {
    throw new Error("This file is not a PNG.");
  }

  const view = new DataView(buffer);
  const decoder = new TextDecoder();
  const chunks = {};
  let offset = 8;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const start = offset + 8;
    const end = start + length;
    if (end + 4 > bytes.length) break;

    if (type === "tEXt") {
      const data = bytes.slice(start, end);
      const separator = data.indexOf(0);
      if (separator >= 0) {
        const key = decoder.decode(data.slice(0, separator));
        chunks[key] = decoder.decode(data.slice(separator + 1));
      }
    }
    offset = end + 4;
    if (type === "IEND") break;
  }

  return chunks;
}

async function loadIncidentMetadata(src) {
  const response = await fetch(src);
  if (!response.ok) throw new Error(`Could not load recording (${response.status}).`);
  const chunks = readPngTextChunks(await response.arrayBuffer());
  if (!chunks[metadataKeyword]) {
    throw new Error("This image does not contain a Tablefolk world setup.");
  }
  return JSON.parse(chunks[metadataKeyword]);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  })[character]);
}

function formatDuration(ms) {
  const seconds = Math.round((Number(ms) || 0) / 1000);
  return seconds >= 60
    ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
    : `${seconds}s`;
}

function friendlyDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.valueOf())
    ? ""
    : new Intl.DateTimeFormat("en", {
        month: "long", day: "numeric", year: "numeric"
      }).format(date);
}

function countLabel(number, singular, plural = `${singular}s`) {
  return `${number} ${number === 1 ? singular : plural}`;
}

function objectSummary(meta) {
  const all = [...(meta.props || []), ...(meta.blocks || [])];
  const counts = all.reduce((result, item) => {
    result[item.type] = (result[item.type] || 0) + 1;
    return result;
  }, {});
  return Object.entries(counts)
    .map(([type, count]) => countLabel(count, type))
    .join(" · ");
}

function initialMap(meta) {
  const text = meta.initialPerception || "";
  const mapStart = text.indexOf("Camera-facing-");
  const objectStart = text.indexOf("\n\nNearby visible objects:");
  return mapStart >= 0
    ? text.slice(mapStart, objectStart > mapStart ? objectStart : undefined)
    : text;
}

function yesNo(value) {
  return value ? "On" : "Off";
}

function agentCustomization(agent) {
  const brain = agent.brainConfig || {};
  const entries = [
    ["Body", agent.style || "Character"],
    ["Animation", agent.anim || "Unknown"],
    ["Brain", yesNo(brain.enabled)],
    ["Brain style", brain.style || "Unspecified"],
    ["Personality", brain.personality || "Unspecified"],
    ["Goals", brain.goals || "Unspecified"],
    ["Quest", brain.quest || "None"],
    ["Current goal", brain.goal || "None"],
    ["Chaos", brain.chaos ?? "Unspecified"],
    ["Fireball temptation", brain.fireballTemptation ?? "Unspecified"]
  ];

  return entries.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function incidentCard(incident, meta, index) {
  const recording = meta.recording || {};
  const agent = (meta.agents || [])[0] || {};
  const commands = meta.allowed || [];
  const filename = incident.src.split("/").pop();
  const map = initialMap(meta);
  const date = friendlyDate(meta.capturedAt);

  return `
    <article class="incident-card">
      <div class="incident-media">
        <div class="incident-number">0${index + 1}</div>
        <img src="${escapeHtml(incident.src)}"
             alt="Animated recording of ${escapeHtml(incident.title)}"
             width="${Number(recording.width) || 960}"
             height="${Number(recording.height) || 512}" />
        <div class="media-actions">
          <span>${escapeHtml(formatDuration(recording.durationMs))} · ${Number(recording.fps) || "?"} FPS</span>
          <a href="${escapeHtml(incident.src)}" download="${escapeHtml(filename)}">Download world ↓</a>
        </div>
      </div>

      <div class="incident-copy">
        <p class="eyebrow">${escapeHtml(date || "Recorded incident")}</p>
        <h3>${escapeHtml(incident.title)}</h3>
        <div class="goal"><span>Goal</span><p>${escapeHtml(incident.goal)}</p></div>
        <p class="summary">${escapeHtml(incident.summary)}</p>
        <p class="result">${escapeHtml(incident.result)}</p>
        <p class="interpretation">${escapeHtml(incident.interpretation)}</p>

        <dl class="facts">
          <div><dt>Agent</dt><dd>${escapeHtml(agent.id || "Character")}</dd></div>
          <div><dt>Actions</dt><dd>${commands.map(command => `<code>${escapeHtml(command)}</code>`).join(" ")}</dd></div>
          <div><dt>World</dt><dd>${escapeHtml(objectSummary(meta) || "Embedded setup")}</dd></div>
          <div><dt>Recording</dt><dd>${Number(recording.width) || "?"} × ${Number(recording.height) || "?"} · ${Number(recording.frames) || "?"} frames</dd></div>
        </dl>

        <details class="world-details">
          <summary>Inspect embedded world data</summary>
          <div class="details-body">
            <p>This information was extracted from the PNG in your browser.</p>
            <h4>Character customization</h4>
            <dl class="customization">
              ${agentCustomization(agent)}
            </dl>
            <h4>Initial perception</h4>
            <pre>${escapeHtml(map)}</pre>
            <div class="detail-actions">
              <a href="${escapeHtml(incident.src)}" download="${escapeHtml(filename)}">Download incident</a>
              <a href="/app/">Load it in Tablefolk →</a>
            </div>
          </div>
        </details>
      </div>
    </article>`;
}

function errorCard(incident, error) {
  return `
    <article class="incident-error">
      <h3>${escapeHtml(incident.title)}</h3>
      <p>The recording could not be read: ${escapeHtml(error.message)}</p>
      <a href="${escapeHtml(incident.src)}">Open the image directly</a>
    </article>`;
}

async function renderIncidents() {
  const list = document.querySelector("#incidentList");
  const cards = await Promise.all(INCIDENTS.map(async (incident, index) => {
    try {
      return incidentCard(incident, await loadIncidentMetadata(incident.src), index);
    } catch (error) {
      console.error("Incident metadata error:", incident.src, error);
      return errorCard(incident, error);
    }
  }));
  list.innerHTML = cards.join("");
}

renderIncidents();

// Worlds to try: the app's showcase list, each opening straight into the world.
(async () => {
  const box = document.querySelector('#worldList'); if (!box) return;
  try {
    const list = await (await fetch('/scenarios/showcase.json')).json();
    const esc = t => String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    box.innerHTML = list.map(w => `<a class="world-card" href="/app/?scenario=/scenarios/${encodeURIComponent(w.file)}">
      <div class="who">${(w.who || []).slice(0, 3).map(n => `<img alt="" src="/assets/tiles/characters/${esc(n)}.png" onerror="this.remove()">`).join('')}</div>
      <b>${esc(w.title)}</b><span>${esc(w.pitch)}</span></a>`).join('');
  } catch { box.closest('section')?.remove(); }
})();
