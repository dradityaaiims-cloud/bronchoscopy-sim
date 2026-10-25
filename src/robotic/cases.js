// Teaching cases. Nodules are synthetic. `ref` is the airway whose end the lesion sits at.
// divergence = displayed CT target minus true lesion (mm): what the user must recognise and correct.
// Difficulty is a mix of segment, size, bronchus sign and divergence.

export const CASES = [
  { id: 'c1', title: 'Warm-up: right apical nodule', segment: 'RB1', ref: 'RB1a1', diameter: 22, sign: true, divergence: [2, -2, 1], par: 150,
    brief: 'A 22 mm nodule in the right upper lobe apical segment with a clear bronchus sign. CT-to-body divergence is small.' },
  { id: 'c2', title: 'Anterior right upper lobe', segment: 'RB3', ref: 'RB3b1', diameter: 14, sign: true, divergence: [3, 3, -2], par: 170,
    brief: 'A 14 mm anterior segment nodule. A bronchus sign is present. Watch the anterior-facing branches.' },
  { id: 'c3', title: 'Superior segment, right lower lobe', segment: 'RB6', ref: 'RB6a2', diameter: 16, sign: true, divergence: [4, -4, 3], par: 190,
    brief: 'A 16 mm nodule in RB6, which arises posteriorly opposite the middle lobe origin.' },
  { id: 'c4', title: 'Lingula, no bronchus sign', segment: 'LB5', ref: 'LB5b1', diameter: 18, sign: false, gap: 4, seed: 3, divergence: [3, -3, 2], par: 200,
    brief: 'An 18 mm lingular nodule. No airway leads into it, so expect an eccentric r-EBUS view and consider the needle.' },
  { id: 'c5', title: 'Posterior basal, large divergence', segment: 'LB10', ref: 'LB10a1', diameter: 20, sign: true, divergence: [-13.3, 0.3, -3.1], par: 230,
    brief: 'A 20 mm LLL posterior basal nodule. The CT plan is about 14 mm off and points at a neighbouring airway. Confirm before you sample.' },
  { id: 'c6', title: 'Small RML nodule, no sign, divergence', segment: 'RB4', ref: 'RB4a1', diameter: 10, sign: false, gap: 6, seed: 5, divergence: [5.7, -10.5, 4], par: 260,
    brief: 'A 10 mm right middle lobe nodule, no bronchus sign, and the displayed target is off by about 12 mm. A hard one.' },
  { id: 'c7', title: 'Anterior basal, large and clear', segment: 'RB8', ref: 'RB8b2', diameter: 28, sign: true, divergence: [5, 6, -4], par: 190,
    brief: 'A 28 mm RLL anterior basal nodule with a bronchus sign. Large lesions are forgiving; do not skip confirmation.' },
  { id: 'c8', title: 'Apicoposterior LUL, expert', segment: 'LB1+2', ref: 'LB1+2a2', diameter: 9, sign: false, gap: 8, seed: 11, divergence: [5, 7, -4], par: 260,
    brief: 'A 9 mm peripheral nodule, no bronchus sign, with divergence. Plan carefully and confirm with both r-EBUS and CBCT.' },
];

export const DIFFICULTY = (c) => {
  const d = (c.sign ? 0 : 2) + (c.diameter < 12 ? 2 : c.diameter < 18 ? 1 : 0) + (Math.hypot(...c.divergence) > 10 ? 3 : Math.hypot(...c.divergence) > 8 ? 2 : Math.hypot(...c.divergence) > 5 ? 1 : 0);
  return d >= 5 ? 'Expert' : d >= 3 ? 'Hard' : d >= 1 ? 'Medium' : 'Easy';
};
