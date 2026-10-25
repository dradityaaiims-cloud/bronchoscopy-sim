"""Build the Phase 2 CT assets from one AeroPath case (CC BY 4.0, SINTEF / St. Olavs Hospital).

  python -I build_ct_assets.py <case> <AeroPath dir> <out dir> [--no-volume]

Outputs (all registered into the procedural skeleton's frame, mm; x=left, y=up, z=anterior):
  airway_ct.glb              decimated, smoothed airway lumen surface
  airway_ct_centerline.json  labelled centerline tree (same schema as the procedural tree)
  ct_volume.bin / .json      downsampled CT (uint8 window) resampled onto a regular grid

Educational only. The source scans are anonymised public research data; no identifiers are kept.
Requires: numpy scipy nibabel scikit-image skan trimesh pyfqmr
"""
import json
import os
import sys
import numpy as np
from scipy import ndimage as ndi
import nibabel as nib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # python -I does not add the script dir
import ct_tree as T


def mesh_from_mask(mask, aff, M, iso=0.9, target_faces=90000):
    import pyfqmr
    import trimesh
    from skimage.measure import marching_cubes
    idx = np.argwhere(mask)
    lo, hi = np.maximum(idx.min(0) - 3, 0), idx.max(0) + 4
    sub = mask[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]].astype(np.float32)
    vox = T._vox_sizes(aff)
    sub = ndi.gaussian_filter(sub, sigma=0.7 / vox)                       # ~0.7 mm blur before iso-surfacing
    zoom = vox / iso
    big = ndi.zoom(sub, zoom, order=1)
    verts, faces, _, _ = marching_cubes(big, level=0.45)
    # index in the zoomed grid -> index in the original grid -> ours (mm) -> procedural frame
    scale = (np.array(sub.shape) - 1) / (np.array(big.shape) - 1)
    orig = verts * scale + lo
    ours = (aff[:3, :3] @ orig.T).T + aff[:3, 3]
    reg = T.apply(M, ours)
    mesh = trimesh.Trimesh(reg, faces, process=True)
    trimesh.smoothing.filter_taubin(mesh, iterations=12)
    s = pyfqmr.Simplify()
    s.setMesh(mesh.vertices, mesh.faces)
    s.simplify_mesh(target_count=target_faces, aggressiveness=6, preserve_border=True)
    v, f, _ = s.getMesh()
    out = trimesh.Trimesh(v, f, process=True)
    trimesh.smoothing.filter_taubin(out, iterations=4)
    return out


def centerline_json(root, M, proc, lm, labels, case, res):
    """CT branches -> airway-tree JSON (same schema as the procedural tree)."""
    nodes, counter = {}, [0]
    scale = float(np.sqrt(abs(M[0, 0] * M[2, 2])))
    pn = proc['nodes']
    seen_label = {}

    def add(b, parent_id, depth_in_label):
        cid = f'C{counter[0]}'; counter[0] += 1
        lab, conf, dist, zone = labels[id(b)]
        p = pn[lab]
        key = (parent_id and nodes[parent_id]['label'], lab)
        first = nodes.get(parent_id, {}).get('label') != lab
        depth = 0 if first else depth_in_label + 1
        level = p['level'] if depth == 0 else ('subsegment' if depth == 1 else 'distal')
        if p['level'] not in ('segment',) and depth > 0:
            level = p['level']   # lobar/main chains keep their level
        pts = T.apply(M, b.pts)
        nodes[cid] = {
            'id': cid, 'label': lab if depth == 0 else f"{lab} ·{cid}", 'name': p['name'] if depth == 0 else f"{p['name']} (CT branch {cid})",
            'level': level, 'lobe': p['lobe'], 'zone': p['zone'], 'segment': p['segment'] if p['level'] in ('segment',) else lab,
            'parent': parent_id, 'children': [],
            'centerline': [[round(float(x), 2) for x in q] for q in pts],
            'radii': [round(float(max(0.4, r)) * scale, 2) for r in b.r],
            'length': round(float(np.linalg.norm(np.diff(pts, axis=0), axis=1).sum()), 2),
            'desc': p['desc'] if depth == 0 else f"CT airway belonging to {lab} ({p['name']}). Label transferred from the procedural skeleton.",
            'labelConfidence': round(conf, 2),
        }
        if parent_id:
            nodes[parent_id]['children'].append(cid)
        for c in b.children:
            add(c, cid, depth)
        return cid

    rid = add(root, None, 0)
    return {
        'schema': 'bronchoscopy-airway-tree/1', 'units': 'mm',
        'coordinateSystem': 'x = patient left, y = superior, z = anterior; origin at carina (registered to the procedural skeleton)',
        'source': {
            'type': 'ct', 'dataset': 'AeroPath', 'case': int(case),
            'doi': '10.5281/zenodo.10069289', 'license': 'CC BY 4.0',
            'citation': 'Stoverud K-H, Bouget D, Pedersen A, et al. AeroPath: an airway segmentation benchmark dataset with challenging pathology and baseline method. PLoS ONE 2024;19(10):e0311416.',
            'note': 'Labels transferred from the procedural skeleton by landmark registration; not expert segment labels.',
        },
        'registration': {'matrixCtToProcedural': [[round(float(x), 5) for x in r] for r in M], 'landmarkResidualMm': [round(float(x), 1) for x in res]},
        'rootId': rid, 'lobes': proc['lobes'], 'nodes': nodes,
    }


