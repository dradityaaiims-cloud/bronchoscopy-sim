# CT-derived assets: attribution

The airway mesh (`airway_ct.glb`), labelled centerline (`airway_ct_centerline.json`) and resampled CT slices
(`ct_volume.bin`, `ct_volume.json`) in this folder are derived from **case 18** of the public **AeroPath** dataset.

- Dataset: AeroPath: An airway segmentation benchmark dataset with challenging pathology (SINTEF Digital / St. Olavs Hospital, Trondheim)
- DOI: https://doi.org/10.5281/zenodo.10069289
- License: **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/). Changes: airway mask converted to a decimated mesh and
  centerline tree, CT resampled to 2 mm and windowed to 8 bit, all registered by landmarks to this app's procedural skeleton.
- Paper: Støverud K-H, Bouget D, Pedersen A, et al. AeroPath: an airway segmentation benchmark dataset with challenging pathology and baseline method. PLoS ONE 2024;19(10):e0311416.

The source scans are anonymised research data released by the authors; this folder keeps only resampled voxel data and
derived geometry (no headers, dates or identifiers). Segment labels were **transferred from the procedural skeleton** by
registration and are not expert annotations. Educational use only; not for clinical use.

Rebuild: `tools/ct/build_ct_assets.py` (see the header of that file).
