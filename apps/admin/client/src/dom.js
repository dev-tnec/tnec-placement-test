// Small DOM helpers shared by the React app and the two pieces that stay imperative:
// the toast stack and the context menu. Forms inside dialogs read their values from the
// DOM at submit time, so the old validation flow keeps working unchanged.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export const iconHtml = (name, cls = "") => `<svg class="icon ${cls}" aria-hidden="true" focusable="false"><use href="#i-${name}"></use></svg>`;

export function clearErrors(root) {
  $$(".error", root).forEach((e) => { e.hidden = true; e.textContent = ""; });
  $$(".is-invalid", root).forEach((e) => { e.classList.remove("is-invalid"); e.removeAttribute("aria-invalid"); });
}

export function fieldError(input, errId, message) {
  const err = $(`#${errId}`);
  if (err) { err.textContent = message; err.hidden = false; }
  if (input) { input.classList.add("is-invalid"); input.setAttribute("aria-invalid", "true"); if (err) input.setAttribute("aria-describedby", errId); }
}

export function busy(button, label) {
  if (!button) return () => {};
  const old = button.textContent;
  button.disabled = true;
  button.textContent = label;
  return () => { button.disabled = false; button.textContent = old; };
}

/**
 * One shared "mark this field invalid and remember the first one" helper for every dialog
 * submit handler. Each dialog used to define its own copy of this closure. `fail.first()`
 * returns the first invalid element, or null when every field passed.
 */
export function makeFieldFail() {
  let first = null;
  const fail = (input, errId, message) => {
    fieldError(input, errId, message);
    if (!first) first = input;
    return input;
  };
  fail.first = () => first;
  return fail;
}

/* ===================== Toasts ===================== */
export function toast(message, action) {
  const region = $("#toasts");
  const el = document.createElement("div");
  el.className = "toast";
  const text = document.createElement("span");
  text.textContent = message;
  el.appendChild(text);
  if (action) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "toast__action"; b.textContent = action.label;
    b.addEventListener("click", () => { el.remove(); action.run(); });
    el.appendChild(b);
  }
  region.appendChild(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  setTimeout(() => el.remove(), action ? 7000 : 5000);
}
