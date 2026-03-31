/**
 * Loader — content script (isolated world) for Chrome and Firefox.
 *
 * Injects inject.js into the page's MAIN world. Tries external <script src>
 * first (cleanest), falls back to inline <script> if CSP blocks it.
 */

const ext = typeof browser !== "undefined" ? browser : chrome;

function injectViaScriptSrc() {
  return new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = ext.runtime.getURL("inject.js");
    script.onload = () => { script.remove(); resolve(true); };
    script.onerror = () => { script.remove(); resolve(false); };
    (document.documentElement || document.head || document.body).prepend(script);
  });
}

async function injectInline() {
  try {
    const url = ext.runtime.getURL("inject.js");
    const res = await fetch(url);
    const code = await res.text();
    const script = document.createElement("script");
    script.textContent = code;
    (document.documentElement || document.head || document.body).prepend(script);
    script.remove();
    return true;
  } catch {
    return false;
  }
}

(async () => {
  if (await injectViaScriptSrc()) return;
  // CSP blocked external script — try inline
  if (await injectInline()) return;
  console.warn("[linear-dev-toolbar] Failed to inject — CSP may be blocking both methods");
})();
