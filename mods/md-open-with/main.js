// Markdown files, three ways, by props:
// - { file, on }: the file rendered as a pane, reloaded when it changes, with buttons that hand
//   it to the apps in config.json (on: the machine it lives on, null for this one).
// - { file, on, overlay }: the file's right-click menu, as a popup.
// - nothing: a panel listing the Markdown files around the focused pane (see list.js).
import { View, div } from "gpui-kit";
import { v_flex, h_flex, TextView } from "gpui-base";
import { props, readTextFile, watchFolder, theme, panes, focused, run, notify, openOverlay, closeOverlay, nextCommand, shared, setShared } from "herdr";
import { loadApps, openWith } from "./apps.js";
import { MARKDOWN, LIMIT, location, markdownFiles } from "./list.js";

// Front matter, and in MDX the top-level import/export lines: not prose.
// Previews opened from the list: { pane id: slot }, and what each slot shows now
// ({ slot: { file, on } }; without one, its props' file).
const SLOTS = "md-open-with.slots";
const SHOW = "md-open-with.show";
// The preview pane focused last: a click in the list shows its file there.
const LAST = "md-open-with.last";
const shown = (slot) => (slot && shared(SHOW)?.[slot]) || null;

function prose(text, file) {
  let s = text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, "");
  if (/\.mdx$/i.test(file)) s = s.replace(/^(import|export)\s.*$/gm, "");
  return s;
}

export default class MdOpenWith extends View {
  init(_props, cx) {
    const { file, on, overlay } = props() ?? {};
    this.file = file ?? null;
    this.on = on ?? null;
    this.overlay = overlay ?? null;
    this.apps = [];
    cx.spawn(async (cx) => {
      const { apps, error } = await loadApps();
      this.apps = apps;
      if (error && this.file && !this.overlay) notify({ title: "md-open-with", body: error, level: "warning" });
      cx.notify();
    });
    if (this.overlay) return;
    if (!this.file) return this.initList(cx);

    // Opened from the list: its slot, which shared SHOW can point at another file.
    this.slot = props().slot ?? null;
    this.show(shown(this.slot) ?? { file: this.file, on: this.on }, cx);
    // watchFolder only sees this machine: another's, look again now and then.
    cx.timer.every(3000, (cx) => { if (this.on) this.load(cx); });
    // "md-open-with.open" in keys.json: the first app. It reaches every shown copy; the focused one acts.
    cx.spawn(async () => {
      for (;;) {
        const c = await nextCommand();
        if (c === "open" && !this.on && this.focused() && this.apps[0]) this.open(this.apps[0]);
      }
    });
  }

  // A pane doesn't know its id; the list recorded it for this copy's slot.
  paneId() {
    return this.slot ? Object.entries(shared(SLOTS) ?? {}).find(([, slot]) => slot === this.slot)?.[0] ?? null : null;
  }

  focused() {
    const pane = this.paneId();
    return pane ? panes().find((p) => p.pane === pane)?.focused : panes().some((p) => p.mod === "md-open-with" && p.focused);
  }

  // Show this file from now on, and watch it.
  show({ file, on }, cx) {
    this.file = file;
    this.on = on ?? null;
    this.text = null;
    this.error = null;
    this.load(cx);
    const watching = (this.watching = { file });
    if (this.on) return;
    const dir = file.replace(/[\\/][^\\/]*$/, "") || "/";
    cx.spawn(async (cx) => {
      while (this.watching === watching) {
        const changed = await watchFolder(dir);
        if (this.watching === watching && changed.includes(file)) this.load(cx);
      }
    });
  }

  load(cx) {
    const file = this.file;
    cx.spawn(async (cx) => {
      try {
        const text = await readTextFile(file, { on: this.on });
        if (this.file !== file) return;
        if (text === null) { this.error = "File not found"; return; }
        if (text === this.text) return;
        this.text = text;
        this.error = null;
      } catch (e) {
        this.error = String(e?.message ?? e);
      } finally {
        cx.notify();
      }
    });
  }

