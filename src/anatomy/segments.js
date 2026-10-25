// Standard tracheobronchial nomenclature (Boyden / Jackson-Huber) as data.
//
// Coordinate system (mm, origin at the carina):
//   +x = patient's LEFT, +y = SUPERIOR, +z = ANTERIOR  (right-handed)
// `dir` is the departure direction of each branch from its parent's end point
// (the generator curves smoothly from the parent's heading into it).
// `len` / `dia` are schematic adult values, not measurements of any patient.
//
// Left-sided fused segments follow the usual convention: LB1+2 (apicoposterior)
// and LB7+8 (anteromedial basal); there is no separate LB7.

export const LOBE_INFO = {
  RUL: { name: 'Right upper lobe', color: '#4ea8de' },
  RML: { name: 'Right middle lobe', color: '#f6c445' },
  RLL: { name: 'Right lower lobe', color: '#5fd08a' },
  LUL: { name: 'Left upper lobe', color: '#ee6c9a' },
  LING: { name: 'Lingula (left upper lobe)', color: '#ffb3cf' },
  LLL: { name: 'Left lower lobe', color: '#a98bf0' },
};

// Compact constructor: [id, parent, level, zone, label, name, dir, len, dia, desc]
const n = (id, parent, level, zone, label, name, dir, len, dia, desc) => ({
  id, parent, level, zone, label, name, dir, len, dia, desc,
  lobe: zone === 'LING' ? 'LUL' : zone, // anatomic lobe (lingula belongs to LUL)
});

