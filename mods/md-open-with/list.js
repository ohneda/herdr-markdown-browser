// The Markdown files around the focused pane: its git repo's (tracked and untracked, not
// ignored), else up to four levels of its folder, skipping hidden folders, node_modules and
// a home's Library.
import { spaces, panes, focused, exec, window } from "herdr";

export const MARKDOWN = /\.(md|mdx|markdown)$/i;
export const LIMIT = 2000;

// Where the Files panel looks: the focused pane's folder, on its machine. A mod pane (a preview)
// has none: then its tab's first terminal, `weak` (the list keeps what it shows).
export function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  if (pane && !pane.terminal) {
    const shell = panes().find((p) => p.tab === pane.tab && p.terminal && p.cwd);
    return { cwd: shell?.cwd || space?.folder || null, on, weak: true };
  }
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on, weak: false };
}

// Resolves with { root, files: [paths relative to root, sorted] }.
export async function markdownFiles(cwd, on) {
  const top = await exec("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { on }).catch(() => null);
  if (top?.code === 0) {
    const root = top.stdout.trim();
    const r = await exec("git", ["-C", root, "ls-files", "-z", "--cached", "--others", "--exclude-standard", "--",
      ":(icase)*.md", ":(icase)*.mdx", ":(icase)*.markdown"], { on });
    if (r.code !== 0) throw new Error(r.stderr.trim() || "git ls-files failed");
    return { root, files: [...new Set(r.stdout.split("\0").filter(Boolean))].sort(byFolder) };
  }
  let r;
  if (!on && window().platform === "windows") {
    r = await exec("powershell", ["-NoProfile", "-Command",
      "& { param($p) Get-ChildItem -LiteralPath $p -Recurse -Depth 3 -File -Include *.md,*.mdx,*.markdown -ErrorAction SilentlyContinue | Where-Object { $_.FullName.Substring($p.Length) -notmatch '[\\\\/](node_modules|\\.[^\\\\/]+)[\\\\/]' } | ForEach-Object { $_.FullName } }",
      cwd]);
  } else {
    r = await exec("find", [cwd, "-mindepth", "1", "-maxdepth", "4",
      "-type", "d", "(", "-name", "node_modules", "-o", "-name", ".*", "-o", "-path", `${cwd}/Library`, ")", "-prune", "-o",
      "-type", "f", "(", "-iname", "*.md", "-o", "-iname", "*.mdx", "-o", "-iname", "*.markdown", ")", "-print0"], { on });
  }
  // find exits 1 when some folders can't be read; what it found still counts.
  if (r.code !== 0 && !r.stdout) throw new Error(r.stderr.trim() || "Cannot list this folder");
  // NUL-separated from find (a name may hold a newline; Windows names can't).
  const files = r.stdout.split(r.stdout.includes("\0") ? "\0" : /\r?\n/).filter((p) => p.startsWith(cwd) && /^[\\/]/.test(p.slice(cwd.length)) && MARKDOWN.test(p))
    .map((p) => p.slice(cwd.length + 1));
  return { root: cwd, files: files.sort(byFolder) };
}

// Top-level files first, then folder by folder.
function byFolder(a, b) {
  const da = a.includes("/") || a.includes("\\"), db = b.includes("/") || b.includes("\\");
  return Number(da) - Number(db) || a.localeCompare(b);
}
