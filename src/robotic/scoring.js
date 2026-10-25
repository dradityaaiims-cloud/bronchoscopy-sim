// Case scoring and teaching feedback. Pure functions (unit-tested).
//
// analysis = {
//   case: {title, diameter, sign, par}, divergenceMm, routeQuality (0..1), routeChosen, routeBest,
//   timeSec, contacts, rebus: [pattern...], cbct: [{edge,inLesion}...], targetUpdated: bool,
//   samples: [{tool, diagnostic, inLesion, minDist, edge, confirmedFirst}] }
//
// Points (100): route 15, time 15, wall contacts 15, confirmation 20, sampling 35.

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const SAMPLE_POINTS = [35, 28, 22, 16];

export function scoreCase(a) {
  const parts = [];
  const add = (label, got, max, note) => parts.push({ label, got: Math.round(got), max, note });

  add('Route choice', 15 * a.routeQuality, 15,
    a.routeQuality > 0.95 ? 'You picked the closest planned airway.' : `Another planned route ended closer to the target (${a.routeBest}).`);

  const par = a.case.par;
  add('Time', clamp(15 * (1 - (a.timeSec - par) / (2 * par)), 0, 15), 15, `${Math.round(a.timeSec)} s (par ${par} s).`);

  add('Airway-wall contacts', clamp(15 - 3 * a.contacts, 0, 15), 15, `${a.contacts} contact${a.contacts === 1 ? '' : 's'} (each costs 3).`);

  const usedR = a.rebus.length > 0, usedC = a.cbct.length > 0;
  const firstSampleConfirmed = a.samples.length ? a.samples[0].confirmedFirst : false;
  const extra = Math.max(0, a.cbct.length - 3);
  add('Confirmation', clamp((usedR ? 8 : 0) + (usedC ? 8 : 0) + (firstSampleConfirmed ? 4 : 0) - 2 * extra, 0, 20), 20,
    `${a.rebus.length} r-EBUS, ${a.cbct.length} CBCT.${firstSampleConfirmed ? '' : ' First sample was not preceded by a confirming view.'}`);

  const win = a.samples.findIndex((s) => s.diagnostic);
  let samp = 0, note = 'No sample was taken.';
  if (win >= 0) { samp = SAMPLE_POINTS[Math.min(win, 3)]; note = `Diagnostic on pass ${win + 1}.`; }
  else if (a.samples.some((s) => s.inLesion)) { samp = 12; note = 'The tool reached the lesion but the specimen was non-diagnostic.'; }
  else if (a.samples.length) { samp = a.samples.some((s) => s.edge < 5) ? 5 : 0; note = 'No sample reached the lesion.'; }
  add('Sampling', samp, 35, note);

  const total = parts.reduce((s, p) => s + p.got, 0);
  return { total, parts, success: win >= 0, feedback: feedback(a, win) };
}

function feedback(a, win) {
  const well = [], improve = [], teach = [];
  const c = a.case;
  const lastCbct = a.cbct[a.cbct.length - 1];

  if (a.routeQuality > 0.95) well.push('Good route choice: the plan ended as close to the target as any candidate.');
  else improve.push('Compare the end-of-route distance for each candidate; the plan that ends closest to the target usually gives the best tool-to-lesion alignment.');
  if (a.contacts === 0) well.push('No airway-wall contacts: smooth, deliberate driving.');
  else if (a.contacts > 3) improve.push('Several wall contacts. Aim the tip into the lumen (flex and roll) before advancing, and withdraw rather than pushing against a carina.');
  if (a.timeSec <= c.par) well.push('Finished within par time.');

  if (!a.rebus.length) improve.push('You did not use radial EBUS. It is the quickest way to ask "is the probe in the lesion?" before committing to a sample.');
  if (!a.cbct.length) improve.push('You did not use cone-beam CT. CBCT is the only view here that shows the catheter and lesion together in 3D, and it catches CT-to-body divergence.');
  if (a.samples.length && !a.samples[0].confirmedFirst) improve.push('Your first sample came before any confirmation. Confirm first; a sample taken beside the lesion looks identical to the operator but is non-diagnostic.');
  if (a.rebus.length && a.cbct.length && a.samples[0]?.confirmedFirst) well.push('You confirmed with both r-EBUS and CBCT before sampling.');

  if (win === 0) well.push('Diagnostic on the first pass.');
  else if (win > 0) well.push(`Diagnostic on pass ${win + 1}: you adjusted and repeated, which is exactly what confirmation imaging is for.`);
  else if (a.samples.length) improve.push('No diagnostic sample. See the tool and position notes below.');

  // case-specific teaching points
  if (c.sign) teach.push('A bronchus sign (an airway on CT leading into the lesion) lets the catheter reach it endoluminally, and is associated with higher diagnostic yield than lesions with no airway leading in.');
  else teach.push('No bronchus sign: no airway leads into the lesion. Expect an eccentric or absent r-EBUS view and consider a needle, which can pass through the airway wall. Yield is generally lower.');
  if (c.diameter < 12) teach.push(`This lesion is small (${c.diameter} mm). Small targets leave little margin for error, so confirmation matters more and specimens are more often non-diagnostic even with good alignment.`);
  else if (c.diameter >= 25) teach.push(`This lesion is large (${c.diameter} mm), so alignment is more forgiving. Even so, confirm: size does not protect against divergence.`);
  if (a.divergenceMm > 6) {
    teach.push(`CT-to-body divergence here was ${a.divergenceMm.toFixed(0)} mm: the displayed target was not where the lesion really was. The plan can look "perfect" while the tool is beside the lesion; r-EBUS or CBCT is how you find out.`);
    const recognised = (lastCbct && lastCbct.edge > 0) || a.rebus.some((p) => p !== 'concentric') || a.targetUpdated;
    if (recognised && win >= 0) well.push('You recognised that the displayed target was off and corrected before the diagnostic sample.');
    else if (!recognised) improve.push('The divergence was never recognised. Look at the r-EBUS pattern and CBCT, not just the planned target.');
  } else if (a.divergenceMm > 0) teach.push(`Divergence was small here (${a.divergenceMm.toFixed(0)} mm), but real divergence varies between patients and during breathing and anaesthesia.`);

  const e = a.rebus[a.rebus.length - 1];
  if (e === 'eccentric') teach.push('An eccentric r-EBUS image means the lesion is beside the probe. It is associated with lower yield than a concentric image, so reposition or choose a tool that can reach it (needle).');
  if (e === 'none') teach.push('No lesion on r-EBUS means the probe is in aerated lung or the lesion is out of range. Do not sample on this; reposition and repeat.');
  if (e === 'concentric') teach.push('A concentric r-EBUS image means the probe is inside the lesion: the best position to sample from.');

  for (const s of a.samples) {
    if (!s.diagnostic && !s.inLesion) improve.push(`${s.tool}: ${s.reason}`);
  }
  if (a.samples.some((s) => s.tool === 'forceps' && !s.inLesion)) teach.push('Forceps have a short reach; they need the tip at or inside the lesion. With no bronchus sign, a needle is usually the better first tool.');
  if (a.samples.some((s) => s.tool === 'brush' && s.inLesion && !s.diagnostic)) teach.push('Brush cytology has a lower yield than forceps or needle even when well placed; combine tools where possible.');

  return { well, improve, teach };
}