  // A popup closes only once the app is asked: closing it ends its tasks, and openWith checks
  // the file before it starts the app.
  open(app, file = this.file) {
    openWith(app, file).then((why) => {
      if (why) notify({ title: `Can't open in ${app.label}`, body: why, level: "error" });
      if (this.overlay) closeOverlay(this.overlay);
    });
  }

  // Shows the file in the tab's preview: the focused one, else the one focused last, else any;
  // with `newPane`, or without one, in a new pane. One opened from here has a slot: shared SHOW
  // points it at the next file, in place. Others (opened from a shell) can't change: a new one
  // opens beside it and takes its place. A closed pane's room goes to the pane before it, so
  // the new one swaps to the left first; else each replacement halves it. run() doesn't wait,
  // so each step waits to see the last one land. Resolves when done (a popup closes only then:
  // closing it ends its tasks).
  async preview(file, on, cx, newPane = false) {
    const tab = focused()?.tab;
    const previews = panes().filter((p) => p.tab === tab && p.mod === "md-open-with");
    const old = newPane ? null
      : previews.find((p) => p.focused) ?? previews.find((p) => p.pane === shared(LAST)) ?? previews[0];
    const slot = old && shared(SLOTS)?.[old.pane];
    if (slot) return setShared(SHOW, { ...(shared(SHOW) ?? {}), [slot]: { file, on } });

    const before = new Set(panes().map((p) => p.pane));
    const fresh = { slot: Math.random().toString(36).slice(2, 10) + Date.now().toString(36) };
    run("pane.split", { direction: "right", pane: old?.pane, mod: "md-open-with", props: { file, on, slot: fresh.slot } });
    const until = async (test) => {
      for (let i = 0; i < 40; i++) { if (test()) return true; await cx.sleep(25); }
      return false;
    };
    if (!await until(() => (fresh.pane = panes().find((p) => !before.has(p.pane) && p.tab === tab && p.mod === "md-open-with")?.pane))) return;
    // Record the new pane's slot, forgetting closed panes'.
    const alive = new Set(panes().map((p) => p.pane));
    const slots = Object.fromEntries(Object.entries(shared(SLOTS) ?? {}).filter(([pane]) => alive.has(pane)));
    slots[fresh.pane] = fresh.slot;
    const kept = new Set(Object.values(slots));
    setShared(SLOTS, slots);
    setShared(SHOW, Object.fromEntries(Object.entries(shared(SHOW) ?? {}).filter(([s]) => kept.has(s))));
    if (!old) return;
    run("pane.focus", { pane: fresh.pane });
    if (!await until(() => focused()?.pane === fresh.pane)) return;
    run("pane.swap", { direction: "left" });
    run("pane.close", { pane: old.pane });
  }

  // The list follows the focused pane; it rereads when a Markdown file under it changes
  // (another machine's: every 10 s).
  initList(cx) {
    this.context = undefined;
    this.refreshList(cx);
    cx.timer.every(10000, (cx) => { if (this.on) this.refreshList(cx); });
  }

  // Focusing a preview keeps the list; only a first look takes the preview's tab's folder.
  where() {
    const here = location();
    return here.weak && this.cwd ? { cwd: this.cwd, on: this.on } : here;
  }

