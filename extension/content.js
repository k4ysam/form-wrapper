// content.js — injected into the active tab by the popup via chrome.scripting.executeScript
// Returns a schema object as the last evaluated expression (captured by executeScript).
(function extractFormSchema() {
  const SKIP_TYPES = new Set(["submit", "button", "hidden", "reset", "image"]);

  // ── Step 1: identify radio/checkbox groups (same name, multiple elements) ──
  const typeCount = {};
  document.querySelectorAll("input").forEach((el) => {
    const t = (el.type || "text").toLowerCase();
    const n = el.name;
    if (!n || !["radio", "checkbox"].includes(t)) return;
    const key = `${t}:${n}`;
    typeCount[key] = (typeCount[key] || 0) + 1;
  });
  const radioGroups = new Set(
    Object.entries(typeCount).filter(([k, v]) => k.startsWith("radio:") && v > 0).map(([k]) => k.slice(6))
  );
  const checkboxGroups = new Set(
    Object.entries(typeCount).filter(([k, v]) => k.startsWith("checkbox:") && v > 1).map(([k]) => k.slice(9))
  );

  // ── Step 2: helpers ─────────────────────────────────────────────────────
  function getLabelText(el) {
    if (el.id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return lbl.textContent.replace(/[*✱]/g, "").trim();
    }
    const closest = el.closest("label");
    if (closest) return closest.textContent.replace(/[*✱]/g, "").trim();
    return null;
  }

  function resolveSelector(el) {
    if (el.name) return `[name='${el.name}']`;
    const aria = el.getAttribute("aria-label");
    if (aria) return `[aria-label='${aria}']`;
    const testId = el.getAttribute("data-testid");
    if (testId) return `[data-testid='${testId}']`;
    if (el.id && !/^\d/.test(el.id) && !/[0-9a-f]{8}-/.test(el.id)) return `#${el.id}`;
    const tag = el.tagName.toLowerCase();
    return el.type ? `${tag}[type='${el.type}']` : tag;
  }

  function getSelectOptions(el) {
    return Array.from(el.options)
      .filter((o) => o.value !== "")
      .map((o) => o.text.trim());
  }

  function getGroupOptions(name, type) {
    const options = [];
    document.querySelectorAll(`input[type='${type}'][name='${CSS.escape(name)}']`).forEach((el) => {
      const parentLabel = el.closest("label");
      const text = parentLabel ? parentLabel.textContent.replace(/[*✱]/g, "").trim() : el.value;
      if (text && !options.includes(text)) options.push(text);
    });
    return options;
  }

  // ── Step 3: main extraction loop ─────────────────────────────────────────
  const fields = [];
  const processed = new Set();

  document.querySelectorAll("input, select, textarea").forEach((el, i) => {
    const tag = el.tagName.toLowerCase();
    const type = tag === "input" ? (el.type || "text").toLowerCase() : null;

    if (type && SKIP_TYPES.has(type)) return;

    const name = el.name || null;
    const ariaLabel = el.getAttribute("aria-label") || null;
    const placeholder = el.placeholder || null;
    const required = el.required || false;
    const disabled = el.disabled || false;

    // ── Radio group ──
    if (type === "radio" && name && radioGroups.has(name)) {
      const key = `radio:${name}`;
      if (processed.has(key)) return;
      processed.add(key);
      const labelText = getLabelText(el);
      fields.push({
        name,
        type: "radio",
        label: labelText || ariaLabel || name,
        ariaLabel,
        required,
        disabled: false,
        selector: `[name='${name}']`,
        options: getGroupOptions(name, "radio"),
      });
      return;
    }

    // ── Checkbox group ──
    if (type === "checkbox" && name && checkboxGroups.has(name)) {
      const key = `checkbox-group:${name}`;
      if (processed.has(key)) return;
      processed.add(key);
      const labelText = getLabelText(el);
      fields.push({
        name,
        type: "checkbox",
        label: labelText || ariaLabel || name,
        ariaLabel,
        required,
        disabled: false,
        selector: `[name='${name}']`,
        options: getGroupOptions(name, "checkbox"),
      });
      return;
    }

    // ── Regular field ──
    const key = name || el.id || `field-${i}`;
    if (processed.has(key)) return;
    processed.add(key);

    const fieldType = tag === "textarea" ? "textarea" : tag === "select" ? "select" : (type || "text");
    const labelText = getLabelText(el);

    const field = {
      name: name || el.id || `field-${i}`,
      type: fieldType,
      label: labelText || ariaLabel || placeholder || null,
      ariaLabel,
      required,
      disabled,
      selector: resolveSelector(el),
      options: tag === "select" ? getSelectOptions(el) : null,
    };

    fields.push(field);
  });

  // ── Multi-step detection ─────────────────────────────────────────────────
  const isMultiStep = Array.from(
    document.querySelectorAll("button, input[type='button'], input[type='submit']")
  ).some((b) => /next|continue|proceed/i.test(b.textContent || b.value || ""));

  return {
    url: location.href,
    title: document.title,
    fields,
    isMultiStep,
  };
})();
