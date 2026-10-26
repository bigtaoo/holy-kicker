import { Container, Graphics, Text } from 'pixi.js';
import { describe, expect, it } from 'vitest';
import { auditLayout, AUDIT_DEFAULTS, type AuditFinding, type AuditNode } from '../dev/layoutAudit';
import { t } from '../i18n';
import type { SaveData } from '../meta/save';
import { deviceWith, rigShell, tapNamed, tapWhenUp, type ShellRig } from '../testkit/testShell';
import { TAB_H, TOP_H } from './lobbyLayout';

// The layout sweep (build/layoutSweep.mjs) judges every screen in a real browser, but it needs a
// window and minutes, so it is not in check. This is its gate in check: the same auditor over the
// headless shell, at a short and a tall landscape window, a 4:3 tablet on its side and a phone.
// Text is measured by a fixed advance here, so only what does not hang on a font's widths is
// judged: panels off the frame, labels off the canvas or out of their panel, the tab bar's names
// clear of the window's edge, the monk in the clear on Gear, and Train filling the tab.

/** A mid-game player, as the sweep's SAVE_PATCH (chapters 1-5 cleared, coin to spend, nothing new to show), with Train's totals to show. */
const SAVE: Partial<SaveData> = {
  firstRunDone: true, level: 18, xp: 0, copper: 12000, jade: 450, chapter: 6, cleared: 5,
  stars: [3, 3, 3, 2, 2], runs: 46, seen: 31, kills: 25000, trained: 63,
};

const VIEWPORTS: [number, number][] = [[1280, 575], [1920, 1080], [1024, 768], [390, 844]];

/** Findings the fixed-advance text cannot cause: geometry of panels and the canvas. */
const JUDGED: AuditFinding['kind'][] = ['cutoff', 'offscreen', 'overflow', 'covered', 'placeholder'];

/** The tab bar's names keep this far, in design units, from the window's bottom edge (a browser's rounding or zoom). */
const TAB_NAME_CLEAR = 12;

/** The lobby panels the sweep opens alone (its PANELS), by the lobby's own fields. */
const PANELS: Record<string, (s: Lobby) => void> = {
  tasks: (s) => { s.openTab('play'); s.econ.tasksView = 'daily'; s.econ.modal = 'tasks'; },
  achievements: (s) => { s.openTab('play'); s.econ.tasksView = 'achieve'; s.econ.modal = 'tasks'; },
  patrol: (s) => { s.openTab('play'); s.econ.modal = 'patrol'; },
  gift: (s) => { s.openTab('play'); s.econ.modal = 'gift'; },
  monks: (s) => { s.openTab('play'); s.monksOpen = true; },
  settings: (s) => { s.openTab('play'); s.openSettings(); },
  account: (s) => { s.openTab('play'); s.settingsOpen = true; s.accountOpen = true; },
  'challenge.daily': (s) => { s.openTab('play'); s.challenge.open = true; s.challenge.tab = 'daily'; },
  'challenge.weekly': (s) => { s.openTab('play'); s.challenge.open = true; s.challenge.tab = 'weekly'; },
  'gear.detail': (s) => { s.openTab('gear'); s.gearOpen = 'robe'; },
};

/** The lobby's fields the sweep reaches into, as the page sees them. */
interface Lobby {
  view: Container;
  figure: { view: Container } | null;
  drift: { view: Container } | null;
  econ: { modal: string | null; tasksView: string };
  challenge: { open: boolean; tab: string };
  settingsOpen: boolean;
  accountOpen: boolean;
  monksOpen: boolean;
  gearOpen: string | null;
  openTab(tab: string): void;
  openSettings(): void;
  relayout(): void;
}

const lobbyOf = (rig: ShellRig) => (rig.shell as unknown as { screen: Lobby }).screen;
const uiOf = (rig: ShellRig) => (rig.shell as unknown as { ui: Container }).ui;

async function rigAt(w: number, h: number, query = '?challenge'): Promise<ShellRig> {
  const wide = w > h;
  const rig = await rigShell({ storage: deviceWith(SAVE), device: wide ? 'desktop' : 'mobile', sideways: wide, query });
  rig.app.renderer.screen.width = w;
  rig.app.renderer.screen.height = h;
  return rig;
}

/** What the auditor finds on screen now that text widths cannot cause, as readable lines. */
function judged(rig: ShellRig, scale: number): string[] {
  const { width, height } = rig.app.renderer.screen;
  const r = auditLayout(uiOf(rig) as unknown as AuditNode, width, height, { ...AUDIT_DEFAULTS, uiScale: scale, cssPerPx: 1 });
  return r.findings.filter((f) => JUDGED.includes(f.kind)).map((f) => `${f.kind} "${f.a}"`);
}

function reset(s: Lobby): void {
  s.settingsOpen = s.accountOpen = s.monksOpen = false;
  s.gearOpen = null;
  s.econ.modal = null;
  s.challenge.open = false;
}

async function show(rig: ShellRig, open: (s: Lobby) => void): Promise<Lobby> {
  const s = lobbyOf(rig);
  reset(s);
  open(s);
  s.relayout();
  await rig.tick(3);
  return s;
}

