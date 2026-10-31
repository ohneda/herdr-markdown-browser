// The apps a Markdown file can be handed to, from config.json beside this file.
// { "macos": [ {label, app} | {label, argv} | {label, default: true} ], "windows": [...], "linux": [...] }
// Without one for this platform: the system's default app.
import { exec, readTextFile, appHome, window } from "herdr";

const CONFIG = "mods/md-open-with/config.json";
const SYSTEM = { label: "Default app", default: true };

// Where to look and what went wrong, kept until the mod reloads (saving config.json reloads it).
let loaded = null;

export async function loadApps() {
  if (loaded) return loaded;
  const platform = window().platform;
  try {
    const text = await readTextFile(`${appHome()}/${CONFIG}`);
    if (text === null) return (loaded = { apps: [SYSTEM], error: null });
    const list = JSON.parse(text)?.[platform];
    if (list === undefined) return (loaded = { apps: [SYSTEM], error: null });
    if (!Array.isArray(list)) throw new Error(`"${platform}" must be a list`);
    const apps = list.map((a, i) => {
      if (typeof a?.label !== "string" || !a.label) throw new Error(`${platform}[${i}]: "label" is missing`);
      if (a.default === true) return { label: a.label, default: true };
      if (typeof a.app === "string" && a.app) {
        if (platform !== "macos") throw new Error(`${platform}[${i}]: "app" is macOS only; use "argv"`);
        return { label: a.label, app: a.app };
      }
      if (Array.isArray(a.argv) && a.argv.length && a.argv.every((s) => typeof s === "string"))
        return { label: a.label, argv: a.argv };
      throw new Error(`${platform}[${i}]: give "app", "argv" or "default": true`);
    });
    return (loaded = { apps: apps.length ? apps : [SYSTEM], error: null });
  } catch (e) {
    return (loaded = { apps: [SYSTEM], error: `${CONFIG}: ${e?.message ?? e}` });
  }
}

function command(app, file) {
  if (app.argv) {
    const argv = app.argv.some((s) => s.includes("{file}"))
      ? app.argv.map((s) => s.replaceAll("{file}", file))
      : [...app.argv, file];
    return [argv[0], argv.slice(1)];
  }
  switch (window().platform) {
    case "macos": return ["open", app.app ? ["-a", app.app, file] : [file]];
    // start would need cmd's quoting; explorer.exe exits 1 even when it opened the file.
    case "windows": return ["rundll32", ["url.dll,FileProtocolHandler", file]];
    default: return ["xdg-open", [file]];
  }
}

// Resolves with null, or why it couldn't open.
export async function openWith(app, file) {
  const [cmd, args] = command(app, file);
  try {
    const r = await exec(cmd, args);
    return r.code === 0 ? null : (r.stderr.trim() || `${cmd} exited with ${r.code}`);
  } catch (e) {
    return String(e?.message ?? e);
  }
}
