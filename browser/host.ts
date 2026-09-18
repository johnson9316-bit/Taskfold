// Holds the active `ControlUiHost` for this plugin instance so the rest of
// `browser/` can reach it (gateway calls, locale) without threading it
// through every call site. Mirrors the shape of upstream's
// `extensions/workboard/browser/host.ts` for openclaw@2026.9.4 native Control
// UI plugins (see `需求/15.9-ControlUI注入调查.md` Q3/Q4).
import type { ControlUiHost } from "openclaw/plugin-sdk/control-ui";

let activeHost: ControlUiHost | undefined;

export function bindTaskfoldHost(host: ControlUiHost): () => void {
  activeHost = host;
  return () => {
    if (activeHost === host) {
      activeHost = undefined;
    }
  };
}

/**
 * The live host handed to `activate()`. Throws once the plugin has been
 * deactivated (host aborts `signal` on teardown) so a stray in-flight
 * callback fails loudly instead of touching a stale host.
 */
export function taskfoldHost(): ControlUiHost {
  if (!activeHost || activeHost.signal.aborted) {
    throw new Error("Taskfold is no longer active. Reload the plugin to continue.");
  }
  return activeHost;
}
