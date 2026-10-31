# md-open-with

A [Herdr](https://herdr.dev) mod: find the Markdown files you're working on, preview them in a
pane, and open them in the app you choose (Marked 2, Typora, Obsidian, your system's
default…) on macOS, Windows and Linux.

- **Markdown panel**: the `.md` / `.mdx` / `.markdown` files around the focused pane: its git
  repo's (tracked and untracked, not ignored), else up to four levels of its folder (hidden
  folders, `node_modules` and a home's `Library` skipped). It follows the focused terminal
  (focusing a preview keeps the list) and updates when a Markdown file is added or removed. Click a file to preview it: a tab
  has one preview pane, and the next file replaces it. Right-click for *Preview* and
  *Open in &lt;app&gt;*.
- **Preview pane**: renders the file, reloads when it changes, hides front matter. Its header
  has one button per configured app.
- **Key**: open the focused preview in the first configured app.

Files on another machine can be listed and previewed (the list refreshes every 10 s), but not
handed to an app: apps run on this computer.

## Install

Copy `mods/md-open-with/` to `~/.config/herdr-app/mods/`, then:

```sh
herdr-app check ~/.config/herdr-app/mods/md-open-with
```

The first time Herdr sees the folder, it docks the Markdown panel at the right edge of the
shown layout, 300 px wide. After that your layout decides: drag its edge to resize it, or move
the block in `layouts/<name>.json` (it's the block with `"content": { "mod": "md-open-with" }`).

To show and hide it with a key, give that block an `"id"` (say `"markdown"`; on a shipped
layout, clone it first: `herdr-app do layout.clone '{"name":"main","as":"my-main"}'`) and bind
`layout.toggle` in `~/.config/herdr-app/keys.json`:

```json
{ "global": { "cmd-shift-m": "layout.toggle:markdown" } }
```

## Choose the apps: `config.json`

Copy `config.example.json` to `config.json` in the same folder and edit it. Each platform
(`macos`, `windows`, `linux`) has a list; every entry becomes a button and a menu item.

```json
{
  "macos":   [ { "label": "Marked 2", "app": "Marked 2" } ],
  "windows": [ { "label": "Typora", "argv": ["C:\\Program Files\\Typora\\Typora.exe", "{file}"] } ],
  "linux":   [ { "label": "Typora", "argv": ["typora", "{file}"] },
               { "label": "Default app", "default": true } ]
}
```

| Entry | Runs | Where |
|---|---|---|
| `"app": "Marked 2"` | `open -a "Marked 2" <file>` | macOS |
| `"argv": ["typora", "{file}"]` | that program; `{file}` becomes the path (appended if absent) | all |
| `"default": true` | `open` / `rundll32 url.dll,FileProtocolHandler` / `xdg-open` | all |

Without `config.json`, or without a list for this platform, there is one entry: the system's
default app. Saving `config.json` applies at once. A mistake in it shows a warning when a
preview opens and falls back to the default app.

## Key

In `~/.config/herdr-app/keys.json`:

```json
{ "mod:md-open-with": { "cmd-shift-o": "md-open-with.open" } }
```

With a preview pane focused, the key opens its file in the first app of `config.json`.

## Open a preview from a shell

```sh
herdr-app do pane.split '{"direction":"right","mod":"md-open-with","props":{"file":"/path/to/README.md"}}'
```

## Optional: right-click in the Files panel

Herdr's Files panel has no right-click menu, and shipped mods are read-only. If you'd rather
start from the Files panel, add one to a copy of it. The copy is yours and isn't updated with
Herdr: to pick up a newer Files panel, clone it again and repeat step 2.

1. `herdr-app do mod.clone '{"name":"files","as":"my-files"}'`
2. In `~/.config/herdr-app/mods/my-files/main.js`, add `openOverlay` to the `herdr` import,
   and in `rows()`, right after the file row's `.on_click(...)`, add:

   ```js
   .when(!entry.dir && /\.(md|mdx|markdown)$/i.test(entry.name), el => el.on_mouse_down("right", (_e, cx) => {
     cx.stop_propagation();
     // 12 + 32 per item: Preview, then one per app in config.json (here 2).
     openOverlay({ mod: "md-open-with", kind: "popup", height: 12 + 32 * 3, props: { file: `${this.root}/${path}`, on: this.on } });
   }))
   ```

3. In your (cloned) layout, change `"mod": "files"` to `"mod": "my-files"`.
4. `herdr-app check ~/.config/herdr-app/mods/my-files`
