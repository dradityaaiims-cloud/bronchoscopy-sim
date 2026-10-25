// Robotic bronchoscopy case mode (Phase 2): cases -> plan -> navigate -> confirm -> sample -> result.
//
// Model: a thin catheter driven like the scope (W/S, A/D, arrows) with a removable vision probe (P).
// Probe out = no camera and the catheter is locked in place, so r-EBUS and tools use the same position.
// The displayed target comes from the CT plan; the true lesion is offset by the case's divergence.
import { el, store } from '../ui/dom.js';
import { CASES } from '../robotic/cases.js';
import { placeNodule, tipRelation } from '../robotic/geometry.js';
import { planRoutes, routeQuality, nextOnRoute } from '../robotic/planning.js';
import { catheterShape, shapeLength } from '../robotic/catheter.js';
import { rebusScene, drawRebus } from '../robotic/rebus.js';
import { TOOLS, sample } from '../robotic/sampling.js';
import { scoreCase } from '../robotic/scoring.js';
import { loadCtVolume } from '../robotic/cbct.js';
import { caseListView, planView, cbctView, resultView, rebusCard } from '../robotic/views.js';
import * as V from '../anatomy/math.js';

const KEY = 'bsim.robotic.v1';
const HALF_FOV = (60 * Math.PI) / 180;

export class RoboticMode {
  id = 'robotic';

  constructor(app) {
    this.app = app;
    this.tree = app.tree;
    this.best = store.get(KEY, {});
    this.stage = 'list';
    this.pane = document.getElementById('scopePane');
    this.host = el('div', { class: 'ovl-host', hidden: true });
    this.navHud = el('div', { class: 'nav-hud', hidden: true },
      el('div', { class: 'tcard' }, el('span', { class: 'cap' }, 'TARGET'), this.distEl = el('b', {}, '–'), this.routeEl = el('span', { class: 'rchip' })),
      this.mark = el('div', { class: 'routemark' }, this.markTx = el('span', {})),
      el('div', { class: 'probe-msg' }, el('b', {}, 'VISION PROBE REMOVED'), el('span', {}, 'Camera off. Catheter locked in place; shape sensing active. Press P to reinsert the probe and move.')),
      this.rebusHost = el('div', { class: 'rebus-host' }));
    this.pane.append(this.host, this.navHud);
  }

  // ── lifecycle ─────────────────────────────────────────────────────────
  enter() {
    const { app } = this;
    app.scope.confine = null;
    app.setModeHidesLabels(false);
    app.overview.setMarkerVisible(true);
    app.overview.setTarget(null);
    this.showList();
  }

  exit() {
    this.host.hidden = true; this.navHud.hidden = true;
    this.pane.classList.remove('probe-out');
    this.app.overview.clearCase();
  }

  locked() { return this.stage !== 'nav' || !this.probeIn || !!this.cbctOpen; }
  afterHud() { if (this.stage === 'nav' && !this.probeIn) { const c = document.getElementById('statusChip'); c.textContent = 'PROBE OUT · LOCKED'; c.className = 'chip warn'; } }
  cameraOff() { return this.stage === 'nav' && !this.probeIn; }

  // ── overlays ───────────────────────────────────────────────────────────
  show(node) { this.host.replaceChildren(node); this.host.hidden = false; }
  hide() { this.host.hidden = true; this.host.replaceChildren(); this.cbctOpen = false; }

  showList() {
    this.stage = 'list';
    this.navHud.hidden = true;
    this.pane.classList.remove('probe-out');
    this.app.overview.clearCase();
    this.app.scope.reset();
    this.app.overview.clearTrail();
    this.show(caseListView({ cases: CASES, best: this.best, tree: this.tree, onPick: (c) => this.pick(c), onPractice: (o) => this.pick(this.practiceCase(o)) }));
    this.renderPanel();
  }

  practiceCase({ segment, diameter, sign, divergence }) {
    const ends = this.tree.list.filter((n) => n.segment === segment && !n.children.length);
    const ref = ends[Math.floor(Math.random() * ends.length)].id;
    const th = Math.random() * Math.PI * 2, ph = (Math.random() - 0.5) * Math.PI;
    const div = [divergence * Math.cos(ph) * Math.cos(th), divergence * Math.sin(ph), divergence * Math.cos(ph) * Math.sin(th)];
    return { id: 'practice', title: `Practice: ${segment}`, segment, ref, diameter, sign, gap: 6, seed: 1 + Math.floor(Math.random() * 99), divergence: div, par: 220,
      brief: 'Custom nodule from the practice builder.' };
  }

