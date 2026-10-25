// Boba's tips are plain rules over what the simulator is doing: no AI model, no network.
// Pure functions (testable in Node). Same shape as the ventilator simulator's Boba.
// ctx = { t, mode, labelsShown, node, scope: {blocked, s}, near: [stationIds],
//         flags: {flexed, rolled, moved, usedLabels, usedNodes, openedLearn, toured},
//         quiz: {answered, secs} | null, nav: {secs, hint, done} | null }

export const RULES = [
  // robotic case (ctx.rob = {stage, probeIn, distance, offRoute, offSecs, rebusLast, rebusN, cbctN, samples, chosen})
  { id: 'rob-plan', cool: 90e3, when: (c) => c.mode === 'robotic' && c.rob?.stage === 'plan' && !c.rob.chosen, text: () => 'Pick a route: the one ending closest to the green target usually gives the best tool alignment. Click a route to preview it on the 3D map.' },
  { id: 'rob-near', cool: 120e3, when: (c) => c.mode === 'robotic' && c.rob?.stage === 'nav' && c.rob.probeIn && c.rob.distance < 14 && c.rob.rebusN + c.rob.cbctN === 0, text: () => 'You are close to the target. Press P to remove the vision probe, then E for radial EBUS. Do not sample before you have confirmed.' },
  { id: 'rob-confirm', cool: 120e3, when: (c) => c.mode === 'robotic' && c.rob?.stage === 'nav' && !c.rob.probeIn && c.rob.rebusN + c.rob.cbctN === 0, text: () => 'Probe is out. Confirm first: E for radial EBUS or C for cone-beam CT, then pick a tool and sample.' },
  { id: 'rob-ecc', cool: 90e3, when: (c) => c.mode === 'robotic' && c.rob?.rebusLast === 'eccentric', text: () => 'Eccentric means the lesion is beside the probe, at the clock position on the card. Roll it to 12 o\'clock with the probe in, flex up, remove the probe, and a needle can reach it. Check with CBCT (C); if the target is wrong, update it.' },
  { id: 'rob-none', cool: 90e3, when: (c) => c.mode === 'robotic' && c.rob?.rebusLast === 'none', text: () => 'No lesion on r-EBUS. You may be in the wrong airway: the displayed target can be off (CT-to-body divergence). Try CBCT, update the target, and re-route.' },
  { id: 'rob-off', cool: 60e3, when: (c) => c.mode === 'robotic' && c.rob?.stage === 'nav' && c.rob.offRoute && c.rob.offSecs > 8, text: () => 'You have left the planned route. Withdraw with S to the last airway on the green path and take the other branch.' },

  { id: 'move', cool: 1e12, when: (c) => c.t > 25 && !c.flags.moved, text: () => 'Hold W to advance the scope and S to withdraw. Hold Shift for slow, fine control.' },
  { id: 'blocked', cool: 90e3, when: (c) => c.scope.blocked === 'carina', text: () => 'The scope will not enter a branch unless you aim at it. Press ↑ to flex the tip, then A or D to roll it until a lumen is centred, then advance with W.' },
  { id: 'flex', cool: 1e12, when: (c) => c.t > 60 && c.flags.moved && !c.flags.flexed, text: () => 'Try ↑ to flex the tip. Real bronchoscopes bend in one plane, so you aim by flexing and rolling. Space straightens the tip.' },
  { id: 'roll', cool: 1e12, when: (c) => c.t > 80 && c.flags.flexed && !c.flags.rolled, text: () => 'Now roll the shaft with A or D while the tip is flexed. Watch the 3D compass in the corner turn with you.' },
  { id: 'quiz-clue', cool: 60e3, when: (c) => c.mode === 'quiz' && c.quiz && !c.quiz.answered && c.quiz.secs > 45,
    text: () => 'Stuck? Slide along the airway with W and S to find the next carina. Cartilage rings mean a large airway; check the compass for anterior or posterior; then think about which branch has that shape.' },
  { id: 'nav-hint', cool: 90e3, when: (c) => c.mode === 'navigate' && c.nav && !c.nav.done && !c.nav.hint && c.nav.secs > 60, text: () => 'Lost? Press T to show the route to your target.' },
  { id: 'try-labels', cool: 1e12, when: (c) => c.mode === 'explore' && c.t > 120 && !c.flags.usedLabels, text: () => 'Press L to hide the labels and test yourself.' },
  { id: 'try-ebus', cool: 1e12, when: (c) => (c.mode === 'explore' || c.mode === 'navigate') && c.t > 150 && !c.flags.usedEbus, text: () => 'Press E for convex EBUS: an ultrasound sector that shows the lymph nodes next to the scope. Roll the scope (A/D) to sweep the plane. C opens CT guidance with the node stations outlined.' },
  { id: 'try-section', cool: 1e12, when: (c) => c.t > 220 && !c.flags.usedSection, text: () => 'Press X to cut the 3D map: axial, coronal or sagittal. Tick "at tip" to keep the cut at the scope, and "CT slice" to see the same plane on the CT.' },
  { id: 'try-nodes', cool: 1e12, when: (c) => c.t > 100 && !c.flags.usedNodes, text: () => 'See the green ovals in the 3D map? They are lymph node stations. Click one for its location and how it is sampled. N hides them.' },
  { id: 'near-stations', cool: 120e3, when: (c) => c.labelsShown && c.near.length > 0 && c.mode === 'explore' && c.t > 60,
    text: (c) => `Nodal stations ${c.near.slice(0, 3).join(', ')} sit right next to you. An EBUS scope samples nodes like these through the airway wall.` },
  { id: 'learn', cool: 1e12, when: (c) => c.t > 200 && !c.flags.openedLearn, text: () => 'The Learn tab covers lobes, airways, how bronchoscopes and robotic catheters work, and the techniques used.' },
  { id: 'tour', cool: 1e12, when: (c) => c.t > 40 && !c.flags.toured, text: () => 'New here? The Tour walks through every part of the screen in about two minutes.' },
  // first time in a named airway: show its teaching text (only when labels are visible)
  { id: 'node', cool: 1e12, when: (c) => c.labelsShown && c.mode === 'explore' && c.node && c.node.level !== 'subsegment' && c.node.level !== 'distal' && !c.seenNodes?.has(c.node.id),
    text: (c) => `${c.node.label}: ${c.node.desc}` },
];