  refreshList(cx) {
    const { cwd, on } = this.where(), context = JSON.stringify([cwd, on]);
    if (context !== this.context) {
      this.context = context; this.cwd = cwd; this.on = on;
      this.root = null; this.files = []; this.listError = null; this.loading = false; this.watching = null;
    }
    if (!cwd || this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const { root, files } = await markdownFiles(cwd, on);
        if (this.context !== context) return;
        this.root = root; this.files = files; this.listError = null;
        if (!on) this.watch(root, cx);
      } catch (e) {
        if (this.context === context) this.listError = String(e?.message ?? e);
      } finally {
        if (this.context === context) this.loading = false;
        cx.notify();
      }
    });
  }

  watch(root, cx) {
    if (this.watching?.root === root) return;
    const watching = (this.watching = { root });
    cx.spawn(async (cx) => {
      try {
        while (this.watching === watching) {
          const changed = await watchFolder(root);
          if (this.watching === watching && changed.some((p) => MARKDOWN.test(p))) this.refreshList(cx);
        }
      } catch {
        if (this.watching === watching) this.watching = null;
      }
    });
  }

  render(cx) {
    if (this.overlay) return this.menu();
    if (this.file) {
      const want = shown(this.slot);
      if (want && (want.file !== this.file || (want.on ?? null) !== this.on)) this.show(want, cx);
      const pane = this.paneId();
      if (pane && shared(LAST) !== pane && panes().find((p) => p.pane === pane)?.focused) setShared(LAST, pane);
      return this.pane();
    }
    const { cwd, on } = this.where();
    if (JSON.stringify([cwd, on]) !== this.context) this.refreshList(cx);
    return this.list();
  }

  menu() {
    const t = theme();
    // Apps only reach this machine's files.
    const away = this.on ? " (other machine)" : "";
    const item = (id, label, enabled, action) =>
      div().id(id).h(28).px(10).flex().items_center().rounded(6).truncate()
        .when(enabled, (el) => el.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(action))
        .when(!enabled, (el) => el.text_color(t.dim))
        .child(label);
    return v_flex().w_full().p(4).gap(4).bg(t.popover).text_color(t.foreground).text_size(12.5)
      .child(item("mow-preview", "Preview in new pane", true, (_e, cx) => {
        cx.spawn(async (cx) => {
          await this.preview(this.file, this.on, cx, true);
          closeOverlay(this.overlay);
        });
      }))
      .children(this.apps.map((app, i) =>
        item(`mow-app-${i}`, `Open in ${app.label}${away}`, !this.on, () => this.open(app))));
  }

  pane() {
    const t = theme();
    const name = this.file.split(/[\\/]/).pop();
    return v_flex().id("md-open-with").size_full().min_h(0).bg(t.background).text_color(t.foreground)
      .child(h_flex().h(32).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border).text_size(12)
        .child(div().font_semibold().truncate().child(name))
        .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(this.on ? `${this.on}:${this.file}` : this.file))
        .when(!this.on, (el) => el.children(this.apps.map((app, i) =>
          div().id(`mow-open-${i}`).flex_none().px(8).py(2).rounded(5).text_color(t.muted).cursor_pointer()
            .hover((s) => s.bg(t.hover).text_color(t.foreground))
            .on_click(() => this.open(app))
            .child(app.label)))))
      .child(this.error
        ? div().p(16).text_size(12.5).text_color(t.dim).child(this.error)
        : this.text === null
          ? div().p(16).text_size(12.5).text_color(t.dim).child("Loading…")
          : div().flex_1().min_h(0).px(20).py(14).text_size(14)
            .child(TextView.markdown(`md-body-${this.file}`, prose(this.text, this.file)).scrollable(true).selectable(true).size_full()));
  }

  list() {
    const t = theme();
    // The popup's height: 12 + 32 per item (Preview, then the apps).
    const height = 12 + 32 * (1 + this.apps.length);
    const rows = this.files.slice(0, LIMIT).map((rel) => {
      const cut = Math.max(rel.lastIndexOf("/"), rel.lastIndexOf("\\"));
      const file = `${this.root}/${rel}`;
      return h_flex().id(`mow-file-${rel}`).h(28).flex_none().px(8).gap(8).items_center().rounded(7).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => cx.spawn((cx) => this.preview(file, this.on, cx)))
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({ mod: "md-open-with", kind: "popup", height, props: { file, on: this.on } });
        })
        .child(div().min_w(0).truncate().child(rel.slice(cut + 1)))
        .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(cut < 0 ? "" : rel.slice(0, cut)));
    });
    const empty = this.listError || (this.loading && !this.files.length ? "Loading…"
      : !this.cwd ? "No folder" : !this.files.length ? "No Markdown files" : null);
    return v_flex().id("md-open-with-list").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Markdown"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim)
          .child(this.root?.split(/[\\/]/).pop() ?? "")))
      .child(v_flex().id("mow-files").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(rows)
        .when(Boolean(empty), (el) => el.child(div().p(8).text_size(12).text_color(t.dim).child(empty)))
        .when(this.files.length > LIMIT, (el) => el.child(div().p(8).text_size(11).text_color(t.dim)
          .child(`Showing the first ${LIMIT} of ${this.files.length} files`))));
  }
}