def build_volume(ct_path, M, out_dir, step=2.0):
    """Resample the CT onto a regular grid in procedural coordinates; window HU [-1000, 400] -> uint8."""
    img = nib.as_closest_canonical(nib.load(ct_path))
    hu = np.asarray(img.dataobj, dtype=np.float32)
    aff = np.eye(4)
    aff[:3, :3] = T.RAS_TO_OURS @ img.affine[:3, :3]
    aff[:3, 3] = T.RAS_TO_OURS @ img.affine[:3, 3]
    inv_aff, inv_M = np.linalg.inv(aff), np.linalg.inv(M)
    lo = np.array([-170.0, -190.0, -105.0])
    dims = np.array([171, 158, 106])
    xs = [lo[k] + step * np.arange(dims[k]) for k in range(3)]
    gx, gy, gz = np.meshgrid(*xs, indexing='ij')
    pts = np.stack([gx.ravel(), gy.ravel(), gz.ravel()], 1)
    ours = T.apply(inv_M, pts)
    vox = (inv_aff[:3, :3] @ ours.T).T + inv_aff[:3, 3]
    vol = ndi.map_coordinates(hu, vox.T, order=1, mode='constant', cval=-1024).reshape(dims)
    u8 = np.clip((vol + 1000.0) / 1400.0 * 255.0, 0, 255).astype(np.uint8)
    u8.tofile(f'{out_dir}/ct_volume.bin')   # x-fastest? no: C order, index = (ix*ny + iy)*nz + iz
    meta = {'dims': [int(d) for d in dims], 'origin': [float(x) for x in lo], 'step': step, 'order': 'xyz-C',
            'window': {'hu_min': -1000, 'hu_max': 400}, 'dtype': 'uint8',
            'source': 'AeroPath CT, resampled; CC BY 4.0'}
    json.dump(meta, open(f'{out_dir}/ct_volume.json', 'w'))
    return meta


def main():
    case, data, out = sys.argv[1:4]
    no_volume = '--no-volume' in sys.argv
    proc = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '../../public/data/airway-tree.json')))
    mask, aff = T.load_mask(f'{data}/{case}/{case}_CT_HR_label_airways.nii.gz')
    root = T.build_tree(mask, aff)
    T.resample(root)
    lm = T.find_landmarks(root)
    M, res = T.register(lm, proc)
    print('registration residual (mm):', res.round(1), 'scale/shear:', M[:3, :3].round(2).tolist())
    labels = T.label_branches(root, M, proc, lm)
    tree = centerline_json(root, M, proc, lm, labels, case, res)
    json.dump(tree, open(f'{out}/airway_ct_centerline.json', 'w'), separators=(',', ':'))
    print('centerline nodes:', len(tree['nodes']))
    mesh = mesh_from_mask(mask, aff, M)
    mesh.export(f'{out}/airway_ct.glb')
    print('mesh faces:', len(mesh.faces), 'bounds:', mesh.bounds.round(0).tolist())
    if not no_volume:
        print('volume:', build_volume(f'{data}/{case}/{case}_CT_HR.nii.gz', M, out))


if __name__ == '__main__':
    main()
