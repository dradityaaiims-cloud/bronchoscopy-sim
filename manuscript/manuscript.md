# Dr. Singh's Bronchoscopy Simulator: an open-source, browser-based simulator for segmental airway anatomy, lymph node stations and robotic-assisted bronchoscopy workflow

**Article type:** Technical report / software description (draft v0.1)
**Author:** Aditya Singh, MD
**Software:** https://doi.org/10.5281/zenodo.23644439 (MIT licence) · Source: https://github.com/dradityaaiims-cloud/bronchoscopy-sim [CONFIRM URL] · Live: https://dradityaaiims-cloud.github.io/bronchoscopy-sim/ [CONFIRM URL]
**Correspondence:** draditya.aiims@gmail.com

> Drafting notes (delete before submission): items in [BRACKETS] need your input or verification. Statements about the literature are left as [CITE] and must be filled with sources you have read. Nothing here reports learner outcomes, because none have been collected.

---

## Abstract

**Background.** Learning bronchoscopic anatomy and the workflow of robotic-assisted peripheral bronchoscopy usually depends on scarce clinical exposure or on proprietary simulators. Free, accessible tools for the cognitive parts of this training are limited. [CITE]

**Objective.** To describe the design, implementation and limits of an open-source, browser-based educational simulator covering segmental airway anatomy, mediastinal lymph node stations, endobronchial ultrasound (EBUS) and CT guidance, and a game-style robotic bronchoscopy case workflow.

**Methods.** The simulator is written in JavaScript with three.js and runs entirely in the browser with no server and no data collection. A procedural tracheobronchial tree is generated from standard segmental nomenclature and rendered as a raymarched first-person endoscopic view beside a 3D map. Sixteen IASLC lymph node stations are modelled, and a convex-EBUS image and live CT slices are computed from geometry. A real airway CT from the public AeroPath dataset (CC BY 4.0) is registered to the procedural skeleton by landmarks. A robotic mode provides eight synthetic cases with planning, shape-sensing-style navigation, CT-to-body divergence, radial EBUS, simulated cone-beam CT, sampling tools and scored teaching feedback.

**Results.** The software is deployed as a static website, archived with a DOI, and covered by 33 automated tests of the anatomy, scope kinematics, guidance and case-scoring logic. [Add any measured performance, e.g. frame rates on named devices, only if you measure them.]

**Conclusions.** The simulator offers a free, no-install platform for teaching bronchoscopic anatomy and robotic workflow concepts. **It has not been validated for clinical use or for assessing competence**, and it does not teach technique, device handling or safety. Educational effectiveness has not been evaluated.

**Keywords:** bronchoscopy; robotic bronchoscopy; medical education; simulation; open-source software; endobronchial ultrasound

---

## 1. Introduction

Bronchoscopy requires a three-dimensional mental model of the segmental airways and their relations to mediastinal nodes and vessels. Robotic-assisted peripheral bronchoscopy adds planning on CT, shape-sensing navigation, management of CT-to-body divergence, ultrasound confirmation and tool-in-lesion decisions. [CITE for diagnostic role and use of robotic platforms.] Trainees often meet these concepts first at the bedside. High-fidelity simulators exist, but they are costly and tied to a site or vendor. [CITE for simulation-based bronchoscopy training.]

This report describes a free simulator that targets the *cognitive* layer of training: orientation, nomenclature, station anatomy, planning and workflow. It is not intended to teach manual skill. The aims were to (1) run in any modern browser with no installation, (2) be fully open and inspectable, (3) keep the anatomy swappable through a documented data schema, and (4) state its limits plainly.

## 2. Methods: design and implementation

### 2.1 Architecture and coordinate frame

The code is plain JavaScript modules built with Vite and rendered with three.js. Anatomy, scope kinematics, guidance and case logic have no rendering dependency and are unit tested; the screens only draw their output. All coordinates are millimetres in one patient frame (x patient-left, y superior, z anterior, origin at the carina). The application is a static site; there is no backend and no analytics.

### 2.2 Airway tree

A procedural tracheobronchial tree is generated from a data table of standard segmental nomenclature (Boyden and Jackson–Huber): trachea, main bronchi, bronchus intermedius, lobar bronchi, right segments RB1–RB10, and left LB1+2, LB3–LB6, LB7+8, LB9 and LB10 including the lingula, plus two generations of unlabelled subsegmental and distal stubs. Each branch has a centerline, per-point radius, a parallel-transport frame and a lobe tag. Lengths, directions and diameters are schematic adult values chosen to preserve orientation. The tree is serialised in a documented JSON schema (`bronchoscopy-airway-tree/1`) with a validator, so other anatomy can replace it.

