// Bronchoscope state: which branch, how far along it, shaft roll and tip flexion.
// Pure JS (no three.js) so it is unit-testable.
//
// Camera model: the shaft follows the centerline frame (T, U, R). Rolling the
// shaft by `roll` rotates the bending plane about T; flexing by `flex` tilts the
// view toward that plane's "up". Rolling with a flexed tip therefore sweeps the
// aim around a cone, as with a real instrument.
import * as V from '../anatomy/math.js';
import { sampleNode } from '../anatomy/airwayTree.js';

const ENTER_ANGLE = (15 * Math.PI) / 180; // aim must be within this of a lumen to enter it
export const FLEX_MIN = (-110 * Math.PI) / 180;
export const FLEX_MAX = (130 * Math.PI) / 180;

export class Scope {
  constructor(tree) {
    this.tree = tree;
    this.listeners = [];
    this.confine = null; // node id to stay inside (quiz), or null
    this.reset();
  }

  /** Subscribe to {type:'enter'|'teleport', from, to}. */
  on(fn) { this.listeners.push(fn); }
  _emit(e) { this.listeners.forEach((fn) => fn(e)); }

  get node() { return this.tree.nodes[this.nodeId]; }

  /** Carina view: just inside the trachea, looking down at the carina. */
  reset() { this.place('TR', this.tree.nodes.TR.length - 14); }

  place(nodeId, s, { roll = 0, flex = 0 } = {}) {
    const from = this.nodeId;
    this.nodeId = nodeId;
    this.s = V.clamp(s, 0, this.node.length);
    this.roll = roll;
    this.flex = flex;
    this.blocked = null;
    this._emit({ type: 'teleport', from, to: nodeId });
  }

  /** World-space camera pose. */
  get pose() {
    const fr = sampleNode(this.node, this.s);
    const upRoll = V.add(V.scale(fr.U, Math.cos(this.roll)), V.scale(fr.R, Math.sin(this.roll)));
    const f = V.add(V.scale(fr.T, Math.cos(this.flex)), V.scale(upRoll, Math.sin(this.flex)));
    const up = V.add(V.scale(fr.T, -Math.sin(this.flex)), V.scale(upRoll, Math.cos(this.flex)));
    return { pos: fr.pos, f, up, right: V.cross(f, up), radius: fr.radius, frame: fr };
  }

  rollBy(d) { this.roll = (this.roll + d) % (2 * Math.PI); }
  flexBy(d) { this.flex = V.clamp(this.flex + d, FLEX_MIN, FLEX_MAX); }

  /** Advance (+) or withdraw (-) along the centerline by `ds` mm. */
  move(ds) {
    const keepF = this.pose;
    let s = this.s + ds;
    this.blocked = null;
    if (this.confine) {
      this.s = V.clamp(s, 0, this.node.length - 0.5);
      return;
    }
    for (let guard = 0; guard < 4; guard++) {
      const nd = this.node;
      if (s > nd.length) {
        const child = this._pickChild(nd, keepF.f);
        if (!child) {
          this.blocked = nd.children.length ? 'carina' : 'end';
          s = nd.children.length ? nd.length : nd.length - 1.5;
          break;
        }
        s -= nd.length;
        this._switch(child.id, s, keepF);
      } else if (s < 0) {
        if (!nd.parent) { s = 0; break; }
        const p = this.tree.nodes[nd.parent];
        s = p.length + s;
        this._switch(p.id, s, keepF);
      } else break;
    }
    this.s = V.clamp(s, 0, this.node.length);
  }

  /** Child whose overall heading is nearest the aim, if within ENTER_ANGLE. */
  _pickChild(nd, aim) {
    let best = null;
    let bestAng = ENTER_ANGLE;
    for (const id of nd.children) {
      const ch = this.tree.nodes[id];
      const c = ch.centerline;
      const heading = V.sub(c[c.length - 1], c[0]);
      const a = V.angleBetween(aim, heading);
      if (a < bestAng) { bestAng = a; best = ch; }
    }
    return best;
  }

  /** Change branch while keeping the camera's world orientation as close as possible. */
  _switch(nodeId, s, keep) {
    const from = this.nodeId;
    this.nodeId = nodeId;
    this.s = s;
    const fr = sampleNode(this.node, s);
    const cosA = V.clamp(V.dot(keep.f, fr.T), -1, 1);
    let flex = Math.acos(cosA);
    const perp = V.perpUnit(keep.f, fr.T);
    let roll = this.roll;
    if (perp) {
      roll = Math.atan2(V.dot(perp, fr.R), V.dot(perp, fr.U));
      // choose between (roll, +flex) and (roll+pi, -flex) so the image doesn't flip
      const up1 = V.add(V.scale(fr.T, -Math.sin(flex)), V.scale(perp, Math.cos(flex)));
      if (V.dot(up1, keep.up) < 0) { roll += Math.PI; flex = -flex; }
    } else flex = 0;
    this.roll = roll;
    this.flex = V.clamp(flex, FLEX_MIN, FLEX_MAX);
    this._emit({ type: 'enter', from, to: nodeId });
  }
}
