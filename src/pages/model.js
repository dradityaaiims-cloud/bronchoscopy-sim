// Static "Model & limits" page (same role as the ventilator simulator's).
export const MODEL_HTML = `
<div class="prose">
<h2>How the model works</h2>
<p>The anatomy, scope and case logic are plain JavaScript modules (<code>src/anatomy</code>, <code>src/sim</code>, <code>src/robotic</code>, <code>src/guidance</code>) with no rendering dependency and unit tests. The screens only draw their output. Coordinates are millimetres in one patient frame: <code>x</code> = patient left, <code>y</code> = superior, <code>z</code> = anterior, origin at the carina.</p>

<h3>Airway tree</h3>
<p>A procedural tracheobronchial tree is generated from a data table of standard segmental nomenclature (Boyden / Jackson-Huber): trachea, main bronchi, bronchus intermedius, lobar bronchi, RB1 to RB10, LB1+2, LB3 to LB6, LB7+8, LB9, LB10 (including the lingula), plus two generations of unlabelled subsegmental and distal stubs. Each branch has a centerline, per-point radius, a parallel-transport frame (so roll is stable), and a lobe tag. Directions, lengths and diameters are schematic adult values chosen so that orientation (superior / anterior / medial and so on) is right; unit tests check this. The tree is stored as JSON, and any file in the same schema can replace it.</p>

<h3>Scope and catheter</h3>
<p>The scope has a position along a branch, a shaft roll and a tip flexion. The camera looks along the centerline, tilted by the flexion in the plane set by the roll, so rolling with a flexed tip sweeps the aim around a cone. A child branch can be entered only when the aim is within 15 degrees of that branch's overall heading; the camera orientation is preserved across the junction. The robotic catheter uses the same kinematics; its reported shape is the path through the airways to the tip plus a short articulated tail.</p>

<h3>Rendering</h3>
<p>The camera view is raymarched in a shader: the lumen is the smooth union of tapered capsules along the nearest centerline segments, with a 120-degree equidistant fisheye, cartilage rings (absent on the posterior membranous wall), light falloff and specular highlights. Resolution adapts to the frame rate. The 3D map uses smoothed convex hulls around each lobe's airways for the lung shells, and extruded tubes for the airways.</p>

<h3>Lymph nodes, convex EBUS and CT guidance</h3>
<p>IASLC stations (2R, 2L, 4R, 4L, 5, 6, 7, 8, 9, 10R, 10L, 11Rs, 11Ri, 11L, 12R, 12L) are ellipsoids at schematic positions. The EBUS image is computed per pixel from a sector in the plane of the shaft and the 12 o'clock side of the camera: airway lumen and wall, vessels, esophagus, heart, nodes (hypoechoic with a capsule) and speckled tissue. The CT guidance shows slices of a registered real CT with the same stations outlined. The positions are illustrative, not measurements.</p>

<h3>Robotic case</h3>
<table><tr><th>Part</th><th>How it is modelled</th></tr>
<tr><td>Nodule</td><td>A sphere near the end of one peripheral airway. With a bronchus sign it sits in the airway's path; without one it lies beside the airway by a set gap.</td></tr>
<tr><td>CT-to-body divergence</td><td>The displayed (planned) target is the true lesion plus an offset. In the harder cases the offset points at a neighbouring airway, so following the plan lands beside the lesion.</td></tr>
<tr><td>Planning</td><td>Four candidate routes: the terminal airway nearest the displayed target in each of the closest segments. Route choice is scored by the extra end-to-target distance of the chosen route.</td></tr>
<tr><td>Radial EBUS</td><td>The probe images the plane through the tip perpendicular to the shaft; the lesion is a disc where the sphere cuts that plane. Concentric if the probe lies within 0.45 of the disc radius, eccentric if the disc is within 15 mm, otherwise none.</td></tr>
<tr><td>Cone-beam CT</td><td>Slices of the registered CT with the synthetic nodule painted in and the catheter drawn. "Tool in lesion" is computed from the true tip-to-lesion distance.</td></tr>
<tr><td>Sampling</td><td>A tool works along a segment from the tip (needle 18 mm, brush 8 mm, forceps 6 mm). It is in the lesion if the segment passes within a margin of the lesion centre; a reproducible random draw then applies a yield that depends on the tool and lesion size.</td></tr>
<tr><td>Score</td><td>100 points: route 15, time 15, airway-wall contacts 15, confirmation 20, sampling 35. Teaching feedback is generated from what you did and the case's features.</td></tr></table>

<h3>CT data and registration</h3>
<p>The CT overlay uses case 18 of the AeroPath dataset (CC BY 4.0). The airway mask was converted to a decimated mesh and a skeleton tree, and registered to the procedural skeleton with a scale and sagittal shear fitted to landmarks (carina, right upper lobe origin, bronchus intermedius end, left main bronchus end, trachea). Segment labels were then transferred from the procedural skeleton: topology gives the lobe, and nearest-centerline matching within the lobe gives the segment.</p>

<h2>Limitations (read these)</h2>
<ul>
<li><b>Not validated for clinical use.</b> Nothing here has been clinically reviewed. It teaches concepts and workflow; it does not teach technique, device handling or safety, and it must not be used to plan or perform a procedure.</li>
<li><b>Schematic anatomy.</b> The procedural tree is symmetric and idealised, with no anatomic variants (tracheal bronchus, trifurcation of the RUL and similar). The lobes are smoothed hulls, not fissure-accurate lung surfaces. The mediastinal landmarks and lymph node stations are illustrative.</li>
<li><b>One real airway.</b> The CT is a single, anonymised public scan with its own disease, registered to the procedural skeleton by a few nearly coplanar landmarks, so the overlay is approximate. A station outline may not coincide with a real node or vessel. <b>The CT airway labels are transferred, not expert annotations.</b> The CT airway is shown on the 3D map only; the camera view and the catheter use the procedural tree.</li>
<li><b>Synthetic nodules, divergence and outcomes.</b> Lesion position, size, bronchus sign, divergence (up to 14 mm here, exaggerated for teaching) and sampling yields are assumptions, not measurements. Tool reach, margins and yields are teaching approximations, not device specifications. Reported real-world yields vary widely.</li>
<li><b>Simplified catheter.</b> The catheter follows the centerline; there is no wall mechanics, friction, buckling, lag or loss of shape. A "contact" means pushing into a carina without aiming. Shape sensing is represented by the geometric path. The catheter size is not enforced against the lumen.</li>
<li><b>Simplified ultrasound.</b> The EBUS and r-EBUS images are drawn from geometry with speckle noise, with no real acoustic physics (no shadowing, attenuation modelling, Doppler or real tissue texture).</li>
<li><b>No dynamics.</b> No breathing, cough, secretions, bleeding, atelectasis or patient motion. Real CT-to-body divergence is dynamic and varies through the procedure.</li>
<li><b>Techniques not modelled.</b> Electromagnetic navigation, tomosynthesis, cryobiopsy, therapeutic bronchoscopy and rigid bronchoscopy are not simulated.</li>
<li>Educational tool, not for assessment or exams. No data leaves your browser. Progress is stored in <code>localStorage</code> only.</li>
</ul>

<h2>Sources</h2>
<ul>
<li>Støverud K-H, Bouget D, Pedersen A, et al. AeroPath: an airway segmentation benchmark dataset with challenging pathology and baseline method. PLoS ONE 2024;19(10):e0311416. Data: doi:10.5281/zenodo.10069289 (CC BY 4.0).</li>
<li>IASLC lymph node map (Rusch et al., J Thorac Oncol 2009;4:568-577) for station definitions.</li>
<li>Segmental bronchial nomenclature after Boyden and Jackson-Huber, as in standard bronchoscopy atlases.</li>
</ul>
</div>`;