### 2.3 Scope and catheter kinematics

The scope state is a branch, an arclength position, a shaft roll and a tip flexion. The camera looks along the centerline, tilted by the flexion in the plane set by the roll. A child branch can be entered only when the aim lies within 15° of that branch's overall heading, and orientation is preserved across the junction. The robotic catheter uses the same kinematics; its displayed shape is the path through the airways plus a short articulated tail.

### 2.4 Rendering

The endoscopic view is raymarched in a fragment shader: the lumen is the smooth union of tapered capsules along the nearest centerline segments, seen through a 120° equidistant fisheye with cartilage rings (absent on the posterior membranous wall), light falloff and specular highlights. Render resolution adapts to frame rate. The 3D map uses smoothed convex hulls for lobes, extruded airway tubes, mediastinal landmarks, clipping-plane cross-sections and a toggleable tip marker. A dynamic orientation compass shows anterior–posterior and left–right relative to the camera.

### 2.5 Lymph node stations, EBUS and CT guidance

Sixteen IASLC stations (2R, 2L, 4R, 4L, 5, 6, 7, 8, 9, 10R, 10L, 11Rs, 11Ri, 11L, 12R, 12L) are modelled as ellipsoids at schematic positions, following the IASLC lymph node map (Rusch et al., 2009). A convex-EBUS image is computed per pixel from a sector in the plane of the shaft: airway lumen and wall, vessels, oesophagus, heart, nodes and speckled tissue. A CT panel shows slices of the registered CT with station outlines. Positions are illustrative, not measurements.

### 2.6 CT data and registration

The CT overlay uses **case 18 of the AeroPath dataset** (Støverud et al., 2024), released under **CC BY 4.0**. The airway mask was converted to a decimated surface mesh and a skeleton-based tree. It was registered to the procedural skeleton using a per-axis scale and sagittal shear fitted to landmarks (carina, right-upper-lobe origin, end of bronchus intermedius, end of left main bronchus, trachea); a full affine fit was singular because the landmarks are nearly coplanar. The CT volume was resampled into the procedural frame at 2 mm for slice display.

**CT labels are transferred, not expert-annotated.** Segment labels on the CT airway were assigned automatically from the procedural skeleton: lobe topology gives the lobe, and nearest-centerline matching within the lobe gives the segment. They have not been reviewed by a radiologist or bronchoscopist and may be wrong, particularly in distal airways and in this scan's pathological anatomy. The CT airway is shown on the 3D map only; the endoscopic view and the catheter use the procedural tree.

### 2.7 Robotic case workflow

Eight synthetic cases are provided. Each places a spherical nodule near a terminal airway, either on the airway's path (bronchus sign) or beside it by a set gap. The displayed (planned) target equals the true lesion plus a divergence offset, exaggerated in harder cases up to 14 mm so that following the plan can land beside the lesion. The learner chooses among four candidate routes, navigates with a drive indicator and planned-versus-actual path display, removes the vision probe for the final approach, confirms with radial EBUS (concentric or eccentric pattern with a clock-face bearing, or no lesion), checks with a simulated cone-beam CT, and samples with needle, forceps or brush at reach-limited distances. Sampling yield is a reproducible random draw whose probability depends on the tool and lesion size; these values are teaching assumptions, not device or clinical performance data.

### 2.8 Scoring and feedback

A case scores 100 points: route choice 15, time 15, airway-wall contacts 15, confirmation 20, sampling 35. Teaching feedback is generated from what the learner did and from the case features. High scores are stored in the browser's `localStorage` only.

### 2.9 Learning support

A guided tour opens on first visit; a Learn tab covers lobes and segments, nodes, flexible and robotic bronchoscopy, and techniques; and a rule-based assistant (Boba, no AI model and no network use) offers context tips.

### 2.10 Verification and deployment

Thirty-three automated tests check anatomy orientation and nomenclature, scope kinematics and junction entry, guidance geometry, and case and scoring logic. Continuous integration runs the tests and builds the site before each deployment to GitHub Pages. Releases are archived on Zenodo (doi:10.5281/zenodo.23644439).

## 3. Results

The system is publicly available as described above. Figure suggestions: (1) split-screen endoscopic view and 3D map; (2) EBUS and CT guidance panels with station outlines; (3) robotic navigation display with planned and actual path; (4) radial EBUS and cone-beam CT views; (5) architecture diagram. [Capture from the live site.] [Optional: report measured frame rates on named devices and browsers.]

No learner data or usability data were collected for this report.

## 4. Discussion