// Parents always appear before their children.
export const SPEC = [
  n('TR', null, 'trachea', null, 'Trachea', 'Trachea', [0, -0.994, -0.109], 110, 18,
    'C-shaped cartilage rings anteriorly and laterally; flat posterior membranous wall. Ends at the carina.'),

  // ── main bronchi ────────────────────────────────────────────────────────
  n('RMB', 'TR', 'main', null, 'RMB', 'Right main bronchus', [-0.4, -0.91, -0.1], 24, 13.5,
    'Shorter (~2.5 cm), wider and more vertical than the left, so aspirated material and misplaced tubes favour the right.'),
  n('LMB', 'TR', 'main', null, 'LMB', 'Left main bronchus', [0.72, -0.68, -0.1], 48, 11.5,
    'Longer (~5 cm), narrower and more horizontal; passes beneath the aortic arch.'),

  // ── right lung ──────────────────────────────────────────────────────────
  n('RUL', 'RMB', 'lobar', 'RUL', 'RUL', 'Right upper lobe bronchus', [-0.88, 0.46, 0.06], 13, 10,
    'Arises laterally from the RMB about 2 cm below the carina and trifurcates into RB1, RB2, RB3.'),
  n('BI', 'RMB', 'division', null, 'BI', 'Bronchus intermedius', [-0.2, -0.97, -0.1], 40, 11,
    'Continuation of the RMB below the RUL origin; ends by dividing into the RML and RLL bronchi.'),
  n('RML', 'BI', 'lobar', 'RML', 'RML', 'Right middle lobe bronchus', [-0.45, -0.45, 0.77], 17, 7.5,
    'Arises anterolaterally from the bronchus intermedius, opposite the superior segment (RB6) of the RLL. Divides into RB4 and RB5.'),
  n('RLL', 'BI', 'lobar', 'RLL', 'RLL', 'Right lower lobe bronchus', [-0.2, -0.97, -0.12], 16, 9.5,
    'Gives off RB6 (superior segment) posteriorly, then continues as the basal trunk.'),
  n('RBT', 'RLL', 'division', 'RLL', 'RLL basal trunk', 'Right lower lobe basal trunk', [-0.18, -0.97, -0.14], 18, 8.5,
    'Divides into the four basal segments: RB7 (medial), RB8 (anterior), RB9 (lateral), RB10 (posterior).'),

  n('RB1', 'RUL', 'segment', 'RUL', 'RB1', 'Apical segment', [-0.25, 0.96, 0.08], 32, 5.5,
    'RUL trifurcation: RB1 runs superiorly toward the lung apex.'),
  n('RB2', 'RUL', 'segment', 'RUL', 'RB2', 'Posterior segment', [-0.55, 0.38, -0.7], 30, 5.0,
    'RUL trifurcation: RB2 runs posteriorly and laterally.'),
  n('RB3', 'RUL', 'segment', 'RUL', 'RB3', 'Anterior segment', [-0.5, 0.2, 0.84], 34, 5.5,
    'RUL trifurcation: RB3 runs anteriorly.'),
  n('RB4', 'RML', 'segment', 'RML', 'RB4', 'Lateral segment', [-0.8, -0.3, 0.5], 28, 4.8,
    'RML: RB4 is the lateral of the two segments.'),
  n('RB5', 'RML', 'segment', 'RML', 'RB5', 'Medial segment', [-0.05, -0.5, 0.86], 28, 4.6,
    'RML: RB5 is the medial segment, lying against the heart border.'),
  n('RB6', 'RLL', 'segment', 'RLL', 'RB6', 'Superior segment', [-0.3, 0.12, -0.94], 28, 6.0,
    'Arises posteriorly from the RLL bronchus, directly opposite the RML origin.'),
  n('RB7', 'RBT', 'segment', 'RLL', 'RB7', 'Medial basal segment', [0.35, -0.6, 0.7], 26, 5.0,
    'Medial (cardiac) basal segment; arises medially and anteriorly. Has no separate left counterpart (LB7+8).'),
  n('RB8', 'RBT', 'segment', 'RLL', 'RB8', 'Anterior basal segment', [-0.35, -0.55, 0.75], 36, 5.5,
    'Anterior basal segment of the RLL.'),
  n('RB9', 'RBT', 'segment', 'RLL', 'RB9', 'Lateral basal segment', [-0.9, -0.4, 0.05], 36, 5.5,
    'Lateral basal segment of the RLL.'),
  n('RB10', 'RBT', 'segment', 'RLL', 'RB10', 'Posterior basal segment', [-0.2, -0.6, -0.78], 38, 5.8,
    'Posterior basal segment of the RLL; the most dependent segment when supine.'),

  // ── left lung ───────────────────────────────────────────────────────────
  n('LUL', 'LMB', 'lobar', 'LUL', 'LUL', 'Left upper lobe bronchus', [0.55, 0.35, 0.7], 14, 9.5,
    'Arises anterolaterally from the LMB and splits into the superior division and the lingular bronchus.'),
  n('LLL', 'LMB', 'lobar', 'LLL', 'LLL', 'Left lower lobe bronchus', [0.3, -0.94, -0.15], 24, 9.5,
    'Gives off LB6 (superior segment) posteriorly, then continues as the basal trunk.'),
  n('LSD', 'LUL', 'division', 'LUL', 'LUL superior division', 'Superior division of LUL', [0.15, 0.9, 0.3], 16, 7.5,
    'Divides into LB1+2 (apicoposterior) and LB3 (anterior).'),
  n('LING', 'LUL', 'division', 'LING', 'Lingular bronchus', 'Lingular bronchus', [0.55, -0.55, 0.62], 16, 7.5,
    'Left equivalent of the RML: arises inferiorly from the LUL bronchus and divides into LB4 and LB5.'),
  n('LBT', 'LLL', 'division', 'LLL', 'LLL basal trunk', 'Left lower lobe basal trunk', [0.3, -0.94, -0.14], 20, 8.5,
    'Divides into LB7+8 (anteromedial basal), LB9 (lateral basal) and LB10 (posterior basal).'),

  n('LB1+2', 'LSD', 'segment', 'LUL', 'LB1+2', 'Apicoposterior segment', [0.25, 0.8, -0.55], 38, 5.5,
    'Fused apical and posterior segments of the LUL; runs superiorly and posteriorly.'),
  n('LB3', 'LSD', 'segment', 'LUL', 'LB3', 'Anterior segment', [0.45, 0.25, 0.86], 34, 5.2,
    'Anterior segment of the LUL; runs anteriorly.'),
  n('LB4', 'LING', 'segment', 'LING', 'LB4', 'Superior lingular segment', [0.8, -0.2, 0.55], 28, 4.6,
    'Upper lingular segment (counterpart of RB4).'),
  n('LB5', 'LING', 'segment', 'LING', 'LB5', 'Inferior lingular segment', [0.35, -0.8, 0.5], 28, 4.6,
    'Lower lingular segment (counterpart of RB5).'),
  n('LB6', 'LLL', 'segment', 'LLL', 'LB6', 'Superior segment', [0.35, 0.1, -0.93], 28, 6.0,
    'Arises posteriorly from the LLL bronchus at the level of the lingular origin.'),
  n('LB7+8', 'LBT', 'segment', 'LLL', 'LB7+8', 'Anteromedial basal segment', [0.15, -0.6, 0.78], 36, 5.5,
    'Fused medial and anterior basal segments of the LLL.'),
  n('LB9', 'LBT', 'segment', 'LLL', 'LB9', 'Lateral basal segment', [0.9, -0.4, 0.0], 36, 5.3,
    'Lateral basal segment of the LLL.'),
  n('LB10', 'LBT', 'segment', 'LLL', 'LB10', 'Posterior basal segment', [0.3, -0.55, -0.78], 38, 5.8,
    'Posterior basal segment of the LLL.'),
];

/** Levels the quiz / navigation modes treat as "named" airways. */
export const NAMED_LEVELS = ['main', 'lobar', 'division', 'segment'];

/** Cartilage-ring look per level: [strength 0-1, spacing mm]. */
export const RING_STYLE = {
  trachea: [1.0, 4.6],
  main: [0.9, 3.8],
  lobar: [0.75, 3.0],
  division: [0.7, 2.8],
  segment: [0.45, 2.4],
  subsegment: [0.2, 1.8],
  distal: [0.1, 1.5],
};