export const GENERAL = [
  'The right main bronchus is shorter, wider and more vertical than the left.',
  'At the carina, anterior is at the top of the image and the right bronchus is on the right when roll is zero.',
  'The RUL bronchus trifurcates: RB1 apical, RB2 posterior, RB3 anterior.',
  'RB6, the superior segment of the right lower lobe, arises posteriorly, directly opposite the middle lobe origin.',
  'The lingula is the left-sided equivalent of the right middle lobe.',
  'Cartilage rings run around the front and sides of the airway; the back wall of the trachea is a flat membrane.',
  'Station 7 (subcarinal) is a favourite EBUS target. Click it in the 3D map.',
  'Rolling the shaft with a flexed tip sweeps the aim around a circle.',
  'Press G to switch the robotic-console overlay on or off.',
  'Press H any time for the list of controls.',
  'This is a teaching tool with schematic anatomy. It is not for clinical use.',
];

// Returns the first rule that applies and is not on cooldown; `fired` maps id -> last time (ms).
export function nextRule(ctx, fired, now) {
  for (const r of RULES) {
    const key = r.id === 'node' && ctx.node ? `node:${ctx.node.id}` : r.id;
    if (now - (fired.get(key) ?? -Infinity) < r.cool) continue;
    let ok = false; try { ok = !!r.when(ctx); } catch { ok = false; }
    if (ok) return { ...r, key };
  }
  return null;
}