  pick(c) {
    const { app } = this;
    this.c = c;
    this.nodule = placeNodule(this.tree, c);
    this.routes = planRoutes(this.tree, this.nodule.displayed);
    this.chosenId = null;
    this.stage = 'plan';
    app.overview.showCase(this.nodule);
    app.scope.reset();
    this.drawPlan();
    this.renderPanel();
  }

  drawPlan() {
    this.show(planView({
      c: this.c, nodule: this.nodule, tree: this.tree, routes: this.routes, chosenId: this.chosenId,
      onChoose: (id) => { this.chosenId = id; this.app.overview.setRoute(this.routes.find((r) => r.id === id).route); this.drawPlan(); },
      onStart: () => this.start(),
    }));
  }

  // ── navigation ─────────────────────────────────────────────────────────
  start() {
    const { app } = this;
    this.plannedRoutes = this.routes; // the plan as first shown (route choice is scored against it)
    this.route = this.routes.find((r) => r.id === this.chosenId).route;
    this.routeSet = new Set(this.route);
    this.stage = 'nav';
    this.probeIn = true;
    this.t0 = performance.now();
    Object.assign(this, { contacts: 0, rebus: [], cbct: [], samples: [], targetUpdated: false, tool: 'needle', lastSample: null, prevBlocked: null, shapeKey: '' });
    app.scope.reset();
    app.overview.clearTrail();
    app.overview.setRoute(this.route);
    app.overview.revealNodule(false);
    this.hide();
    this.rebusHost.replaceChildren();
    this.navHud.hidden = false;
    this.pane.classList.remove('probe-out');
    this.renderPanel();
  }

  /** Project a world direction into the scope image: ring position as fractions of the view radius. */
  project(v, pose) {
    const f = V.norm(pose.f), n = V.norm(v);
    const ang = Math.acos(V.clamp(V.dot(n, f), -1, 1));
    const x = V.dot(n, pose.right), y = V.dot(n, pose.up), m = Math.hypot(x, y) || 1;
    return { r: ang / HALF_FOV, x: x / m, y: y / m, ang };
  }

  update() {
    if (this.stage !== 'nav') return;
    const { app, nodule } = this, sc = app.scope, pose = sc.pose, tip = pose.pos;

    // live numbers
    const dist = V.len(V.sub(tip, nodule.displayed));
    this.distEl.textContent = `${dist.toFixed(1)} mm`;
    const on = this.routeSet.has(sc.nodeId);
    this.routeEl.textContent = on ? 'ON ROUTE' : 'OFF ROUTE: withdraw';
    this.routeEl.className = `rchip ${on ? 'ok' : 'off'}`;
    if (this.timeEl) this.timeEl.textContent = `${Math.round((performance.now() - this.t0) / 1000)} s`;
    if (this.distPanel) this.distPanel.textContent = `${dist.toFixed(1)} mm`;
    if (this.contactEl) this.contactEl.textContent = this.contacts;

    // wall contacts: each time the catheter is pushed into a carina without aiming at a lumen (a dead end is not a contact)
    if (sc.blocked === 'carina' && this.prevBlocked !== 'carina') this.contacts++;
    this.prevBlocked = sc.blocked;

    // planned-route marker: where the next planned lumen (or the target) appears in the image
    const R = 0.47 * Math.min(this.pane.clientWidth, this.pane.clientHeight);
    let target = null, label = '';
    const nd = sc.node, next = nextOnRoute(this.route, sc.nodeId);
    if (this.probeIn) {
      if (next && nd.length - sc.s < 70) {
        const c = this.tree.nodes[next].centerline;
        target = V.sub(c[Math.min(2, c.length - 1)], tip); label = this.tree.nodes[next].label;
      } else if (!next && on) { target = V.sub(nodule.displayed, tip); label = 'TARGET'; }
    }
    if (target) {
      const p = this.project(target, pose), rr = Math.min(1, p.r);
      this.mark.style.transform = `translate(${p.x * rr * R}px, ${-p.y * rr * R}px) translate(-50%, -50%)`;
      this.mark.className = `routemark ${p.r > 1 ? 'edge' : p.ang < 0.26 ? 'aligned' : ''}`;
      this.markTx.textContent = p.r > 1 ? `→ ${label}` : label;
      this.mark.hidden = false;
    } else this.mark.hidden = true;

    // shape sensing: only rebuild the catheter tube when the shape changes
    const key = `${sc.nodeId}|${sc.s.toFixed(1)}|${sc.flex.toFixed(2)}|${sc.roll.toFixed(2)}`;
    if (key !== this.shapeKey) {
      this.shapeKey = key;
      const pts = catheterShape(this.tree, sc);
      app.overview.setCatheter(pts);
      this.shapeLen = shapeLength(pts);
      if (this.shapeEl) this.shapeEl.textContent = `${this.shapeLen.toFixed(0)} mm`;
    }
  }

