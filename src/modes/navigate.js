// Navigate-to-target: reach a named segment starting from the carina.
// Scoring: 100, minus 15 per wrong turn, minus 0.5/s beyond 30 s (floor 10).
import { el, store } from '../ui/dom.js';
import { routeTo } from '../anatomy/index.js';
import { describe } from './quiz.js';

const KEY = 'bsim.nav.v1';

export class NavigateMode {
  id = 'navigate';
  constructor(app) {
    this.app = app;
    this.segments = app.tree.list.filter((n) => n.level === 'segment');
    this.best = store.get(KEY, {});
    this.listener = (e) => this.onScope(e);
    app.scope.on(this.listener);
  }

  enter() {
    this.active = true;
    const { app } = this;
    app.scope.confine = null;
    app.setModeHidesLabels(false);
    app.overview.setMarkerVisible(true);
    this.newTarget(this.segments[Math.floor(Math.random() * this.segments.length)].id);
  }

  exit() { this.active = false; this.app.overview.setTarget(null); }

  newTarget(id) {
    const { app } = this;
    this.target = app.tree.nodes[id];
    this.route = routeTo(app.tree, id);
    this.routeSet = new Set(this.route);
    this.hint = false;
    this.done = null;
    this.wrong = 0;
    this.offRoute = false;
    this.t0 = performance.now();
    app.scope.reset();
    app.overview.clearTrail();
    app.overview.setTarget(id);
    this.render();
  }

  random() {
    const others = this.segments.filter((n) => n !== this.target);
    this.newTarget(others[Math.floor(Math.random() * others.length)].id);
  }

  onScope(e) {
    if (!this.active || this.done || e.type !== 'enter') return;
    const to = this.app.tree.nodes[e.to];
    const on = this.routeSet.has(to.id) || to.segment === this.target.id;
    if (!on && !this.offRoute) this.wrong++;
    this.offRoute = !on;
  }

  update() {
    if (this.done) return;
    const nd = this.app.scope.node;
    if (nd.segment === this.target.id && nd.level !== 'division') return this.finish();
    this.timer.textContent = `${((performance.now() - this.t0) / 1000).toFixed(0)} s`;
    this.wrongEl.textContent = this.wrong;
  }

  finish() {
    const sec = (performance.now() - this.t0) / 1000;
    const score = Math.max(10, Math.round(100 - 15 * this.wrong - Math.max(0, sec - 30) * 0.5));
    this.done = { sec, score };
    const prev = this.best[this.target.id];
    if (!prev || score > prev) { this.best[this.target.id] = score; store.set(KEY, this.best); }
    this.render();
  }

  onKey(key) {
    if (key === 't' || key === 'T') { this.hint = !this.hint; this.render(); return true; }
    if (key === 'Enter' && this.done) { this.random(); return true; }
    return false;
  }

  render() {
    const { app, target, route } = this;
    const nodes = app.tree.nodes;
    this.timer = el('b', {}, '0 s');
    this.wrongEl = el('b', {}, String(this.wrong));
    const body = [
      el('h3', {}, 'Navigate to: ', el('span', { class: 'good' }, describe(target))),
      el('p', {}, 'Start at the carina and steer into the target airway (highlighted green in the 3D view). ',
        el('kbd', {}, 'T'), ' shows the route.'),
    ];
    if (this.hint) body.push(el('p', {}, 'Route: ', route.map((id) => nodes[id].label).join(' → ')));
    if (this.done) {
      body.push(
        el('p', { class: 'good' }, `Reached ${target.label} in ${this.done.sec.toFixed(0)} s with ${this.wrong} wrong turn(s). Score ${this.done.score}.`),
        el('p', {}, target.desc),
        el('p', {}, 'Route: ', route.map((id) => nodes[id].label).join(' → ')),
      );
    }
    const select = el('select', { onchange: (e) => { this.newTarget(e.target.value); e.target.blur(); } },
      this.segments.map((n) => el('option', { value: n.id, selected: n === target }, describe(n))));
    app.panel.replaceChildren(
      el('div', { class: 'grow' }, body),
      el('div', { class: 'stats' }, 'Time ', this.timer, el('br'), 'Wrong turns ', this.wrongEl,
        el('br'), `Best ${this.best[target.id] ?? '–'}`),
      select,
      el('button', { onclick: () => this.random() }, 'Random target', this.done ? [' ', el('kbd', {}, 'Enter')] : ''),
      el('button', { onclick: () => this.newTarget(target.id) }, 'Restart'),
    );
  }
}
