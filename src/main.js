// App bootstrap: loads the airway tree, wires scope + views + input + modes.
import { loadAirwayTree } from './anatomy/index.js';
import { Scope } from './sim/scope.js';
import { ScopeView } from './render/scopeView.js';
import { Overview } from './render/overview.js';
import { Hud } from './ui/hud.js';
import { store, el } from './ui/dom.js';
import { ExploreMode } from './modes/explore.js';
import { QuizMode } from './modes/quiz.js';
import { NavigateMode } from './modes/navigate.js';
import { RoboticMode } from './modes/robotic.js';
import { nearbyStations } from './anatomy/lymphNodes.js';
import { initLearn } from './learn/learn.js';
import { initBoba } from './ui/boba.js';
import { startTour } from './ui/tour.js';
import { loadCtLayer } from './ct/ctLayer.js';
import { Guidance } from './guidance/guidance.js';
import { Compass } from './ui/compass.js';
import { renderAbout } from './pages/about.js';
import { MODEL_HTML } from './pages/model.js';

const $ = (id) => document.getElementById(id);

// ?anatomy=<url> loads an airway-tree JSON instead of the procedural tree (see README).
const params = new URLSearchParams(location.search);
const tree = await loadAirwayTree(params.get('anatomy') ? { source: 'json', url: params.get('anatomy') } : {});

const scope = new Scope(tree);
const scopeView = new ScopeView($('scopeMount'), tree);
const card = $('nodeCard');
const overview = new Overview($('overviewMount'), $('overviewLabels'), tree, {
  onStation(st) {
    card.hidden = !st;
    if (st) card.replaceChildren(el('h4', {}, `Station ${st.id} · ${st.name}`), el('span', { class: 'acc' }, `Sampling: ${st.access}`),
      el('p', {}, st.desc), el('p', {}, 'IASLC map, schematic position. For teaching only.'));
  },
});
const hud = new Hud(tree);
const compass = new Compass($('scopePane'));

// optional CT overlay (skipped silently if the assets are absent)
loadCtLayer(overview).then((ct) => {
  if (!ct) return;
  $('ctPanel').hidden = false;
  $('ctFade').addEventListener('input', (e) => ct.setFade(e.target.value / 100));
  $('ctLines').addEventListener('change', (e) => ct.setCenterlines(e.target.checked));
});

const app = {
  tree, scope, overview, hud, panel: $('modePanel'),
  labelsUser: true, modeHides: false,
  get labelsShown() { return this.labelsUser && !this.modeHides; },
  setModeHidesLabels(v) { this.modeHides = v; this.syncLabels(); },
  syncLabels() {
    overview.setLabelsVisible(this.labelsShown);
    $('btnLabels').classList.toggle('off', !this.labelsUser);
  },
};
scope.on((e) => { if (e.type === 'teleport') overview.clearTrail(); });

const guidance = new Guidance({
  tree, scope, overview, getLabels: () => app.labelsShown,
  onUse: (k) => { if (k === 'ebus') flags.usedEbus = true; else flags.usedCt = true; },
});
const modes = { explore: new ExploreMode(app), quiz: new QuizMode(app), navigate: new NavigateMode(app), robotic: new RoboticMode(app) };
let mode = null;
function setMode(id) {
  mode?.exit();
  mode = modes[id];
  document.querySelectorAll('#modeTabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === id));
  scope.reset();
  overview.clearTrail();
  mode.enter();
  guidance.setMode(id);
  app.syncLabels();
}

// ── learn tab, tour, Boba ────────────────────────────────────────────────
const flags = { usedSection: false, usedEbus: false, usedCt: false, moved: false, flexed: false, rolled: false, usedLabels: false, usedNodes: false, openedLearn: false, toured: store.get('bsim.toured', false), labelToggles: 0 };
const t0 = Date.now();
const learnTab = $('navLearn');
const setActiveTab = (btn) => document.querySelectorAll('#modeTabs button').forEach((b) => b.classList.toggle('active', b === btn));
function openLearn(section) {
  document.body.classList.add('learning');
  document.body.classList.remove('paging');
  setActiveTab(learnTab);
  flags.openedLearn = true;
  if (section) learn.open(section);
}
/** Model & limits and About: full-page text, like the ventilator simulator's tabs. */
function openPage(id) {
  const page = $('page');
  document.body.classList.add('learning', 'paging');
  if (id === 'about') renderAbout(page); else page.innerHTML = MODEL_HTML;
  page.scrollTop = 0;
  setActiveTab($(id === 'about' ? 'navAbout' : 'navModel'));
}
function closeLearn() {
  if (!document.body.classList.contains('learning')) return;
  document.body.classList.remove('learning', 'paging');
  document.querySelectorAll('#modeTabs button').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode.id));
}
const learn = initLearn({
  root: $('learn'),
  onTour: () => { closeLearn(); runTour(); },
  onGoto(id) { // "Show in scope": drop the scope into that airway in explore mode
    closeLearn(); setMode('explore');
    scope.place(id, tree.nodes[id].length * 0.4);
    app.labelsUser = true; app.syncLabels();
  },
});