  // ── probe, r-EBUS, CBCT, sampling ──────────────────────────────────────
  toggleProbe() {
    if (this.stage !== 'nav' || this.cbctOpen) return;
    this.probeIn = !this.probeIn;
    this.pane.classList.toggle('probe-out', !this.probeIn);
    if (this.probeIn) this.rebusHost.replaceChildren();
    this.say(this.probeIn ? 'Vision probe reinserted. You can drive again.' : 'Vision probe removed. The catheter is locked here; r-EBUS and sampling tools go through the same channel.');
    this.renderPanel();
  }

  needProbeOut() {
    if (this.probeIn) { this.say('Remove the vision probe first (P): the working channel is occupied.'); return true; }
    return false;
  }

  runRebus() {
    if (this.stage !== 'nav' || this.needProbeOut()) return;
    const p = this.app.scope.pose;
    const scene = rebusScene(p.pos, p.f, p.up, p.right, this.nodule);
    const canvas = el('canvas', { width: 180, height: 180 });
    drawRebus(canvas, scene, this.rebus.length);
    this.rebusHost.replaceChildren(rebusCard(canvas, scene));
    this.rebus.push(scene.pattern);
    this.say(`r-EBUS: ${scene.pattern}.`);
    this.renderPanel();
  }

  async runCbct() {
    if (this.stage !== 'nav' || this.cbctOpen) return;
    this.vol ||= await loadCtVolume();
    if (!this.vol) { this.say('CT volume not available in this build.'); return; }
    const sc = this.app.scope, tip = sc.pose.pos;
    this.cbctOpen = true;
    this.cbct.push({ edge: tipRelation(tip, sc.pose.f, this.nodule).edge, inLesion: tipRelation(tip, sc.pose.f, this.nodule).inside });
    this.show(cbctView({
      vol: this.vol, nodule: this.nodule, targetUpdated: this.targetUpdated,
      getShape: () => catheterShape(this.tree, sc, 0.8), getTip: () => sc.pose.pos,
      onClose: () => { this.hide(); this.renderPanel(); },
      onUpdate: () => this.updateTarget(),
    }));
    this.renderPanel();
  }

  /** Register the CBCT: the displayed target moves onto the true lesion and the route is re-planned. */
  updateTarget() {
    const n = this.nodule;
    n.displayed = [...n.center];
    this.targetUpdated = true;
    this.routes = planRoutes(this.tree, n.displayed);
    this.route = this.routes[0].route;
    this.routeSet = new Set(this.route);
    this.app.overview.moveTarget(n.displayed);
    this.app.overview.setRoute(this.route);
    this.hide();
    this.say('Target updated from CBCT; route re-planned to the corrected target.');
    this.renderPanel();
  }

  pickTool(t) { this.tool = t; this.renderPanel(); }

  takeSample() {
    if (this.stage !== 'nav' || this.cbctOpen || this.needProbeOut()) return;
    if (this.samples.length >= 4) { this.say('Maximum of four passes. Finish the case.'); return; }
    const p = this.app.scope.pose, rel = tipRelation(p.pos, p.f, this.nodule);
    const r = sample(this.tool, p.pos, p.f, this.nodule, this.c.seed ?? 1, this.samples.length);
    this.samples.push({ ...r, tool: TOOLS[this.tool].name, edge: rel.edge, confirmedFirst: this.rebus.length + this.cbct.length > 0 });
    this.lastSample = r;
    this.say(`${TOOLS[this.tool].name}: ${r.diagnostic ? 'rapid on-site evaluation shows lesional cells.' : r.reason}`);
    this.renderPanel();
  }

  // ── finish ─────────────────────────────────────────────────────────────
  finish() {
    if (this.stage !== 'nav') return;
    const a = {
      case: this.c, divergenceMm: this.nodule.divergenceMm,
      routeQuality: routeQuality(this.plannedRoutes, this.chosenId), routeChosen: this.chosenId, routeBest: this.plannedRoutes[0].id,
      timeSec: (performance.now() - this.t0) / 1000, contacts: this.contacts,
      rebus: this.rebus, cbct: this.cbct, targetUpdated: this.targetUpdated, samples: this.samples,
    };
    const result = scoreCase(a);
    if (this.c.id !== 'practice' && result.total > (this.best[this.c.id] ?? -1)) { this.best[this.c.id] = result.total; store.set(KEY, this.best); }
    this.stage = 'result';
    this.navHud.hidden = true;
    this.pane.classList.remove('probe-out');
    this.app.overview.revealNodule(true);
    const idx = CASES.findIndex((c) => c.id === this.c.id);
    this.show(resultView({
      c: this.c, result, onBack: () => this.showList(), onRetry: () => this.pick(this.c),
      hasNext: idx >= 0 && idx < CASES.length - 1, onNext: () => this.pick(CASES[idx + 1]),
    }));
    this.renderPanel();
  }

