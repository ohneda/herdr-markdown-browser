# md-browser

A [Herdr](https://herdr.dev) mod: find the Markdown files you're working on, preview them in a
pane, and open them in your system's default app for Markdown, on macOS, Windows and Linux.

- **Markdown panel**: the `.md` / `.mdx` / `.markdown` files around the focused pane: its git
  repo's (tracked and untracked, not ignored), else up to four levels of its folder (hidden
  folders, `node_modules` and a home's `Library` skipped). It follows the focused terminal
  (focusing a preview keeps the list) and updates when a Markdown file is added or removed.
  Click a file to show it in the tab's preview pane (the focused one, else the one focused
  last; a new one if the tab has none). Right-click for *Preview in new pane* and
  *Open in Default app*.
- **Preview pane**: renders the file, reloads when it changes, hides front matter. Its header
  has a *Default app* button.
- **Key**: open the focused preview in the default app.

The default app is whatever the system opens `.md` files with: `open` on macOS,
`rundll32 url.dll,FileProtocolHandler` on Windows, `xdg-open` on Linux. To use Marked, Typora
or another app, make it the default for `.md` files in your system's settings. On macOS and
Linux, only a regular Markdown file is handed over, not a `*.md` link to a program.

Files on another machine can be listed and previewed (the list refreshes every 10 s), but not
handed to the default app: it runs on this computer.

## Install

Copy `mods/md-browser/` to `~/.config/herdr-app/mods/`, then:

```sh
herdr-app check ~/.config/herdr-app/mods/md-browser
```

The first time Herdr sees the folder, it docks the Markdown panel at the right edge of the
shown layout, 300 px wide. After that your layout decides: drag its edge to resize it, or move
the block in `layouts/<name>.json` (it's the block with `"content": { "mod": "md-browser" }`).

To show and hide it with a key, give that block an `"id"` (say `"markdown"`; on a shipped
layout, clone it first: `herdr-app do layout.clone '{"name":"main","as":"my-main"}'`) and bind
`layout.toggle` in `~/.config/herdr-app/keys.json`:

```json
{ "global": { "cmd-shift-m": "layout.toggle:markdown" } }
```

## Key

In `~/.config/herdr-app/keys.json`:

```json
{ "mod:md-browser": { "cmd-shift-o": "md-browser.open" } }
```

With a preview pane focused, the key opens its file in the default app.

## Open a preview from a shell

```sh
herdr-app do pane.split '{"direction":"right","mod":"md-browser","props":{"file":"/path/to/README.md"}}'
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
     // 12 + 32 per item: Preview in new pane, Open in Default app.
     openOverlay({ mod: "md-browser", kind: "popup", height: 12 + 32 * 2, props: { file: `${this.root}/${path}`, on: this.on } });
   }))
   ```

3. In your (cloned) layout, change `"mod": "files"` to `"mod": "my-files"`.
4. `herdr-app check ~/.config/herdr-app/mods/my-files`
