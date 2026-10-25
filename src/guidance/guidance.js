// EBUS and CT guidance for Free explore and Navigate: two floating panels over the scope view.
//   E  convex-probe EBUS sector (lymph nodes, vessels, esophagus, heart, airway wall) + a fan on the 3D map
//   C  live CT slices at the scope tip, lymph node stations outlined and labelled
// Not available in the quiz (it would give the answer away). Robotic case mode has its own r-EBUS / CBCT.
import { el } from '../ui/dom.js';
import { STATIONS } from '../anatomy/lymphNodes.js';
import { buildEbusScene, drawEbus, scanPlane, EBUS } from './ebus.js';
import { loadCtVolume, renderSlice, PLANES } from '../robotic/cbct.js';
import { catheterShape } from '../robotic/catheter.js';

export class Guidance {
  /** @param {{tree, scope, overview, getLabels: () => boolean, onUse: (kind) => void}} o */
  constructor({ tree, scope, overview, getLabels, onUse }) {
    Object.assign(this, { tree, scope, overview, getLabels, onUse });
    this.scene = buildEbusScene(tree);
    this.host = el('div', { class: 'guidance' });
    document.getElementById('scopePane').append(this.host);
    this.enabled = true;
    this.last = 0;
    this.frame = 0;
    this.plane = 'axial';
    this.live = true;
    this.pos = 0;
  }

  setMode(id) {
    this.enabled = id === 'explore' || id === 'navigate';
    if (!this.enabled) this.closeAll();
  }

  closeAll() { this.closeEbus(); this.closeCt(); }

  toggle(kind) {
    if (!this.enabled) { this.toast('EBUS and CT guidance are available in Free explore and Navigate.'); return false; }
    if (kind === 'ebus') this.ebus ? this.closeEbus() : this.openEbus();
    else this.ct ? this.closeCt() : this.openCt();
    return true;
  }

  toast(msg) {
    const t = el('div', { class: 'gtoast' }, msg);
    this.host.append(t);
    setTimeout(() => t.remove(), 2800);
  }

  card(title, body, onClose) {
    return el('div', { class: 'gcard' }, el('div', { class: 'ghead' }, el('b', {}, title), el('button', { class: 'mini', onclick: onClose, 'aria-label': `Close ${title}` }, '×')), ...body);
  }

  // ── convex EBUS ───────────────────────────────────────────────────────
  openEbus() {
    this.onUse('ebus');
    const canvas = el('canvas', { width: 240, height: 180 });
    this.ebusCaption = el('p', { class: 'cap2' });
    this.ebus = { canvas, el: this.card('CONVEX EBUS', [canvas,
      el('p', { class: 'cap2 muted' }, 'The probe scans toward 12 o\'clock of the camera image. Roll the scope (A/D) to sweep.'), this.ebusCaption], () => this.closeEbus()) };
    this.host.prepend(this.ebus.el);
  }

  closeEbus() {
    if (!this.ebus) return;
    this.ebus.el.remove(); this.ebus = null;
    this.overview.setEbusFan(null);
  }

  // ── CT guidance ───────────────────────────────────────────────────────
  async openCt() {
    this.onUse('ct');
    this.vol ||= await loadCtVolume();
    if (!this.vol) { this.toast('CT volume not available in this build.'); return; }
    if (this.ct) return;
    const canvas = el('canvas', { width: 240, height: 240 });
    const tabs = el('div', { class: 'gtabs' }, Object.keys(PLANES).map((p) => el('button', { class: p === this.plane ? 'active' : '', onclick: (e) => { this.plane = p; tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b === e.currentTarget)); this.last = 0; } }, PLANES[p].name)));
    const slider = el('input', { type: 'range', min: -190, max: 125, value: 0, disabled: true, oninput: (e) => { this.pos = Number(e.target.value); this.last = 0; } });
    const live = el('input', { type: 'checkbox', checked: true, onchange: (e) => { this.live = e.target.checked; slider.disabled = this.live; this.last = 0; } });
    this.ctSlider = slider;
    this.ct = { canvas, el: this.card('CT GUIDANCE', [tabs, canvas,
      el('label', { class: 'glive' }, live, ' follow tip', slider),
      el('p', { class: 'cap2 muted' }, 'Registered CT (anonymised, public dataset). Green ovals are schematic nodal stations; the bright wire is the scope path.')], () => this.closeCt()) };
    this.host.append(this.ct.el);
    this.last = 0;
  }

  /** Open the CT panel on a given plane at a fixed position (used by the 3D map's cross-section). */
  async focusCt(plane, pos) {
    if (!this.enabled) { this.toast('CT guidance is available in Free explore and Navigate.'); return; }
    if (!this.ct) await this.openCt();
    if (!this.ct) return;
    this.plane = plane; this.live = false; this.pos = pos;
    this.ct.el.querySelector('input[type=checkbox]').checked = false;
    this.ctSlider.disabled = false;
    this.ct.el.querySelectorAll('.gtabs button').forEach((b) => b.classList.toggle('active', b.textContent.toLowerCase() === plane));
    this.last = 0;
  }

  closeCt() { if (this.ct) { this.ct.el.remove(); this.ct = null; } }

  // ── per-frame ─────────────────────────────────────────────────────────
  update(now) {
    if (!this.enabled || (!this.ebus && !this.ct) || now - this.last < 160) return;
    this.last = now;
    const pose = this.scope.pose;
    if (this.ebus) {
      const vis = drawEbus(this.ebus.canvas, this.scene, pose, { frame: (this.frame++ / 6) | 0, labels: this.getLabels() });
      this.ebusCaption.textContent = vis.length
        ? vis.map((v) => `Station ${v.st.id}: ${v.diam.toFixed(0)} mm, ${v.depth.toFixed(0)} mm deep`).join(' · ')
        : 'No lymph node in this plane. Roll toward a station or move closer.';
      this.overview.setEbusFan(scanPlane(pose), EBUS);
    }
    if (this.ct) {
      const tip = pose.pos, fixed = PLANES[this.plane].fixed;
      if (this.live) { this.pos = tip[fixed]; this.ctSlider.value = Math.round(this.pos); }
      this.ctSlider.min = fixed === 1 ? -190 : fixed === 2 ? -105 : -170; this.ctSlider.max = fixed === 1 ? 125 : fixed === 2 ? 105 : 170;
      renderSlice(this.ct.canvas, this.vol, this.plane, this.pos, {
        center: tip, fov: 120, stations: STATIONS, labels: this.getLabels(), shape: catheterShape(this.tree, this.scope, 0.8), tip,
      });
    }
  }
}