  // ── keys and panel ─────────────────────────────────────────────────────
  onKey(key) {
    if (this.stage !== 'nav') return false;
    const k = key.length === 1 ? key.toLowerCase() : key;
    if (k === 'Escape' && this.cbctOpen) { this.hide(); this.renderPanel(); return true; }
    if (this.cbctOpen) return false;
    if (k === 'p') this.toggleProbe();
    else if (k === 'e') this.runRebus();
    else if (k === 'c') this.runCbct();
    else if (k === '1') this.pickTool('needle');
    else if (k === '2') this.pickTool('forceps');
    else if (k === '3') this.pickTool('brush');
    else if (k === 'Enter') this.takeSample();
    else return false;
    return true;
  }

  /** Context for Boba's tips. */
  bobaCtx() {
    const nav = this.stage === 'nav';
    const off = nav && !this.routeSet.has(this.app.scope.nodeId);
    if (off && !this.offSince) this.offSince = performance.now(); else if (!off) this.offSince = 0;
    return {
      stage: this.stage, chosen: this.chosenId, probeIn: this.probeIn,
      distance: nav ? V.len(V.sub(this.app.scope.pose.pos, this.nodule.displayed)) : 99,
      offRoute: off, offSecs: off ? (performance.now() - this.offSince) / 1000 : 0,
      rebusLast: this.rebus?.[this.rebus.length - 1], rebusN: this.rebus?.length ?? 0, cbctN: this.cbct?.length ?? 0, samples: this.samples?.length ?? 0,
    };
  }

  say(msg) { this.msg = msg; if (this.msgEl) this.msgEl.textContent = msg; }

  renderPanel() {
    const { app } = this;
    if (this.stage !== 'nav') {
      app.panel.replaceChildren(el('div', { class: 'grow' },
        el('h3', {}, 'Robotic bronchoscopy'),
        el('p', {}, this.stage === 'list' ? 'Choose a case or build a practice nodule.' : this.stage === 'plan' ? 'Choose a route, then start navigation.' : 'Review your result and the teaching points.')));
      this.timeEl = this.distPanel = this.contactEl = this.shapeEl = this.msgEl = null;
      return;
    }
    const b = (label, key, fn, o = {}) => el('button', { class: o.on ? 'active' : '', disabled: o.off, onclick: () => { fn(); document.activeElement?.blur(); } }, label, ' ', el('kbd', {}, key));
    this.timeEl = el('b', {}, '0 s'); this.distPanel = el('b', {}, '–'); this.contactEl = el('b', {}, String(this.contacts)); this.shapeEl = el('b', {}, this.shapeLen ? `${this.shapeLen.toFixed(0)} mm` : '–');
    this.msgEl = el('p', { class: 'say' }, this.msg || 'Drive to the target. Remove the vision probe (P) to confirm and sample.');
    app.panel.replaceChildren(
      el('div', { class: 'grow' },
        el('h3', {}, this.c.title),
        this.msgEl,
        el('div', { class: 'toolrow' },
          b(this.probeIn ? 'Remove probe' : 'Reinsert probe', 'P', () => this.toggleProbe(), { on: !this.probeIn }),
          b('r-EBUS', 'E', () => this.runRebus(), { off: this.probeIn }),
          b('CBCT', 'C', () => this.runCbct()),
          ...Object.entries(TOOLS).map(([id, t], i) => b(t.name.split(' ')[0], String(i + 1), () => this.pickTool(id), { on: this.tool === id })),
          b('Take sample', '↵', () => this.takeSample(), { off: this.probeIn }),
          el('button', { class: 'primary', onclick: () => this.finish() }, 'Finish case'))),
      el('div', { class: 'stats' }, 'Time ', this.timeEl, el('br'), 'Distance to target ', this.distPanel, el('br'), 'Wall contacts ', this.contactEl, el('br'),
        'Shape-sensed length ', this.shapeEl, el('br'), `r-EBUS ${this.rebus.length} · CBCT ${this.cbct.length} · passes ${this.samples.length}/4`));
  }
}
