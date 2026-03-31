/**
 * Linear Dev Toolbar Unlock — injected into the page's MAIN world.
 *
 * Bypasses the toolbar visibility gate by making the superuser checks
 * always pass. The gate is:
 *
 *   isSuperuser():
 *     if (guest && !developerUserRoleOverrideValue) return false
 *     if (!superUserDomains.includes(user.domain)) return false
 *     if (isEnabled(globalSuperuser)) return true
 *     return superUserUrlKeys.includes(org.urlKey)
 *
 *   isSuperuserWorkspace():
 *     return superUserUrlKeys.includes(org.urlKey)
 *
 *   visible = (isSuperuserWorkspace && isSuperuser) && developerToolbarVisible
 */

(function () {
  "use strict";

  const LABEL = "[linear-dev-toolbar]";

  // -----------------------------------------------------------------------
  // 1. Patch Array.prototype.includes
  //
  // The superuser checks call .includes() on two static arrays:
  //   superUserDomains  = ["linear.app", "artman.fi", "eldh.co"]
  //   superUserUrlKeys  = ["linear", "linear-xl"]
  //
  // We fingerprint these arrays by their contents on first encounter,
  // cache them in a WeakSet, and return true for all future calls.
  // -----------------------------------------------------------------------

  const origIncludes = Array.prototype.includes;
  const knownSuperArrays = new WeakSet();

  function identifySuperArray(arr) {
    if (knownSuperArrays.has(arr)) return true;
    if (arr.length < 1 || arr.length > 10) return false;
    if (typeof arr[0] !== "string") return false;

    const isDomains =
      origIncludes.call(arr, "linear.app") &&
      origIncludes.call(arr, "eldh.co");
    const isUrlKeys =
      origIncludes.call(arr, "linear") &&
      origIncludes.call(arr, "linear-xl");

    if (isDomains || isUrlKeys) {
      knownSuperArrays.add(arr);
      console.log(
        LABEL,
        isDomains ? "Identified superUserDomains" : "Identified superUserUrlKeys",
        `[${arr.join(", ")}]`
      );
      return true;
    }
    return false;
  }

  Array.prototype.includes = function (searchElement, fromIndex) {
    if (typeof searchElement === "string" && identifySuperArray(this)) {
      return true;
    }
    return origIncludes.call(this, searchElement, fromIndex);
  };

  // -----------------------------------------------------------------------
  // 2. Patch Object.defineProperty for MobX computed getters
  //
  // MobX sets up computed properties via defineProperty. We intercept
  // specific boolean getters to force them true, covering the guest check
  // and any other gating properties.
  // -----------------------------------------------------------------------

  const FORCE_TRUE_GETTERS = new Set([
    "isSuperuser",
    "isSuperuserWorkspace",
  ]);

  const origDefineProperty = Object.defineProperty;
  const patchedProps = new Set();

  Object.defineProperty = function (obj, prop, descriptor) {
    if (typeof prop === "string" && FORCE_TRUE_GETTERS.has(prop) && descriptor && "get" in descriptor) {
      descriptor = { ...descriptor, get() { return true; } };
      if (!patchedProps.has(prop)) {
        patchedProps.add(prop);
        console.log(LABEL, `Patched MobX computed getter: ${prop} → true`);
      }
    }
    return origDefineProperty.call(this, obj, prop, descriptor);
  };
  Object.defineProperty.toString = origDefineProperty.toString.bind(origDefineProperty);

  // -----------------------------------------------------------------------
  // 3. Feature flags — set in localStorage and guard against server re-sync
  // -----------------------------------------------------------------------

  const FLAG_KEY = "FeatureFlagsOverrides";
  const FLAGS_TO_ENABLE = ["global-superuser", "showDeveloperToolbarForGuest"];

  function ensureFeatureFlags() {
    try {
      const raw = localStorage.getItem(FLAG_KEY);
      const overrides = raw ? JSON.parse(raw) : {};
      let changed = false;
      for (const flag of FLAGS_TO_ENABLE) {
        if (!overrides[flag]) {
          overrides[flag] = true;
          changed = true;
        }
      }
      if (changed) {
        localStorage.setItem(FLAG_KEY, JSON.stringify(overrides));
        console.log(LABEL, "Feature flag overrides set:", FLAGS_TO_ENABLE.join(", "));
      }
    } catch {}
  }

  ensureFeatureFlags();

  // Re-apply periodically in case the app overwrites them from server sync
  const flagInterval = setInterval(() => {
    ensureFeatureFlags();
  }, 5000);

  // Stop after 2 minutes — the app is fully loaded by then
  setTimeout(() => clearInterval(flagInterval), 120000);

  // Also intercept localStorage.setItem to prevent the app from clearing our overrides
  const origSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function (key, value) {
    if (key === FLAG_KEY && typeof value === "string") {
      try {
        const data = JSON.parse(value);
        let patched = false;
        for (const flag of FLAGS_TO_ENABLE) {
          if (!data[flag]) {
            data[flag] = true;
            patched = true;
          }
        }
        if (patched) {
          value = JSON.stringify(data);
        }
      } catch {}
    }
    return origSetItem.call(this, key, value);
  };

  // -----------------------------------------------------------------------
  // 4. Ensure toolbar settings are enabled
  // -----------------------------------------------------------------------

  for (const key of ["userSettings", "defaultUserSettings"]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const data = JSON.parse(raw);
      if (data && typeof data === "object" && "developerToolbarVisible" in data) {
        if (!data.developerToolbarVisible) {
          data.developerToolbarVisible = true;
          origSetItem.call(localStorage, key, JSON.stringify(data));
          console.log(LABEL, `Set ${key}.developerToolbarVisible = true`);
        }
      }
    } catch {}
  }

  console.log(LABEL, "Loaded");
})();
