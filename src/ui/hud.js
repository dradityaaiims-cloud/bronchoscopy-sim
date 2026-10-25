// Scope-pane overlays styled after a robotic bronchoscopy console: roll-arc bezel,
// articulation gauge, depth readout, route breadcrumb, status chip, airway readout.
// (Generic console look; not a replica of any manufacturer's interface.)
import { el } from './dom.js';
import { routeTo } from '../anatomy/index.js';
import { nearbyStations } from '../anatomy/lymphNodes.js';
import { FLEX_MIN, FLEX_MAX } from '../sim/scope.js';

const $ = (id) => document.getElementById(id);
const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, ...kids) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  kids.forEach((k) => e.append(k));
  return e;
};
const deg = (r) => Math.round((r * 180) / Math.PI);

export class Hud {
  constructor(tree) {
    this.tree = tree;
    this.ro = { label: $('roLabel'), name: $('roName'), meta: $('roMeta'), st: $('roStations') };
    this.notice = $('notice');
    $('legend').replaceChildren(...Object.values(tree.lobes).map((l) =>
      el('div', {}, el('i', { style: `background:${l.color}` }), l.name)));

    // bezel: ticks every 10°, a roll arc from 12 o'clock to the current roll, 12 o'clock pointer
    const ticks = svg('g');
    for (let a = 0; a < 360; a += 10) {
      const major = a % 90 === 0, mid = a % 30 === 0;
      const r1 = 100, r2 = major ? 91 : mid ? 94 : 96.5, t = (a * Math.PI) / 180;
      ticks.append(svg('line', { x1: Math.sin(t) * r1, y1: -Math.cos(t) * r1, x2: Math.sin(t) * r2, y2: -Math.cos(t) * r2, class: major ? 'tk major' : 'tk' }));
    }
    this.rollArc = svg('path', { class: 'rollarc', d: '' });
    $('rim').replaceChildren(svg('svg', { viewBox: '-110 -110 220 220' },
      svg('circle', { r: 101.5, class: 'rimc' }), ticks, this.rollArc,
      svg('path', { d: 'M0,-108 L-4,-102 L4,-102 Z', class: 'ptr' })));

    // articulation gauge (polar: radius = bend, angle = roll)
    this.dot = svg('circle', { r: 4, class: 'adot' });
    this.articTxt = el('div', { class: 'tx' });
    $('artic').replaceChildren(
      el('div', { class: 'cap' }, 'ARTICULATION'),
      svg('svg', { viewBox: '-44 -44 88 88', width: 84, height: 84 },
        ...[36, 24, 12].map((r) => svg('circle', { r, class: 'ar' })),
        svg('line', { x1: -40, y1: 0, x2: 40, y2: 0, class: 'ar' }), svg('line', { x1: 0, y1: -40, x2: 0, y2: 40, class: 'ar' }),
        svg('text', { x: 0, y: -37.5, class: 'at', 'text-anchor': 'middle' }, 'ANT'),
        this.dot),
      this.articTxt);

    this.driveEl = el('div', { class: 'drive' }, 'HOLD');
    this.depthTxt = el('div', { class: 'tx' });
    this.depthFill = el('i');
    $('depth').replaceChildren(el('div', { class: 'cap' }, 'DEPTH'), this.depthTxt, el('div', { class: 'bar' }, this.depthFill), this.driveEl);
    // bezel matches the shader's circular mask (0.94 of the shorter side)
    const pane = $('scopePane');
    new ResizeObserver(() => { const m = Math.min(pane.clientWidth, pane.clientHeight); pane.style.setProperty('--d', `${0.94 * m}px`); pane.style.setProperty('--gz', `${0.3 * m}px`); }).observe(pane);
    this.crumb = $('crumb');
    this.status = $('statusChip');
  }

  /** Catheter-drive indicator: +1 advancing, -1 retracting, 0 holding; `fine` = slow mode; `locked` = probe out. */
  setDrive(dir, fine, locked) {
    const t = locked ? 'LOCKED' : dir > 0 ? `▲ ADVANCE${fine ? ' (fine)' : ''}` : dir < 0 ? `▼ RETRACT${fine ? ' (fine)' : ''}` : 'HOLD';
    if (this.driveEl.textContent !== t) this.driveEl.textContent = t;
    this.driveEl.className = `drive ${locked ? 'lock' : dir > 0 ? 'adv' : dir < 0 ? 'ret' : ''}`;
  }

  setRobotic(on) { $('scopePane').classList.toggle('plain', !on); }

  update(scope, labelsShown, hideReason) {
    const pose = scope.pose;
    const nd = scope.node;

    // bezel roll arc
    let t = scope.roll % (2 * Math.PI);
    if (t > Math.PI) t -= 2 * Math.PI; else if (t < -Math.PI) t += 2 * Math.PI;
    const R = 98;
    this.rollArc.setAttribute('d', Math.abs(t) < 0.01 ? '' : `M0,${-R} A${R},${R} 0 0 ${t > 0 ? 1 : 0} ${Math.sin(t) * R},${-Math.cos(t) * R}`);

    // articulation gauge
    const bend = scope.flex >= 0 ? scope.flex / FLEX_MAX : -scope.flex / -FLEX_MIN;
    const ang = scope.flex >= 0 ? scope.roll : scope.roll + Math.PI;
    this.dot.setAttribute('cx', Math.sin(ang) * bend * 36);
    this.dot.setAttribute('cy', -Math.cos(ang) * bend * 36);
    this.articTxt.textContent = `FLEX ${deg(scope.flex)}°  ROLL ${deg(t)}°`;

    // depth from the start of the trachea; bar scaled to ~300 mm
    const fromCarina = nd.rt.startDist + scope.s;
    const depth = fromCarina + this.tree.nodes[this.tree.rootId].length;
    this.depthTxt.textContent = labelsShown ? `${depth.toFixed(0)} mm` : '— mm';
    this.depthFill.style.width = `${Math.min(100, (depth / 300) * 100)}%`;

    if (labelsShown) {
      this.ro.label.textContent = nd.label;
      this.ro.name.textContent = nd.level === 'trachea' ? nd.name : `${nd.name}${nd.lobe ? ` · ${nd.lobe}` : ''}`;
      this.ro.meta.textContent = `lumen Ø ${(pose.radius * 2).toFixed(1)} mm · ${fromCarina < 0 ? `${(-fromCarina).toFixed(0)} mm above` : `${fromCarina.toFixed(0)} mm below`} carina`;
      const near = nearbyStations(pose.pos).slice(0, 4).map((s) => s.id);
      this.ro.st.textContent = near.length ? `Adjacent nodal stations: ${near.join(' · ')}` : '';
      this.crumb.textContent = routeTo(this.tree, nd.id).map((id) => this.tree.nodes[id].label).join('  ›  ');
    } else {
      this.ro.label.textContent = '? ? ?';
      this.ro.name.textContent = hideReason || 'Labels hidden';
      this.ro.meta.textContent = 'Press L to reveal';
      this.ro.st.textContent = '';
      this.crumb.textContent = '';
    }

    const state = scope.blocked === 'carina' ? ['AIM INTO A LUMEN', 'warn'] : scope.blocked === 'end' ? ['END OF REACH', 'warn'] : ['DRIVE', ''];
    this.status.textContent = state[0];
    this.status.className = `chip ${state[1]}`;
    this.notice.hidden = !scope.blocked;
    if (scope.blocked) this.notice.textContent = scope.blocked === 'carina'
      ? 'Carina ahead: flex the tip (↑/↓) and roll (A/D) to centre a lumen, then advance (W).'
      : 'End of the airway your scope can reach.';
  }
}
