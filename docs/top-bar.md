# A Markdown button in the top bar

Herdr's main layout has a **Files** and a **Changes** button at the right end of the tab bar,
each opening a side panel. These steps add **Markdown** beside them, opening the
`markdown-browser` panel in the same place, instead of its own column at the window's right
edge. They are written for the person's agent to follow; a person can follow them too.

You don't need them to use the mod: installed on its own, it docks a 300 px column at the
window's right edge (`mod.json` has `"place": "right"`). Herdr docks it once, into the layout
shown at install (usually `main`); after that the layouts decide. These steps put the panel in
the side panel of a clone of `main` instead; if the clone carries that docked column, step 3
deletes it there. The column stays in the layout it was docked into, so `ctrl-shift-l` back to
`main` still shows it.

Herdr's own layouts and mods are read-only (they're replaced on every start), so the button goes
into *clones* of the `main` layout and the `tabs` mod. This mod doesn't ship those clones: they'd
be frozen copies of Herdr's code. You make them from the version you have now.

What clones cost: they're yours and never updated. When a Herdr release changes the tab bar or
the main layout, the clones keep the old ones until you clone again and redo these steps.

**Already have clones?** If another mod's steps gave you a clone of `tabs` and of `main` (for
example git-graph's `tabs-graph` and `main-graph`), make these edits in those instead of making a
second pair: a layout has one tab bar.

## 1. Clone the tab bar and the layout

```sh
herdr-app do mod.clone '{"name":"tabs","as":"tabs-markdown"}'
herdr-app do layout.clone '{"name":"main","as":"main-markdown"}'
```

`layout.clone` switches the window to the clone.

## 2. Add the button: `mods/tabs-markdown/main.js`

Two edits. In Herdr 0.1.10 the lines read as below; in another version, find the same two places
(the list of enabled panels, and the Changes button).

The enabled panels decide which buttons show and which panel a space may reopen. Add
`"markdown"` to them. It goes in unconditionally, whatever panels the person picked on Herdr's
welcome screen (shared `"workspace.panels"` still decides Files and Changes): the clone exists
to show this button, and it is theirs to change.

```js
// before
const enabled = shared("workspace.panels") ?? ["files", "changes"];
// after
const enabled = [...(shared("workspace.panels") ?? ["files", "changes"]), "markdown"];
```

Then add the button right after the Changes one:

```js
      .when(enabled.includes("changes"), el => el.child(panelButton("changes", "Changes", "mods/changes/changes.svg")))
      .child(panelButton("markdown", "Markdown", "mods/markdown-browser/markdown.svg"))
```

## 3. Add the panel: `layouts/main-markdown.json`

- The node with `"id": "tabs"`: set its `content.mod` to `"tabs-markdown"`.
- The stack with `"id": "panel-body"` (it holds `files` and `changes`): append a third child:

  ```json
  { "id": "markdown", "type": "block", "content": { "mod": "markdown-browser" } }
  ```

- If the clone also has a block with `"content": { "mod": "markdown-browser" }` outside the
  panel (the column Herdr docked at the right edge when the mod was installed), delete that
  block, or the list shows twice.

## 4. A key for it (optional)

A key runs one command, and opening a panel takes two (select it, then show it). So give the tab
bar a command per panel that does what its button does. In `mods/tabs-markdown/main.js`, add
`nextCommand` to the import from `"herdr"`, then make `init` listen for key commands and add
`togglePanel` below it:

```js
  init(_props, cx) {
    this.pressed = null;
    this.panels = JSON.parse(localStorage.getItem("panels") ?? "{}");
    // A key opens a panel as its button does: "cmd-shift-m": "tabs-markdown.markdown" in keys.json.
    cx.spawn(async (cx) => { for (;;) { this.togglePanel(await nextCommand()); cx.notify(); } });
  }

  togglePanel(id) {
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    if (!panel || !body?.children?.some((c) => c.id === id)) return;
    if (!panel.hidden && body.active === id) run("layout.hide", { id: "panel" });
    else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
  }
```

And the buttons use it too: in `panelButton`, the `on_click` that hides or shows the panel
becomes `.on_click(() => this.togglePanel(id))`. (If your clone already has `togglePanel` from
another mod's steps, skip this step's code: it works for `markdown` as it is.)

Then bind the key in `keys.json`, in a section for this layout only (the person's other layouts
don't have this tab bar):

```json
"layout:main-markdown": { "cmd-shift-m": "tabs-markdown.markdown" }
```

`tabs-markdown.files` and `tabs-markdown.changes` open those panels the same way. Each opens its
panel, switches the open panel to it, or closes it when it's already showing. Ask before taking a
key the person already uses, and avoid plain ctrl+letters: terminal programs use them.

## 5. Check

```sh
herdr-app check ~/.config/herdr-app/mods/tabs-markdown
herdr-app check ~/.config/herdr-app/mods/markdown-browser
herdr-app status          # "errors": [] and "layout": "main-markdown"
```

Click **Markdown** in the top bar (or press the key). If the window doesn't show your edits,
switch layouts away and back (`ctrl-shift-l` twice): a copy that was reloaded while open can keep
drawing its old frame.

## Going back

`ctrl-shift-l` switches back to Herdr's `main`. Deleting `layouts/main-markdown.json` and
`mods/tabs-markdown/` removes the clones; if you added the key, remove the
`layout:main-markdown` section from `keys.json` too. `mods/markdown-browser/` keeps working on
its own, in the column Herdr docked into the layout shown at install.