const paneRect = (frac) => () => { // a square in the scope pane's bottom-right corner (the 3D compass)
  const r = $('scopePane').getBoundingClientRect(), m = Math.min(r.width, r.height), s = m * frac, g = m * 0.035;
  return { left: r.right - s - g, top: r.bottom - s - g, width: s, height: s };
};
function runTour() {
  closeLearn();
  const L = tree.nodes.TR.length;
  startTour([
    { title: 'Welcome', text: 'This two-minute tour walks through the screen, then lets you drive the scope yourself. Use the Next button or the ← → keys; Esc skips. Educational use only: this is not for clinical use.', enter: () => { setMode('explore'); } },
    { title: 'The bronchoscope camera', target: '#scopePane', text: 'This is what the tip camera sees: a wide-angle, barrel-distorted view with the lumen ahead. Pale ridges are cartilage rings; the smooth strip is the posterior membranous wall.' },
    { title: 'Roll arc', target: '#rim', text: 'The ring around the image is the robotic-console bezel. The orange arc shows how far you have rolled the shaft from the start; the triangle marks 12 o’clock.' },
    { title: 'Articulation and depth', target: '#gauges', text: 'The articulation gauge plots how far the tip is bent (distance from the centre) and which way around the airway it points. The depth bar shows insertion depth from the start of the trachea. Press G to switch this overlay off.' },
    { title: 'The 3D compass', rect: paneRect(0.24), text: 'A, P, R, L, S, I = Anterior, Posterior, Right, Left, Superior, Inferior of the patient, as seen from the scope. Letters closer to you are brighter. It turns as you roll and flex, so you never lose orientation.' },
    { title: 'Where am I?', target: '#readout', text: 'With labels on, this names your airway, its lumen size, how far you are from the carina and which lymph node stations are adjacent. Press L to hide it and test yourself.' },
    { title: 'Drive: advance', target: '#scopePane', text: 'W advances, S withdraws, Shift makes it fine.', tryText: 'hold W until the scope stops at the carina',
      enter: () => scope.place('TR', L - 16), done: () => scope.blocked === 'carina' },
    { title: 'Drive: aim and enter', target: '#scopePane', text: 'At a carina you must aim before you advance. Flex with ↑, roll with A or D until a lumen is centred (the right main bronchus is on the right of the image), then press W. The compass and arc will move as you go.',
      tryText: 'enter the right or left main bronchus',
      enter: () => scope.place('TR', L - 2), done: () => scope.nodeId !== 'TR' },
    { title: 'Labels on and off', target: '#readout', text: 'L toggles all labels in both panes. Use it to quiz yourself.', tryText: 'press L twice (off, then on)', enter: () => { flags.labelToggles = 0; }, done: () => flags.labelToggles >= 2 },
    { title: '3D map', target: '#overviewPane', text: 'The orange marker is your scope tip and the orange line is the path taken. The coloured shells are the lobes (legend, top left). Drag to rotate, scroll to zoom, Reset view to return. The yellow tube is the airway you are in.' },
    { title: 'Lymph node stations', target: '#overviewPane', text: 'Green ovals are IASLC nodal stations. Click one for its location and how it is usually sampled. N toggles them; V toggles the heart, vessels and esophagus landmarks.', tryText: 'click a green oval in the 3D map',
      enter: () => { if (!overview.nodesOn) toggleNodes(); }, done: () => !$('nodeCard').hidden },
    { title: 'Modes', target: '#modeTabs', text: 'Free explore is open wandering. Where am I? drops you into a random airway with labels hidden for a scored quiz. Navigate to target times you reaching a named segment. M cycles modes.' },
    { title: 'Robotic case', target: '[data-mode=robotic]', text: 'The game mode. Plan a route to a synthetic nodule, drive a thin robotic-style catheter, remove the vision probe (P), confirm with radial EBUS (E) and cone-beam CT (C), then sample. The Learn tab has a how-to-play section.' },
    { title: 'CT overlay', target: '#ctPanel', text: 'Fade between the procedural airway and a real CT-derived airway (public AeroPath dataset, CC BY 4.0), and show its labelled centerlines. Labels were transferred by registration; they are not expert annotations.' },
    { title: 'Mode panel', target: '#modePanel', text: 'Questions, targets, scores and teaching feedback appear here.' },
    { title: 'Learn tab', target: '#navLearn', text: 'Lung and lobe anatomy, the airways, lymph node stations, how flexible and robotic bronchoscopes work, the techniques used, and what this simulator models. Each airway table has a "Show in scope" button.' },
    { title: 'Boba', target: '.boba-dog', text: 'Boba is your assistant. Click for a tip, double-click for zoomies, or press Hush to keep quiet. Boba notices when you are stuck and chimes in. That is it. Enjoy, and remember this is a teaching tool, not for clinical use.' },
  ], { onEnd() { flags.toured = true; store.set('bsim.toured', true); setMode('explore'); } });
}

