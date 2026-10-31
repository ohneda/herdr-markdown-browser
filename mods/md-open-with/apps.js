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

// Only a Markdown file goes to an app: not a link named *.md to a program or an app bundle
// (the default handler would run it), and nothing cmd would read as syntax. Resolves with
// { path } (what to open: the checked path itself) or { why }.
async function check(app, file) {
  if (window().platform !== "windows") {
    // Every byte of the resolved path: $(...) drops trailing newlines, so realpath's line
    // ends in a sentinel that comes off with exactly one newline.
    const r = await exec("sh", ["-c",
      'p=$(realpath -- "$1" && printf x) || exit 1; p=${p%x}; p=${p%?}; [ -f "$p" ] && printf %s "$p"',
      "md-open-with", file]);
    if (r.code !== 0 || /[\0-\x1f\x7f]/.test(r.stdout) || !/\.(md|mdx|markdown)$/i.test(r.stdout))
      return { why: "Not a Markdown file" };
    return { path: r.stdout };
  }
  // A program named without .exe may be a .cmd or .bat (npm's shims are), which cmd parses.
  if (app.argv && !/\.exe$/i.test(app.argv[0]) && /[&|^%<>()!"]/.test(file))
    return { why: "Name the program's .exe in config.json to open a file named like this" };
  return { path: file };
}

// Resolves with null, or why it couldn't open.
export async function openWith(app, file) {
  const { path, why } = await check(app, file).catch((e) => ({ why: String(e?.message ?? e) }));
  if (why) return why;
  const [cmd, args] = command(app, path);
  try {
    const r = await exec(cmd, args);
    return r.code === 0 ? null : (r.stderr.trim() || `${cmd} exited with ${r.code}`);
  } catch (e) {
    return String(e?.message ?? e);
  }
}
