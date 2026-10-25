// IASLC (2009) lymph node stations, schematic positions in the same frame as the
// airway tree (mm, origin at carina; +x patient left, +y superior, +z anterior).
// Positions/sizes are illustrative, not measurements. Stations 1 and 14 are omitted.
// access: how the station is usually sampled (teaching summary, not a protocol).

export const STATIONS = [
  { id: '2R', name: 'Upper paratracheal (right)', pos: [-17, 62, 10], r: 6.5, access: 'EBUS',
    desc: 'Right of the trachea from the top of the manubrium to where the innominate vein crosses the trachea; extends to the left tracheal border.' },
  { id: '2L', name: 'Upper paratracheal (left)', pos: [16, 62, 8], r: 6, access: 'EBUS',
    desc: 'Left of the trachea from the top of the manubrium to the top of the aortic arch.' },
  { id: '4R', name: 'Lower paratracheal (right)', pos: [-17, 28, 5], r: 7.5, access: 'EBUS',
    desc: 'Right of the trachea from the innominate vein crossing down to the lower border of the azygos arch; includes pretracheal nodes up to the left tracheal border.' },
  { id: '4L', name: 'Lower paratracheal (left)', pos: [18, 20, -2], r: 6.5, access: 'EBUS',
    desc: 'Left of the trachea from the top of the aortic arch to the upper rim of the left pulmonary artery, medial to the ligamentum arteriosum.' },
  { id: '5', name: 'Subaortic (aortopulmonary window)', pos: [30, 6, 14], r: 6, access: 'Surgical',
    desc: 'Lateral to the ligamentum arteriosum, in the aortopulmonary window. Usually outside EBUS reach; sampled by extended mediastinoscopy or anterior mediastinotomy.' },
  { id: '6', name: 'Para-aortic', pos: [12, 38, 38], r: 6, access: 'Surgical',
    desc: 'Anterior and lateral to the ascending aorta and arch. Usually sampled surgically (anterior mediastinotomy).' },
  { id: '7', name: 'Subcarinal', pos: [2, -24, -16], r: 7.5, access: 'EBUS',
    desc: 'Below the carina, between the main bronchi, not extending to the lower-lobe bronchi. Reached by EBUS from the carina/main bronchi or by EUS.' },
  { id: '8', name: 'Paraesophageal', pos: [8, -60, -22], r: 6.5, access: 'EUS',
    desc: 'Adjacent to the esophagus below the carina. Typically sampled by endoscopic ultrasound (EUS-FNA).' },
  { id: '9', name: 'Pulmonary ligament', pos: [-22, -140, -26], r: 6, access: 'EUS',
    desc: 'Within the pulmonary ligament, low in the chest. Sometimes reached by EUS.' },
  { id: '10R', name: 'Hilar (right)', pos: [-16, -5, 10], r: 6, access: 'EBUS',
    desc: 'Adjacent to the right main bronchus and hilar vessels, immediately beyond the mediastinal pleural reflection.' },
  { id: '10L', name: 'Hilar (left)', pos: [27, -10, -12], r: 6, access: 'EBUS',
    desc: 'Adjacent to the left main bronchus and hilar vessels.' },
  { id: '11Rs', name: 'Interlobar, superior (right)', pos: [-22, -36, 4], r: 5.5, access: 'EBUS',
    desc: 'Between the right upper lobe bronchus and the bronchus intermedius.' },
  { id: '11Ri', name: 'Interlobar, inferior (right)', pos: [-27, -60, 3], r: 5.5, access: 'EBUS',
    desc: 'Between the middle and lower lobe bronchi.' },
  { id: '11L', name: 'Interlobar (left)', pos: [50, -41, 2], r: 5.5, access: 'EBUS',
    desc: 'Between the left upper and lower lobe bronchi.' },
  { id: '12R', name: 'Lobar (right)', pos: [-31, -72, -6], r: 5, access: 'EBUS',
    desc: 'Adjacent to the right lobar bronchi, within the lung hilum; small and often only accessible by EBUS when enlarged.' },
  { id: '12L', name: 'Lobar (left)', pos: [53, -60, -8], r: 5, access: 'EBUS',
    desc: 'Adjacent to the left lobar bronchi, within the lung hilum.' },
];

/** Stations whose centre lies within `maxMm` of `pos`, nearest first. */
export function nearbyStations(pos, maxMm = 26) {
  return STATIONS
    .map((s) => ({ s, d: Math.hypot(pos[0] - s.pos[0], pos[1] - s.pos[1], pos[2] - s.pos[2]) - s.r }))
    .filter((x) => x.d < maxMm)
    .sort((a, b) => a.d - b.d)
    .map((x) => x.s);
}

/** Nodes are drawn as ellipsoids: wider side to side than front to back (same on the map, EBUS and CT). */
export const NODE_SCALE = [1.25, 0.9, 1];

/** Normalised distance from the station's centre: <1 inside, 1 on the surface. */
export const stationNorm = (st, p) => Math.hypot(
  (p[0] - st.pos[0]) / (st.r * NODE_SCALE[0]),
  (p[1] - st.pos[1]) / (st.r * NODE_SCALE[1]),
  (p[2] - st.pos[2]) / (st.r * NODE_SCALE[2]));
