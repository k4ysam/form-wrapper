// popup.js — main popup logic
// Views: discover → trigger → status

const $ = (id) => document.getElementById(id);

// ── State ─────────────────────────────────────────────────────────
let serverUrl = "http://localhost:3000";
let discoveredSchema = null;  // { url, title, fields, isMultiStep }
let currentWorkflow = null;   // name string after save
let pollTimer = null;

// ── Init ──────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  await loadServerUrl();
  await setTabUrl();
  await checkServer();
  await restorePendingRun();
  wireEvents();
});

async function loadServerUrl() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getServerUrl" }, (res) => {
      serverUrl = res?.serverUrl || "http://localhost:3000";
      $("server-url-input").value = serverUrl;
      resolve();
    });
  });
}

async function setTabUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    $("tab-url").textContent = new URL(tab.url).hostname;
  }
}

async function checkServer() {
  try {
    const res = await fetch(`${serverUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    hideError();
  } catch {
    showError(`Server unreachable at ${serverUrl} — is form-api serve running?`);
  }
}

async function restorePendingRun() {
  const stored = await storageGet("pendingRun");
  if (!stored) return;
  currentWorkflow = stored.workflowName;
  showStatus(stored.runId, stored.workflowName);
  if (stored.status === "queued" || stored.status === "processing") {
    startPolling(stored.workflowName, stored.runId);
  } else {
    applyStatusResult(stored);
  }
}

// ── Event wiring ─────────────────────────────────────────────────
function wireEvents() {
  // Settings toggle
  $("settings-btn").addEventListener("click", () => {
    $("settings-panel").classList.toggle("hidden");
  });

  $("save-server-btn").addEventListener("click", async () => {
    const url = $("server-url-input").value.trim().replace(/\/$/, "");
    if (!url) return;
    serverUrl = url;
    await new Promise((r) => chrome.runtime.sendMessage({ action: "setServerUrl", serverUrl: url }, r));
    $("settings-panel").classList.add("hidden");
    await checkServer();
  });

  // Error retry
  $("error-retry").addEventListener("click", checkServer);

  // Discover
  $("discover-btn").addEventListener("click", onDiscover);

  // Save to server
  $("save-btn").addEventListener("click", onSave);

  // Back buttons
  $("back-to-discover").addEventListener("click", () => {
    stopPolling();
    showView("discover");
  });
  $("back-to-trigger").addEventListener("click", () => {
    stopPolling();
    showView("trigger");
  });

  // Submit run
  $("trigger-form").addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmitRun();
  });
  $("submit-run-btn").addEventListener("click", () => {
    $("trigger-form").dispatchEvent(new Event("submit"));
  });
}

// ── Discover ──────────────────────────────────────────────────────
async function onDiscover() {
  const btn = $("discover-btn");
  btn.disabled = true;
  btn.textContent = "Discovering…";

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab");

    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    const schema = results?.[0]?.result;
    if (!schema || !schema.fields?.length) {
      showError("No form fields found on this page.");
      return;
    }

    discoveredSchema = schema;
    renderFieldList(schema.fields, schema.isMultiStep);

    // Pre-fill workflow name from hostname
    const hostname = new URL(schema.url).hostname.replace(/^www\./, "").replace(/\./g, "-");
    $("workflow-name-input").value = hostname;

    $("fields-section").classList.remove("hidden");
  } catch (err) {
    showError(`Discovery failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="btn-icon">↻</span> Re-discover';
  }
}

function renderFieldList(fields, isMultiStep) {
  const list = $("field-list");
  list.innerHTML = "";

  fields.forEach((f) => {
    const li = document.createElement("li");
    li.className = "field-item";

    const typeCls = `type-${f.type || "default"}`;
    const req = f.required ? '<span class="required-dot" title="required"></span>' : "";

    li.innerHTML = `
      <span class="field-item-name" title="${f.name}">${f.name}</span>
      <span class="field-item-label" title="${f.label || ""}">${f.label || ""}</span>
      <span class="type-badge ${typeCls}">${f.type}</span>
      ${req}
    `;
    list.appendChild(li);
  });

  $("fields-count").textContent = `${fields.length} field${fields.length !== 1 ? "s" : ""} found`;
  if (isMultiStep) $("multi-step-badge").classList.remove("hidden");
}

// ── Save to server ────────────────────────────────────────────────
async function onSave() {
  const name = $("workflow-name-input").value.trim().toLowerCase();
  if (!name) { showError("Workflow name is required."); return; }
  if (!/^[a-z0-9-]+$/.test(name)) { showError("Name must be lowercase letters, numbers, and hyphens only."); return; }
  if (!discoveredSchema) { showError("Run discovery first."); return; }

  const btn = $("save-btn");
  btn.disabled = true;
  btn.textContent = "Saving…";

  try {
    const res = await fetch(`${serverUrl}/api/ingest-schema`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        url: discoveredSchema.url,
        fields: discoveredSchema.fields,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    currentWorkflow = name;
    renderTriggerForm(discoveredSchema.fields);
    showView("trigger");
    $("trigger-title").textContent = name;
  } catch (err) {
    showError(`Save failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Save to Server";
  }
}

// ── Trigger form ─────────────────────────────────────────────────
function renderTriggerForm(fields) {
  const form = $("trigger-form");
  form.innerHTML = "";

  fields.forEach((f) => {
    if (f.disabled) return; // skip disabled fields

    const wrapper = document.createElement("div");
    wrapper.className = "trigger-field";

    const labelHtml = `<label class="field-label" for="tf-${f.name}">
      ${f.label || f.name}${f.required ? '<span class="required">*</span>' : ""}
    </label>`;

    let inputHtml = "";

    if (f.type === "select" && f.options?.length) {
      const opts = f.options.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join("");
      inputHtml = `<select id="tf-${f.name}" name="${f.name}" class="select-input"${f.required ? " required" : ""}>
        <option value="">Select…</option>${opts}
      </select>`;
    } else if (f.type === "radio" && f.options?.length) {
      const radios = f.options
        .map((o) => `<label class="radio-option">
          <input type="radio" name="${f.name}" value="${esc(o)}"${f.required ? " required" : ""} /> ${esc(o)}
        </label>`)
        .join("");
      inputHtml = `<div class="radio-group">${radios}</div>`;
    } else if (f.type === "checkbox" && f.options?.length) {
      const boxes = f.options
        .map((o) => `<label class="checkbox-option">
          <input type="checkbox" name="${f.name}" value="${esc(o)}" /> ${esc(o)}
        </label>`)
        .join("");
      inputHtml = `<div class="checkbox-group">${boxes}</div>`;
    } else if (f.type === "checkbox") {
      inputHtml = `<label class="checkbox-option">
        <input type="checkbox" id="tf-${f.name}" name="${f.name}" value="yes" /> Yes
      </label>`;
    } else if (f.type === "textarea") {
      inputHtml = `<textarea id="tf-${f.name}" name="${f.name}" class="textarea-input"${f.required ? " required" : ""}></textarea>`;
    } else {
      const t = ["email","tel","number","date","password"].includes(f.type) ? f.type : "text";
      inputHtml = `<input type="${t}" id="tf-${f.name}" name="${f.name}" class="text-input"${f.required ? " required" : ""} />`;
    }

    wrapper.innerHTML = labelHtml + inputHtml;
    form.appendChild(wrapper);
  });
}

// ── Submit run ────────────────────────────────────────────────────
async function onSubmitRun() {
  const form = $("trigger-form");
  const data = {};

  form.querySelectorAll("input, select, textarea").forEach((el) => {
    if (!el.name) return;
    if (el.type === "checkbox") {
      if (!data[el.name]) data[el.name] = [];
      if (el.checked) data[el.name].push(el.value);
    } else if (el.type === "radio") {
      if (el.checked) data[el.name] = el.value;
    } else {
      if (el.value) data[el.name] = el.value;
    }
  });

  // Flatten single-item checkbox arrays to scalar
  for (const [k, v] of Object.entries(data)) {
    if (Array.isArray(v) && v.length === 1) data[k] = v[0];
    if (Array.isArray(v) && v.length === 0) delete data[k];
  }

  const btn = $("submit-run-btn");
  btn.disabled = true;
  btn.textContent = "Submitting…";

  try {
    const res = await fetch(`${serverUrl}/api/${currentWorkflow}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${res.status}`);
    }

    const { runId } = await res.json();
    await storageSave("pendingRun", { workflowName: currentWorkflow, runId, status: "queued" });
    showStatus(runId, currentWorkflow);
    startPolling(currentWorkflow, runId);
  } catch (err) {
    showError(`Submit failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Submit Run";
  }
}

// ── Status & polling ──────────────────────────────────────────────
function showStatus(runId, workflowName) {
  showView("status");
  $("run-id-display").textContent = runId;
  $("poll-spinner").classList.remove("hidden");
  $("status-badge").textContent = "queued";
  $("status-badge").className = "status-badge queued";
  $("status-message").classList.add("hidden");
  $("status-error").classList.add("hidden");
  $("status-duration-row").classList.add("hidden");
  $("status-tiers-row").classList.add("hidden");
}

function startPolling(workflowName, runId) {
  stopPolling();
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`${serverUrl}/api/${workflowName}/runs/${runId}`);
      if (!res.ok) return;
      const data = await res.json();
      await storageSave("pendingRun", { workflowName, runId, ...data });
      applyStatusResult(data);

      if (data.status === "success" || data.status === "failed") {
        stopPolling();
        $("poll-spinner").classList.add("hidden");
        await storageRemove("pendingRun");
      }
    } catch {
      // Server temporarily unreachable — keep trying
    }
  }, 2000);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function applyStatusResult(data) {
  const badge = $("status-badge");
  badge.textContent = data.status || "unknown";
  badge.className = `status-badge ${data.status || ""}`;

  if (data.durationMs) {
    $("status-duration").textContent = `${(data.durationMs / 1000).toFixed(1)}s`;
    $("status-duration-row").classList.remove("hidden");
  }

  if (data.tiersUsed?.length) {
    $("status-tiers").textContent = data.tiersUsed.join(" → ");
    $("status-tiers-row").classList.remove("hidden");
  }

  if (data.message) {
    $("status-message").textContent = data.message;
    $("status-message").classList.remove("hidden");
  }

  if (data.error) {
    $("status-error").textContent = data.error;
    $("status-error").classList.remove("hidden");
  }
}

// ── View management ───────────────────────────────────────────────
function showView(name) {
  ["discover", "trigger", "status"].forEach((v) => {
    $(`view-${v}`).classList.toggle("hidden", v !== name);
  });
}

// ── Error helpers ─────────────────────────────────────────────────
function showError(msg) {
  $("error-msg").textContent = msg;
  $("error-banner").classList.remove("hidden");
}

function hideError() {
  $("error-banner").classList.add("hidden");
}

// ── Storage helpers ───────────────────────────────────────────────
function storageGet(key) {
  return new Promise((resolve) => {
    chrome.storage.local.get(key, (data) => resolve(data[key] ?? null));
  });
}

function storageSave(key, value) {
  return new Promise((resolve) => chrome.storage.local.set({ [key]: value }, resolve));
}

function storageRemove(key) {
  return new Promise((resolve) => chrome.storage.local.remove(key, resolve));
}

// ── HTML escape ───────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
