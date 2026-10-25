// DOM builders for the robotic-case screens (case list, planning, CBCT viewer, results).
// Pure presentation: state and callbacks come from modes/robotic.js.
import { el } from '../ui/dom.js';
import { DIFFICULTY } from './cases.js';
import { renderSlice, cbctAssessment } from './cbct.js';
import { PATTERN_TEXT } from './rebus.js';

const li = (t) => el('li', {}, t);

export function caseListView({ cases, best, tree, onPick, onPractice }) {
  const segs = tree.list.filter((n) => n.level === 'segment');
  const seg = el('select', {}, segs.map((s) => el('option', { value: s.id }, `${s.label} · ${s.name} (${s.lobe})`)));
  const size = el('input', { type: 'range', min: 6, max: 30, value: 14 });
  const sizeTx = el('b', {}, '14 mm');
  size.oninput = () => { sizeTx.textContent = `${size.value} mm`; };
  const sign = el('input', { type: 'checkbox', checked: true });
  const div = el('input', { type: 'range', min: 0, max: 20, value: 8 });
  const divTx = el('b', {}, '8 mm');
  div.oninput = () => { divTx.textContent = `${div.value} mm`; };

  const total = cases.reduce((s, c) => s + (best[c.id] || 0), 0);
  return el('div', { class: 'ovl' },
    el('h2', {}, 'Robotic bronchoscopy: cases'),
    el('p', { class: 'muted' }, 'Plan a route, drive the catheter, confirm with r-EBUS and cone-beam CT, then sample. Educational simulation: not for clinical use. Nodules are synthetic.'),
    el('div', { class: 'cards' }, cases.map((c, i) => el('button', { class: 'card', onclick: () => onPick(c) },
      el('div', { class: 'row' }, el('b', {}, `${i + 1}. ${c.title}`), el('span', { class: `chip2 d-${DIFFICULTY(c).toLowerCase()}` }, DIFFICULTY(c))),
      el('div', { class: 'muted' }, `${c.segment} · ${c.diameter} mm · bronchus sign ${c.sign ? 'present' : 'absent'}`),
      el('div', { class: 'muted' }, c.brief),
      el('div', { class: 'best' }, best[c.id] != null ? `Best ${best[c.id]} / 100` : 'Not attempted')))),
    el('div', { class: 'practice' },
      el('h3', {}, 'Practice builder'),
      el('div', { class: 'form' },
        el('label', {}, 'Segment ', seg),
        el('label', {}, 'Nodule size ', size, ' ', sizeTx),
        el('label', { class: 'chk' }, sign, ' Bronchus sign present'),
        el('label', {}, 'CT-to-body divergence ', div, ' ', divTx),
        el('button', { class: 'primary', onclick: () => onPractice({ segment: seg.value, diameter: Number(size.value), sign: sign.checked, divergence: Number(div.value) }) }, 'Start practice case'))),
    el('p', { class: 'muted' }, `Total of best scores: ${total} / ${cases.length * 100}. Scores are stored in this browser only.`));
}

export function planView({ c, nodule, tree, routes, chosenId, onChoose, onStart }) {
  const n = tree.nodes[nodule.ref];
  const rows = routes.map((r) => el('label', { class: `route${chosenId === r.id ? ' on' : ''}` },
    el('input', { type: 'radio', name: 'route', checked: chosenId === r.id, onchange: () => onChoose(r.id) }),
    el('b', {}, `${r.key}  ends at ${tree.nodes[r.id].label}`),
    el('span', { class: 'muted' }, `${r.dist.toFixed(1)} mm from the displayed target · path ${r.pathLen.toFixed(0)} mm · ${r.turns} branchings`)));
  return el('div', { class: 'ovl' },
    el('h2', {}, `Planning: ${c.title}`),
    el('table', { class: 'kv' }, el('tbody', {},
      el('tr', {}, el('th', {}, 'Segment'), el('td', {}, `${n.segment} · ${tree.nodes[n.segment].name} (${n.lobe})`)),
      el('tr', {}, el('th', {}, 'Size'), el('td', {}, `${c.diameter} mm`)),
      el('tr', {}, el('th', {}, 'Bronchus sign'), el('td', {}, c.sign ? 'Present: an airway leads into the lesion' : 'Absent: no airway leads into the lesion')),
      el('tr', {}, el('th', {}, 'CT-to-body divergence'), el('td', {}, 'Unknown until you confirm in the procedure')))),
    el('p', { class: 'muted' }, 'The green sphere on the 3D map is the target as planned from the pre-procedure CT. Choose a route; the auto-generated path is drawn in green. Click a route to preview it.'),
    el('div', { class: 'routes' }, rows),
    el('div', { class: 'row' }, el('button', { class: 'primary', disabled: !chosenId, onclick: onStart }, 'Start navigation')),
    el('ul', { class: 'muted' }, li('Shorter distance to the target usually means better tool alignment.'), li('A bronchus sign means the planned airway can lead you right into the lesion.')));
}