The simulator is a free and inspectable teaching aid for orientation, nomenclature, station anatomy and robotic workflow reasoning. Its design choices favour clarity: a schematic, labelled tree rather than a patient-specific anatomy, and explicit, adjustable case parameters. Because the anatomy conforms to a schema and the code is MIT licensed, others can substitute data or extend the cases. [Compare with existing bronchoscopy simulators and e-learning tools. CITE.]

### 4.1 Limitations

- **Not validated for clinical use.** Nothing here has been clinically reviewed or validated. It must not be used to plan or perform a procedure, to make clinical decisions, or to assess competence or certification.
- **Educational effect untested.** No evaluation of learning outcomes, usability or transfer to clinical performance has been done.
- **Schematic anatomy.** The tree is symmetric and idealised, with no anatomic variants. Lobes are smoothed hulls and node positions are illustrative.
- **One real airway, approximate registration, transferred labels.** The CT is a single anonymised public scan with its own pathology, registered by a few nearly coplanar landmarks. Its segment labels are transferred, not expert annotations.
- **Synthetic nodules, divergence and yields.** Lesion placement, divergence magnitudes and sampling yields are assumptions and are exaggerated for teaching.
- **Simplified catheter and ultrasound.** There is no wall mechanics, friction, buckling or loss of shape sensing, and no acoustic physics.
- **No dynamics.** No breathing, cough, secretions, bleeding or patient motion.
- **Techniques not modelled.** Electromagnetic navigation, tomosynthesis, cryobiopsy, therapeutic and rigid bronchoscopy.
- **No manual-skill training**, haptics or device handling.
- **Testing.** Browser coverage beyond Chromium-based browsers has not been tested. [Update if tested.]

### 4.2 Future work

Expert review and correction of CT segment labels; additional CT cases; patient-variant anatomy; and a prospective educational evaluation (for example pre/post knowledge testing and a usability scale) with appropriate ethical review.

## 5. Conclusions

An open, browser-based bronchoscopy simulator can be built and distributed at no cost and with no data collection. It is intended for education only; its effectiveness remains to be evaluated and it has not been validated for clinical use.

---

## Declarations

**Availability.** Software DOI: 10.5281/zenodo.23644439. Source code under the MIT licence. CT-derived files in `public/ct` retain the CC BY 4.0 licence of the source dataset. [State the licence of teaching content once decided.]

**Data source and attribution.** The CT overlay and cone-beam CT images are derived from case 18 of the AeroPath dataset: Støverud K-H, Bouget D, Pedersen A, et al. AeroPath: an airway segmentation benchmark dataset with challenging pathology and baseline method. *PLoS ONE* 2024;19(10):e0311416. Data: doi:10.5281/zenodo.10069289, licensed CC BY 4.0. Changes made: resampling, mesh and skeleton extraction, registration to a procedural skeleton, and automatic label transfer.

**Clinical-use statement.** This software is an educational tool. It is not a medical device, has not been validated for clinical use, and must not be used for clinical decisions, procedure planning or assessment. No patient data are collected or should be entered.

**Use of AI assistance (ICMJE-style disclosure).** The software was developed with AI coding assistance (Claude, Anthropic), directed, reviewed and tested by the author, who takes responsibility for the code and content. [If AI tools were also used to draft or edit this manuscript, state which tool, version, and for what, in the manner the target journal requires. AI cannot be listed as an author.]

**Ethics.** No human participants or patient data. The public CT is anonymised research data. [Confirm with your institution/journal if a statement is needed.]

**Funding.** None. **Competing interests.** None declared. Not affiliated with or endorsed by any bronchoscope, robotic-platform or navigation manufacturer; no manufacturer's software, interface or algorithm is reproduced. [Confirm.]

**Acknowledgements.** [Add.]

## References

1. Støverud K-H, Bouget D, Pedersen A, et al. AeroPath: an airway segmentation benchmark dataset with challenging pathology and baseline method. PLoS ONE 2024;19(10):e0311416. doi:10.5281/zenodo.10069289 (data).
2. Rusch VW, Asamura H, Watanabe H, et al. The IASLC lung cancer staging project: a proposal for a new international lymph node map in the forthcoming seventh edition of the TNM classification for lung cancer. J Thorac Oncol 2009;4:568–577.
3. Boyden EA. Segmental anatomy of the lungs. New York: McGraw-Hill; 1955. [VERIFY]; Jackson CL, Huber JF. Correlated applied anatomy of the bronchial tree and lungs with a system of nomenclature. Dis Chest 1943;9:319–326. [VERIFY]
4. Singh A. Dr. Singh's Bronchoscopy Simulator (Version 0.2.0) [Computer software]. doi:10.5281/zenodo.23644439.
5. [Add literature for the Introduction and Discussion.]
