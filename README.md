# Bronchoscopy Simulator

An educational, keyboard-driven bronchoscopy simulator for internal medicine and pulmonary trainees.
Static web app (three.js + Vite) that runs in a laptop browser and deploys to GitHub Pages.

> **Educational use only.** Not a medical device, not validated for clinical use or procedure planning.
> Contains **no patient data** and no identifiers. The procedural anatomy is schematic. The optional CT overlay and CBCT images are
> derived from an anonymised, public, CC BY 4.0 research dataset (AeroPath case 18); see [CT data and licensing](#ct-data-and-licensing).

**Status: Phase 1 (anatomy trainer, learning module, guided tour) and Phase 2 (robotic case game, CT overlay) implemented.**

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (anatomy, scope, robotic-case logic, no browser needed)
npm run build      # static site in dist/ (relative base, works from any Pages sub-path)
```

## Phase 1 features

- **Procedural tracheobronchial tree** from standard segmental nomenclature: trachea, carina, main bronchi, bronchus intermedius, lobar bronchi, RB1–RB10, LB1+2, LB3–LB6, LB7+8, LB9, LB10 (including the lingula: LB4/LB5), plus two generations of unlabelled subsegmental stubs for peripheral paths.
  Directions, lengths and diameters are schematic adult values; orientation (superior/inferior, anterior/posterior, medial/lateral) is covered by unit tests.
- **Split screen.** Left: first-person bronchoscope (120° barrel-distorted view, circular mask, cartilage rings with a flat posterior membranous wall, rounded carinal ridges, headlight falloff, mucus specular highlights). Right: transparent colour-coded lobes, airway tree, live scope marker and direction cone, trail of the path taken, orbit/zoom camera.
- **Live readout** of the current airway (e.g. `RB3 · Anterior segment · RUL`, lumen diameter, distance from carina). `L` hides every label, in both panes.
- At roll 0, anterior is at 12 o'clock and the right lung is on the right of the screen (operator at the head of a supine patient).
- **Realistic 3D map:** smoothed glassy lobes with a fresnel rim, tapered airways, and schematic mediastinal landmarks (heart, aorta, pulmonary arteries, SVC, azygos, esophagus; `V` toggles).
- **IASLC lymph node stations** (2R, 2L, 4R, 4L, 5, 6, 7, 8, 9, 10R/L, 11Rs/Ri/L, 12R/L): click a green oval for location and usual sampling route; the readout lists stations adjacent to the scope. Positions are schematic. `N` toggles.
- **3D orientation compass** in the scope view: A/P, R/L, S/I axes rendered from the scope's own orientation, so it turns with every roll and flexion.
- **Robotic-console style overlay** (generic, not a replica of any product): roll-arc bezel, articulation gauge (bend + direction), depth bar, route breadcrumb, status chip. `G` toggles.
- **Learn tab:** lobes and segments, airways, lymph node stations, how flexible and robotic bronchoscopes work, techniques (and which this simulator models), glossary; "Show in scope" buttons jump to an airway.
- **Guided tour** (Tour button): spotlights each part of the screen, with "try it" steps you complete in the real simulator.
- **Boba** the assistant dog (reused from the ventilator simulator, `public/assets/boba.webp`): rule-based, context-aware tips (no AI model, no network); click for a tip, Hush to mute.
- **Modes:** free explore · "Where am I?" quiz (labels and marker hidden, 4-way multiple choice, scored, streak persisted locally; you can slide along the airway you were dropped into) · navigate-to-target-segment (timer, wrong-turn count, route hint, score).

### Controls

| Key | Action |
| --- | --- |
| `W` / `S` | advance / withdraw (`Shift` = fine) |
| `A` / `D` | rotate the shaft counter-clockwise / clockwise |
| `↑` / `↓` | tip flexion / extension (tip bends toward the top of the image) |
| `Space` | straighten the tip |
| `R` | reset to the carina |
| `L` | hide / show labels |
| `N` / `V` / `G` | lymph node stations / mediastinal vessels / robotic overlay |
| `M` | cycle mode (`1`–`4` answer, `Enter` next in the quiz; `T` route hint in navigate) |
| `P` `E` `C` `1`–`3` `Enter` | robotic case: probe in/out · radial EBUS · cone-beam CT · needle/forceps/brush · take sample |
| `H` | help |

Entering a bronchus requires aiming at it, as on a real scope: at a carina, flex the tip and roll the shaft until a lumen is centred, then advance. Rolling with a flexed tip sweeps the aim around a cone. Straight ahead at the carina is blocked.

## Architecture

```
src/
  anatomy/        swappable anatomy layer (pure JS, runs in Node)
    segments.js     nomenclature + schematic geometry as data
    proceduralTree.js  data -> airway-tree JSON
    airwayTree.js   validate, arclength + parallel-transport frames, sampleNode()
    index.js        loadAirwayTree({source:'procedural'|'json', url})
  sim/scope.js    scope state: branch, distance, roll, flexion, junction rules (pure JS)
  render/
    scopeShader.js  raymarched lumen (smooth union of tapered capsules) + mucosa shading
    scopeView.js    picks the K nearest segments per frame, adaptive resolution
    overview.js     3D lungs, tree, marker, trail, labels
  modes/          explore, quiz, navigate, robotic (Phase 2 case controller)
  robotic/        geometry, cases, planning, catheter shape, r-EBUS, CBCT, sampling, scoring, views (pure logic is unit-tested)
  ct/             CT overlay layer (GLB + labelled centerlines, fade slider)
  learn/          Learn-tab content (data) + renderer
  ui/             HUD, tour, Boba (+ rules), DOM helper
  anatomy/lymphNodes.js   IASLC station data
scripts/export-tree.js   writes public/data/airway-tree.json
tools/ct/                Python pipeline: AeroPath mask -> mesh, labelled centerline, registered CT volume
public/ct/               derived CT assets + ATTRIBUTION.md (CC BY 4.0)
tests/                   node:test unit tests
```

Rendering is decoupled from anatomy: everything downstream consumes only the airway-tree JSON below. Load a JSON file with `?anatomy=data/airway-tree.json`
(generate one with `npm run export-tree`). The CT overlay uses the same schema (`public/ct/airway_ct_centerline.json`, `source.type = "ct"`) plus a GLB mesh.

### Airway tree JSON (`bronchoscopy-airway-tree/1`)

```jsonc
{
  "schema": "bronchoscopy-airway-tree/1",
  "units": "mm",
  "coordinateSystem": "x = patient left, y = superior, z = anterior; origin at carina",
  "source": { "type": "procedural", "seed": 7, "generations": 2 },
  "rootId": "TR",
  "lobes": { "RUL": { "name": "Right upper lobe", "color": "#4ea8de" }, "...": {} },
  "nodes": {
    "RB3": {
      "id": "RB3", "label": "RB3", "name": "Anterior segment",
      "level": "segment",          // trachea | main | lobar | division | segment | subsegment | distal
      "lobe": "RUL", "zone": "RUL", // zone adds LING (lingula) for colouring
      "segment": "RB3",            // segment-level ancestor id (answer key for the quiz)
      "parent": "RUL", "children": ["RB3a", "RB3b"],
      "centerline": [[x, y, z], "..."], // first point == parent's last point
      "radii": [2.75, "..."],           // lumen radius per centerline point
      "length": 34.1,
      "desc": "teaching text"
    }
  }
}
```

`validateTree()` enforces connectivity and shape; any provider that passes it works with the whole app.

## Pages and first visit

- The **tutorial opens automatically on a first visit** (Skip counts as seen; the Tour button replays it).
- **Model & limits** (how each part is modelled, and an honest limitations list) and **About** (author, links, feedback, citation, disclosures, privacy) are top-level tabs, like the ventilator simulator's. Edit the author text in `src/pages/about.js`, the contact and optional feedback-form URL in `src/pages/config.js`, and the headshot in `public/assets/aditya-singh.jpg`.

## Guidance and map tools (Free explore and Navigate)

- **Convex EBUS (`E`).** An ultrasound sector scanning toward 12 o'clock of the camera image (roll with `A`/`D` to sweep). Lymph nodes (hypoechoic ovals with a capsule, labelled with their IASLC station and size), vessels (anechoic), esophagus, heart and the airway wall come from the same schematic anatomy as the 3D map. A translucent fan on the map shows the scan plane.
- **CT guidance (`C`).** Live axial / coronal / sagittal slices of the registered CT at the scope tip, with the nodal stations outlined and labelled and the scope path drawn. "Follow tip" can be turned off to scroll.
- **Not in the quiz** (it would give the answer away). Robotic case mode keeps its own r-EBUS and CBCT on the same keys.
- **Red tip dot (`B`).** A bright red dot with a white outline marks the scope tip on the 3D map, drawn on top of everything.
- **Cross-section (`X`).** A clipping plane through the 3D map: axial (viewed from below, anterior up, patient left on the right, as in radiology), coronal (from the front) or sagittal (from the left). Slider, "at tip" follow, flip, and "CT slice" to open the same plane on the CT.
- **3D compass** is a 2D canvas at the screen's native pixel ratio, so its letters stay sharp when the scope view lowers its render resolution.
- Station positions on the CT and EBUS are schematic; the CT is a real scan of a different anatomy that was registered by a few landmarks, so a station outline may not coincide with a real node or vessel.

## Phase 2: robotic case, CT overlay, game

Open the **Robotic case** tab. Pick one of 8 cases (or the practice builder), then:

1. **Plan.** The planning screen shows the nodule (segment, size, bronchus sign) and four auto-generated routes with distance to the *displayed* target. The target comes from the pre-procedure CT and may be off (CT-to-body divergence). Choosing a route draws the planned path on the 3D map.
2. **Navigate.** An ultra-thin catheter is driven with the same keys as the scope (articulation in every direction = roll + flex), with a catheter-drive indicator (advance / retract / hold / locked). The navigation display shows planned (green dashed) versus actual (orange) path, a route ring in the camera view marking the planned lumen, live distance to target, on/off-route status, and the **shape-sensed catheter** (yellow) in 3D.
3. **Confirm.** `P` removes the vision probe: the camera goes off and the catheter locks in place, as a removable-probe catheter does. Then `E` gives **radial EBUS** (concentric / eccentric with a clock-face bearing / no lesion, computed from the true catheter-to-nodule geometry) and `C` gives **cone-beam CT** (axial / coronal / sagittal slices of a real resampled CT with the nodule and catheter, tool-in-lesion versus adjacent). Close the CBCT, reinsert the probe, adjust and repeat. "Update target from CBCT" registers the correction and re-plans the route.
4. **Sample.** Needle, forceps or brush (`1`–`3`, `Enter`); up to four passes. Outcome depends on tool reach and where the tool is, with a small reproducible chance of a non-diagnostic specimen.
5. **Score and teach.** 100 points: route choice 15, time 15, airway-wall contacts 15, confirmation steps 20, sampling 35. After every case you get a breakdown, *what went well*, *what to improve* and case-specific *teaching points* (bronchus sign, lesion size, divergence, r-EBUS pattern, tool choice). Best scores are stored in this browser (`localStorage`).

Divergence is designed in: in cases 5 and 6 the displayed target points at a *neighbouring* airway, so following the plan lands the catheter beside the lesion until you recognise it and correct it.

**CT overlay (3D map, right panel).** A slider fades from the procedural airway to a CT-derived airway mesh (GLB); a toggle shows the labelled centerline tree inside the real mesh. Both are registered to the procedural skeleton by landmarks (carina, RUL origin, bronchus intermedius end, left main bronchus end, trachea).

### CT data and licensing

- Dataset: **AeroPath** (Støverud, Bouget, Pedersen et al., SINTEF Digital / St. Olavs Hospital), [10.5281/zenodo.10069289](https://doi.org/10.5281/zenodo.10069289), licence **CC BY 4.0**. Paper: PLoS ONE 2024;19(10):e0311416.
- Used: case 18 airway label, lung-region CT. Derived files in `public/ct/`: decimated airway mesh, labelled centerline JSON, 2 mm resampled and windowed CT volume (about 2.8 MB). Attribution: `public/ct/ATTRIBUTION.md`.
- The source scans are anonymised public research data from patients who were undergoing diagnostic tests. This app keeps only resampled voxel data and derived geometry (no headers, dates or identifiers).
- **Segment labels on the CT airway are transferred from the procedural skeleton** by registration. They are not expert annotations. Nodules, divergence and sampling outcomes are synthetic.
- Rebuild or swap the case: `tools/ct/build_ct_assets.py <case> <AeroPath dir> public/ct` (Python 3 with numpy, scipy, nibabel, scikit-image, skan, trimesh, pyfqmr; download only the files you need from the Zenodo record, e.g. with HTTP range requests).

## Known limitations

- Procedural geometry is schematic and symmetric; lobes are smoothed hulls around the airways, not fissure-accurate lung surfaces.
- The scope view is an analytic raymarched lumen, not a mesh. The CT airway is shown on the 3D map only; the camera view is not rendered from the CT mesh.
- The catheter follows the procedural centerline; the CT airway is an overlay, not a second navigable tree. There is no wall-contact physics: a "contact" is pushing into a carina without aiming.
- Catheter, r-EBUS and tool behaviour (reach, margins, yields) are teaching approximations, not device specifications. Divergence of 10 to 14 mm in the harder cases is exaggerated for teaching.
- Registration uses scale plus a sagittal shear fitted to a few landmarks (the landmarks are nearly coplanar), so the CT airway is a rough, not exact, overlay.
- Tested in a Chromium-based browser on Apple silicon. The shader cost scales with resolution; resolution adapts automatically on slower GPUs.

## Deploy to GitHub Pages

`.github/workflows/pages.yml` builds and deploys on push to `main`. In the repo settings, set **Pages → Source → GitHub Actions**.

## License

MIT — see `LICENSE`. Educational use only; see the disclaimer above.