const boba = initBoba({
  onTour: runTour, onLearn: () => openLearn(),
  getCtx: () => ({
    t: (Date.now() - t0) / 1000, mode: mode.id, labelsShown: app.labelsShown, node: scope.node,
    scope: { blocked: scope.blocked, s: scope.s }, near: nearbyStations(scope.pose.pos).map((s) => s.id), flags,
    quiz: mode.id === 'quiz' && mode.q ? { answered: mode.q.answered, secs: (Date.now() - mode.qt0) / 1000 } : null,
    rob: mode.id === 'robotic' ? mode.bobaCtx() : null,
    nav: mode.id === 'navigate' && mode.target ? { secs: (performance.now() - mode.t0) / 1000, hint: mode.hint, done: !!mode.done } : null,
  }),
});

// ── input ────────────────────────────────────────────────────────────────
const held = new Set();
const help = $('help');
const toggleHelp = (v = help.hidden) => { help.hidden = !v; if (!v) store.set('bsim.helpSeen', true); };
const toggle = (btn, getter, setter) => { const v = !getter(); setter(v); btn.classList.toggle('on', v); };
const toggleNodes = () => { flags.usedNodes = true; toggle($('btnNodes'), () => overview.nodesOn, (v) => overview.setNodesVisible(v)); };
const toggleVessels = () => toggle($('btnVessels'), () => overview.structures.visible, (v) => overview.setVesselsVisible(v));
let robotic = true;
const toggleRobotic = () => { robotic = !robotic; hud.setRobotic(robotic); };
// cross-section of the 3D map
const SEC = { y: { min: -190, max: 125, def: -20, plane: 'axial' }, z: { min: -110, max: 110, def: 0, plane: 'coronal' }, x: { min: -130, max: 130, def: 0, plane: 'sagittal' } };
const secPos = $('secPos');
let secAxis = '', secFlip = false;
function setSectionAxis(ax) {
  secAxis = ax;
  if (ax) flags.usedSection = true;
  secFlip = ax === 'y';   // axial: keep the superior part and look up from below, as in radiology
  document.querySelectorAll('#secTabs button').forEach((b) => b.classList.toggle('active', b.dataset.ax === ax));
  secPos.disabled = !ax;
  if (!ax) { overview.setSection(null); return; }
  Object.assign(secPos, { min: SEC[ax].min, max: SEC[ax].max, value: SEC[ax].def });
  overview.setSection(ax, SEC[ax].def, secFlip);
  overview.viewSection(ax);
}
overview.onSectionMove = (p) => { secPos.value = Math.round(p); };
secPos.addEventListener('input', () => overview.setSection(secAxis, Number(secPos.value), secFlip));
document.querySelectorAll('#secTabs button').forEach((b) => b.addEventListener('click', () => { setSectionAxis(b.dataset.ax); b.blur(); }));
$('secFollow').addEventListener('change', (e) => overview.setSectionFollow(e.target.checked));
$('secFlip').addEventListener('click', (e) => { secFlip = !secFlip; if (secAxis) overview.setSection(secAxis, Number(secPos.value), secFlip); e.currentTarget.blur(); });
$('secCt').addEventListener('click', (e) => { if (secAxis) guidance.focusCt(SEC[secAxis].plane, Number(secPos.value)); e.currentTarget.blur(); });
const cycleSection = () => setSectionAxis({ '': 'y', y: 'z', z: 'x', x: '' }[secAxis]);