/** CBCT viewer: three planes with sliders. Returns {el, refresh}. */
export function cbctView({ vol, nodule, getShape, getTip, onClose, onUpdate, targetUpdated }) {
  const tip = getTip();
  const pos = { axial: tip[1], coronal: tip[2], sagittal: tip[0] };
  const center = [...tip];
  const canv = {}, sliders = {};
  const rangeOf = { axial: [-190, 125], coronal: [-105, 105], sagittal: [-170, 170] };
  const draw = (p) => renderSlice(canv[p], vol, p, pos[p], { center, fov: 120, nodule, shape: getShape(), tip });
  const panels = ['axial', 'coronal', 'sagittal'].map((p) => {
    canv[p] = el('canvas', { width: 220, height: 220 });
    sliders[p] = el('input', { type: 'range', min: rangeOf[p][0], max: rangeOf[p][1], step: 1, value: Math.round(pos[p]),
      oninput: (e) => { pos[p] = Number(e.target.value); draw(p); } });
    draw(p);
    return el('div', { class: 'plane' }, canv[p], sliders[p]);
  });
  const a = cbctAssessment(tip, nodule);
  const root = el('div', { class: 'ovl' },
    el('h2', {}, 'Cone-beam CT'),
    el('div', { class: 'planes' }, panels),
    el('div', { class: `assess ${a.inLesion ? 'good' : 'bad'}` }, a.text),
    el('p', { class: 'muted' }, 'Real (anonymised, resampled) CT with a synthetic nodule. The bright wire is the catheter, the amber ring its tip. Scroll the sliders through the volume.'),
    el('div', { class: 'row' },
      el('button', { onclick: () => { center[0] = nodule.center[0]; center[1] = nodule.center[1]; center[2] = nodule.center[2]; Object.assign(pos, { axial: nodule.center[1], coronal: nodule.center[2], sagittal: nodule.center[0] }); for (const p of Object.keys(sliders)) { sliders[p].value = Math.round(pos[p]); draw(p); } } }, 'Centre on lesion'),
      el('button', { disabled: targetUpdated, onclick: onUpdate }, targetUpdated ? 'Target already updated' : 'Update target from CBCT'),
      el('button', { class: 'primary', onclick: onClose }, 'Close and adjust')));
  return root;
}

export function resultView({ c, result, onBack, onRetry, onNext, hasNext }) {
  const list = (title, items, cls) => items.length ? el('div', { class: `fb ${cls}` }, el('h3', {}, title), el('ul', {}, items.map(li))) : null;
  return el('div', { class: 'ovl' },
    el('h2', {}, `Result: ${c.title}`),
    el('div', { class: `big ${result.success ? 'good' : 'bad'}` }, `${result.total} / 100`, el('span', {}, result.success ? ' diagnostic sample obtained' : ' no diagnostic sample')),
    el('table', { class: 'kv' }, el('tbody', {}, result.parts.map((p) =>
      el('tr', {}, el('th', {}, p.label), el('td', {}, `${p.got} / ${p.max}`), el('td', { class: 'muted' }, p.note))))),
    list('What went well', result.feedback.well, 'well'),
    list('What to improve', result.feedback.improve, 'improve'),
    list('Teaching points for this case', result.feedback.teach, 'teach'),
    el('p', { class: 'muted' }, 'The 3D map now shows the true lesion (orange) and the CT-planned target (green).'),
    el('div', { class: 'row' }, el('button', { onclick: onBack }, 'Case list'), el('button', { onclick: onRetry }, 'Retry this case'),
      hasNext ? el('button', { class: 'primary', onclick: onNext }, 'Next case') : null));
}

export function rebusCard(canvas, scene) {
  return el('div', { class: 'rebus-card' }, el('div', { class: 'cap' }, 'RADIAL EBUS'), canvas, el('div', { class: `pat ${scene.pattern}` }, scene.pattern.toUpperCase()),
    el('p', {}, PATTERN_TEXT[scene.pattern]),
    scene.pattern === 'eccentric'
      ? el('p', { class: 'hint2' }, `Lesion at ${scene.clock} o'clock, ${scene.gap.toFixed(0)} mm from the probe. To aim a tool: reinsert the probe (P), roll until the lesion is at 12 o'clock, flex up, then remove the probe again.`)
      : null);
}