function leaves(c: Container, out: Container[] = []): Container[] {
  if (!c.visible || c.alpha <= 0.05) return out;
  if (!c.children.length) out.push(c);
  for (const k of c.children) leaves(k, out);
  return out;
}

/** The share of `a` that `b` covers. */
function overlap(a: { x: number; y: number; width: number; height: number }, b: typeof a): number {
  const w = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return (w * h) / Math.max(1, a.width * a.height);
}

/** The lobby's view children a tab drew: after the drift and the top bar, before the tab bar. */
function tabContent(s: Lobby): Container[] {
  const kids = s.view.children;
  const from = kids.indexOf(s.drift!.view) + 2;
  const to = kids.findIndex((k) => leaves(k).some((n) => n instanceof Text && n.text === t('tab.shop')));
  return kids.slice(from, to);
}

describe.each(VIEWPORTS)('the layout at %ix%i', (w, h) => {
  it('keeps every lobby tab and panel inside the frame', { timeout: 30_000 }, async () => {
    const rig = await rigAt(w, h);
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await rig.tick(2);
    const found: string[] = [];
    for (const tab of ['shop', 'gear', 'train', 'codex', 'play']) {
      const s = await show(rig, (l) => l.openTab(tab));
      found.push(...judged(rig, s.view.scale.x).map((f) => `lobby.${tab}: ${f}`));
    }
    for (const [name, open] of Object.entries(PANELS)) {
      const s = await show(rig, open);
      found.push(...judged(rig, s.view.scale.x).map((f) => `lobby.${name}: ${f}`));
    }
    expect(found).toEqual([]);
    expect(rig.faults).toEqual([]);
  });

  it("keeps the tab bar's names clear of the window's edge", { timeout: 30_000 }, async () => {
    const rig = await rigAt(w, h);
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    const s = await show(rig, (l) => l.openTab('play'));
    const bottom = rig.app.renderer.screen.height;
    for (const tab of ['shop', 'gear', 'play', 'train', 'codex']) {
      const name = leaves(s.view).find((n): n is Text => n instanceof Text && n.text === t(`tab.${tab}` as never))!;
      const b = name.getBounds();
      expect((bottom - (b.y + b.height)) / s.view.scale.x, `the ${tab} tab's name`).toBeGreaterThanOrEqual(TAB_NAME_CLEAR);
    }
  });

  it('keeps the monk on Gear clear of the panels around him', { timeout: 30_000 }, async () => {
    const rig = await rigAt(w, h);
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    const s = await show(rig, (l) => l.openTab('gear'));
    const monk = s.figure!.view.getBounds();
    // the stats card and the slots' faces: opaque fills drawn on the tab, not the monk's own parts
    const own = new Set(leaves(s.figure!.view));
    const panels = tabContent(s).flatMap((c) => leaves(c))
      .filter((n): n is Graphics => n instanceof Graphics && !own.has(n) && n.getBounds().width * n.getBounds().height > 0.05 * monk.width * monk.height);
    const worst = Math.max(0, ...panels.map((p) => overlap(monk, p.getBounds())));
    expect(worst, 'the monk covered by a panel').toBeLessThan(0.15);
  });

  it('fills the Train tab down to the tab bar', { timeout: 30_000 }, async () => {
    const rig = await rigAt(w, h);
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    const s = await show(rig, (l) => l.openTab('train'));
    const k = s.view.scale.x;
    const top = s.view.y + TOP_H * k;
    const floor = rig.app.renderer.screen.height - TAB_H * k;
    const boxes = tabContent(s).map((c) => c.getBounds());
    const low = Math.max(...boxes.map((b) => b.y + b.height));
    // what the tab leaves empty above the tab bar, as a share of the room it has: about 6% on a
    // 16:9 window and none on a phone, whose card sits on the tab bar; a 4:3 frame's board is held
    // by its width and leaves more
    const most = w > h && w / h < 1.5 ? 0.3 : 0.15;
    expect((floor - low) / (floor - top), 'the empty band above the tab bar').toBeLessThan(most);
  });

  it('keeps the run, its pause panel and its results inside the frame', { timeout: 30_000 }, async () => {
    const rig = await rigAt(w, h);
    await rig.shell.start();
    await rig.until(() => rig.shell.place() === 'lobby');
    await tapNamed(rig, 'play');
    await rig.until(() => rig.shell.place() === 'run');
    await rig.tick(30);
    const scale = () => (rig.shell as unknown as { screen: { view: Container } | null }).screen?.view.scale.x ?? 1;
    const found = judged(rig, scale()).map((f) => `run.hud: ${f}`);
    await tapNamed(rig, 'II');
    await rig.tick(3);
    found.push(...judged(rig, scale()).map((f) => `run.pause: ${f}`));
    await tapWhenUp(rig, 'run.giveUp');
    await tapWhenUp(rig, 'run.giveUpConfirm');
    await rig.until(() => rig.shell.place() === 'results');
    await rig.tick(30);
    found.push(...judged(rig, scale()).map((f) => `results: ${f}`));
    expect(found).toEqual([]);
    expect(rig.faults).toEqual([]);
  });
});