const toggleTip = () => toggle($('btnTip'), () => overview.tipUser, (v) => overview.setTipVisible(v));
const toggleLabels = () => { flags.usedLabels = true; flags.labelToggles++; app.labelsUser = !app.labelsUser; app.syncLabels(); };
const reset = () => { scope.confine ? scope.place(scope.nodeId, scope.s) : scope.reset(); };

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['SELECT', 'INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) && e.key !== 'Escape') return;
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(k)) e.preventDefault();
  if (document.body.classList.contains('learning')) { if (k === 'Escape') closeLearn(); return; }
  if (!help.hidden) { toggleHelp(false); return; }
  if (mode.onKey?.(k === 'Enter' ? 'Enter' : e.key)) { e.preventDefault(); return; }
  if (e.repeat && !'wsad'.includes(k)) return;
  if (k === 'h') toggleHelp(true);
  else if (k === 'l') toggleLabels();
  else if (k === 'b') toggleTip();
  else if (k === 'x') cycleSection();
  else if (k === 'e') guidance.toggle('ebus');
  else if (k === 'c') guidance.toggle('ct');
  else if (k === 'n') toggleNodes();
  else if (k === 'v') toggleVessels();
  else if (k === 'g') toggleRobotic();
  else if (k === 'r') reset();
  else if (k === 'm') {
    const ids = Object.keys(modes);
    setMode(ids[(ids.indexOf(mode.id) + 1) % ids.length]);
  } else if (k === ' ') scope.flex = 0;
  else {
    held.add(k);
    if (k === 'w' || k === 's') flags.moved = true;
    if (k === 'ArrowUp' || k === 'ArrowDown') flags.flexed = true;
    if (k === 'a' || k === 'd') flags.rolled = true;
  }
});
window.addEventListener('keyup', (e) => held.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key));
window.addEventListener('blur', () => held.clear());

document.querySelectorAll('#modeTabs button').forEach((b) => b.addEventListener('click', () => {
  if (b === learnTab) openLearn();
  else if (b.id === 'navModel') openPage('model');
  else if (b.id === 'navAbout') openPage('about');
  else { closeLearn(); setMode(b.dataset.mode); }
  b.blur();
}));
$('btnLabels').addEventListener('click', (e) => { toggleLabels(); e.currentTarget.blur(); });
$('btnReset').addEventListener('click', (e) => { reset(); e.currentTarget.blur(); });
$('btnTour').addEventListener('click', (e) => { runTour(); e.currentTarget.blur(); });
$('btnHelp').addEventListener('click', (e) => { toggleHelp(true); e.currentTarget.blur(); });
$('btnTip').addEventListener('click', (e) => { toggleTip(); e.currentTarget.blur(); });
// top-bar buttons send the same keys, so robotic mode's own E / C (r-EBUS, CBCT) still win there
for (const [id, k] of [['btnEbus', 'e'], ['btnCt', 'c']]) $(id).addEventListener('click', (e) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); e.currentTarget.blur(); });
$('btnNodes').addEventListener('click', (e) => { toggleNodes(); e.currentTarget.blur(); });
$('btnVessels').addEventListener('click', (e) => { toggleVessels(); e.currentTarget.blur(); });
$('btnView').addEventListener('click', (e) => { overview.resetView(); e.currentTarget.blur(); });
help.addEventListener('click', () => toggleHelp(false));

// ── loop ─────────────────────────────────────────────────────────────────
const SPEED = 28; // mm/s
const ROLL = 1.4; // rad/s
const FLEX = 1.2; // rad/s
let last = performance.now();
function frame(now) {
  if (document.body.classList.contains('learning')) { last = now; return requestAnimationFrame(frame); }
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const fine = held.has('Shift') ? 0.3 : 1;
  if (!mode.locked?.()) { // robotic mode locks the catheter (probe out, planning, CBCT open)
    if (held.has('w')) scope.move(SPEED * fine * dt);
    if (held.has('s')) scope.move(-SPEED * fine * dt);
    if (held.has('d')) scope.rollBy(ROLL * fine * dt);
    if (held.has('a')) scope.rollBy(-ROLL * fine * dt);
    if (held.has('ArrowUp')) scope.flexBy(FLEX * fine * dt);
    if (held.has('ArrowDown')) scope.flexBy(-FLEX * fine * dt);
  }

  hud.setDrive((held.has('w') ? 1 : 0) - (held.has('s') ? 1 : 0), fine < 1, !!mode.locked?.() && mode.id === 'robotic');
  const pose = scope.pose;
  if (!mode.cameraOff?.()) scopeView.render(pose, now / 1000, dt);
  overview.update(pose, scope.nodeId);
  mode.update(dt);
  guidance.update(now);
  compass.draw(pose);
  hud.update(scope, app.labelsShown, mode.id === 'quiz' ? 'Quiz: identify this airway' : '');
  mode.afterHud?.();
  requestAnimationFrame(frame);
}

if (import.meta.env.DEV) window.__bsim = { openPage, guidance, app, scope, setMode, modes, scopeView, runTour, openLearn, boba, flags };
setMode('explore');
requestAnimationFrame(frame);

// first visit: open the tutorial straight away (Skip also counts as seen; Tour button replays it)
if (!flags.toured) setTimeout(runTour, 500);
