"""CT airway mask -> centerline tree, landmarks, and registration to the procedural skeleton.

Frame used throughout (matches the app): x = patient LEFT, y = SUPERIOR, z = ANTERIOR, mm.
NIfTI volumes are reoriented to RAS first, then mapped RAS -> ours with (x, y, z) = (-R, S, A).

Educational pipeline for the public AeroPath dataset (CC BY 4.0). Not for clinical use.
"""
import json
import numpy as np
import nibabel as nib
from scipy import ndimage as ndi
from skimage.morphology import skeletonize
from skan import Skeleton

RAS_TO_OURS = np.array([[-1, 0, 0], [0, 0, 1], [0, 1, 0]], float)  # det = +1 (proper rotation)


def load_mask(path):
    """Return (largest-component mask, voxel->ours affine 4x4)."""
    img = nib.as_closest_canonical(nib.load(path))
    m = np.asarray(img.dataobj) > 0
    lab, n = ndi.label(m)
    sizes = ndi.sum(m, lab, range(1, n + 1))
    m = lab == (1 + int(np.argmax(sizes)))
    aff = np.eye(4)
    aff[:3, :3] = RAS_TO_OURS @ img.affine[:3, :3]
    aff[:3, 3] = RAS_TO_OURS @ img.affine[:3, 3]
    return m, aff


# ── skeleton -> branch tree ──────────────────────────────────────────────────

class Branch:
    def __init__(self, pts, radii):
        self.pts = np.asarray(pts, float)      # N x 3 (ours, mm), ordered root -> tip
        self.r = np.asarray(radii, float)
        self.parent = None
        self.children = []
        self.id = None

    @property
    def length(self):
        return float(np.linalg.norm(np.diff(self.pts, axis=0), axis=1).sum())

    def subtree_len(self):
        return self.length + sum(c.subtree_len() for c in self.children)

    def heading(self, mm=14.0):
        d = np.cumsum(np.r_[0, np.linalg.norm(np.diff(self.pts, axis=0), axis=1)])
        j = min(len(d) - 1, int(np.searchsorted(d, mm)))
        v = self.pts[max(j, 1)] - self.pts[0]
        return v / (np.linalg.norm(v) or 1)


def build_tree(mask, aff, min_spur_mm=6.0, min_radius_mm=0.0):
    """Skeletonise, extract branches, root at the most superior tip, prune spurs."""
    idx = np.argwhere(mask)
    lo, hi = idx.min(0) - 2, idx.max(0) + 3
    lo = np.maximum(lo, 0)
    sub = mask[lo[0]:hi[0], lo[1]:hi[1], lo[2]:hi[2]]
    off = lo
    edt = ndi.distance_transform_edt(sub, sampling=_vox_sizes(aff))
    skel = skeletonize(sub).astype(np.uint8)
    sk = Skeleton(skel)

    def to_ours(vox):  # voxel index (in sub) -> mm ours
        return (aff[:3, :3] @ (np.asarray(vox, float) + off).T).T + aff[:3, 3]

    npaths = sk.n_paths
    paths = []
    for i in range(npaths):
        c = sk.path_coordinates(i)
        r = edt[tuple(np.round(c).astype(int).T)]
        paths.append((c, r))
    # graph of junction nodes
    ends = sk.paths_list()
    node_of = {}
    adj = {}
    for i, p in enumerate(ends):
        a, b = p[0], p[-1]
        adj.setdefault(a, []).append((i, b))
        adj.setdefault(b, []).append((i, a))
    # root = path endpoint voxel with maximum superior coordinate (our y)
    coords_all = sk.coordinates
    cand = [n for n, e in adj.items() if len(e) == 1]
    ys = [to_ours(coords_all[n][None])[0][1] for n in cand]
    root_node = cand[int(np.argmax(ys))]

    seen_paths, root = set(), None

    def grow(node, parent):
        for pi, other in adj[node]:
            if pi in seen_paths:
                continue
            seen_paths.add(pi)
            c, r = paths[pi]
            if not np.allclose(c[0], coords_all[node]):
                c, r = c[::-1], r[::-1]
            b = Branch(to_ours(c), r * 1.0)
            b.parent = parent
            if parent is not None:
                parent.children.append(b)
            grow(other, b)
            if parent is None:
                nonlocal_root.append(b)

    nonlocal_root = []
    grow(root_node, None)
    root = nonlocal_root[0]

    # prune short terminal spurs, merge pass-through nodes
    def prune(b):
        for c in list(b.children):
            prune(c)
        b.children = [c for c in b.children if c.children or c.length >= min_spur_mm]
    prune(root)

    def merge(b):
        while len(b.children) == 1:
            c = b.children[0]
            b.pts = np.vstack([b.pts, c.pts[1:]])
            b.r = np.r_[b.r, c.r[1:]]
            b.children = c.children
            for g in b.children:
                g.parent = b
        for c in b.children:
            merge(c)
    merge(root)
    return root


def _vox_sizes(aff):
    return np.linalg.norm(aff[:3, :3], axis=0)


def resample(b, step=5.0):
    """Even spacing + light smoothing, keeping exact end points (so children still connect)."""
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(b.pts, axis=0), axis=1))]
    n = max(2, int(round(d[-1] / step)) + 1)
    t = np.linspace(0, d[-1], n)
    p = np.stack([np.interp(t, d, b.pts[:, k]) for k in range(3)], 1)
    r = np.interp(t, d, b.r)
    if n > 3:
        q = p.copy()
        q[1:-1] = 0.25 * p[:-2] + 0.5 * p[1:-1] + 0.25 * p[2:]
        p = q
    b.pts, b.r = p, r
    for c in b.children:
        c.pts[0] = b.pts[-1]
        resample(c, step)
        c.pts[0] = b.pts[-1]


def walk(b):
    yield b
    for c in b.children:
        yield from walk(c)


# ── landmarks ────────────────────────────────────────────────────────────────

def significant(b, mm=25.0):
    return b.subtree_len() >= mm


def follow_to_split(b, mm=25.0):
    """Follow single significant children until a branch with >=2 significant children."""
    chain = [b]
    while True:
        sig = [c for c in chain[-1].children if significant(c, mm)]
        if len(sig) >= 2:
            return chain, sig
        if len(sig) == 0:
            return chain, []
        chain.append(sig[0])


def chain_pts(chain):
    return np.vstack([c.pts if i == 0 else c.pts[1:] for i, c in enumerate(chain)])


def find_landmarks(root):
    """Carina, RUL origin, bronchus intermedius end, LMB end, trachea samples (all ours/mm)."""
    trachea, kids = follow_to_split(root)
    if len(kids) < 2:
        raise RuntimeError('no carina found')
    kids = sorted(kids, key=lambda k: -k.subtree_len())[:2]
    right, left = sorted(kids, key=lambda k: k.pts[-1][0])  # smaller x = patient right
    carina = trachea[-1].pts[-1]
    tr = chain_pts(trachea)

    rchain, rkids = follow_to_split(right, 20.0)
    if len(rkids) < 2:
        raise RuntimeError('right side did not split')
    rul = max(rkids, key=lambda k: k.heading()[1])      # most superior child = RUL
    bi = min(rkids, key=lambda k: k.heading()[1])       # most inferior = bronchus intermedius
    bchain, bkids = follow_to_split(bi, 20.0)
    lchain, lkids = follow_to_split(left, 20.0)
    return {
        'carina': carina,
        'rul_origin': rchain[-1].pts[-1],
        'bi_end': bchain[-1].pts[-1],
        'lmb_end': lchain[-1].pts[-1],
        'trachea_pts': tr,
        'chains': {'trachea': trachea, 'rmb': rchain, 'bi': bchain, 'lmb': lchain},
    }


def tracheal_point(lm, mm_above_carina):
    """Point on the CT trachea `mm` above the carina (arclength along the centerline)."""
    tr = lm['trachea_pts'][::-1]  # carina -> top
    d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(tr, axis=0), axis=1))]
    mm = min(mm_above_carina, d[-1])
    return np.array([np.interp(mm, d, tr[:, k]) for k in range(3)]), d[-1]


# ── registration to the procedural skeleton ─────────────────────────────────

def fit_affine(src, dst, weights=None):
    """Anisotropic scale + sagittal shear + translation (both volumes are patient-aligned).
    The landmarks are nearly coplanar, which makes a full affine singular along the
    anterior-posterior axis; so x and y scales are fitted per axis, z uses their geometric
    mean, and a shear z += k*y absorbs the forward tilt of the CT trachea."""
    src, dst = np.asarray(src, float), np.asarray(dst, float)
    w = np.ones(len(src)) if weights is None else np.asarray(weights, float)
    sw = np.sqrt(w)[:, None]
    sc, tr = np.ones(3), np.zeros(3)
    for k in (0, 1):
        A = np.c_[src[:, k], np.ones(len(src))] * sw
        (sc[k], tr[k]), *_ = np.linalg.lstsq(A, dst[:, k] * sw[:, 0], rcond=None)
    sc[2] = float(np.sqrt(abs(sc[0] * sc[1])))
    # z' = sz*z + k*y + tz
    A = np.c_[src[:, 1], np.ones(len(src))] * sw
    y = (dst[:, 2] - sc[2] * src[:, 2]) * sw[:, 0]
    (shear, tr[2]), *_ = np.linalg.lstsq(A, y, rcond=None)
    shear = float(np.clip(shear, -0.6, 0.6))
    M = np.eye(4)
    M[:3, :3] = np.array([[sc[0], 0, 0], [0, sc[1], 0], [0, shear, sc[2]]])
    M[:3, 3] = tr
    return M


def apply(M, p):
    p = np.asarray(p, float)
    return p @ M[:3, :3].T + M[:3, 3]


def invert(M):
    return np.linalg.inv(M)


def register(lm, proc):
    """CT -> procedural landmark registration. `proc` is the procedural tree JSON (dict)."""
    n = proc['nodes']
    end = lambda i: np.array(n[i]['centerline'][-1], float)
    tr_len = n['TR']['length']
    ct_mid, _ = tracheal_point(lm, 50.0)
    ct_top, ct_len = tracheal_point(lm, 1e9)
    src = [lm['carina'], lm['rul_origin'], lm['bi_end'], lm['lmb_end'], ct_mid, ct_top]
    top = np.array(n['TR']['centerline'][0], float)
    # trachea landmarks: same fraction of tracheal length above the carina in both airways
    dst = [np.zeros(3), end('RMB'), end('BI'), end('LMB'), top * (50.0 / ct_len), top]
    M = fit_affine(src, dst, weights=[6, 2, 2, 2, 1, 1])  # carina matters most
    res = np.linalg.norm(apply(M, np.array(src)) - np.array(dst), axis=1)
    return M, res


# ── labelling: topology gives lobes, geometry gives segments within a lobe ──

def lobe_zones(lm, root):
    """Map id(branch) -> ('TR'|'RMB'|'BI'|'LMB'|zone) from the landmark chains."""
    tag = {}
    ch = lm['chains']
    for k, name in (('trachea', 'TR'), ('rmb', 'RMB'), ('bi', 'BI'), ('lmb', 'LMB')):
        for b in ch[k]:
            tag[id(b)] = name

    def fill(b, zone):
        for x in walk(b):
            tag.setdefault(id(x), zone)

    def side_children(chain):
        nxt = {id(c) for c in chain[1:]}
        return [c for b in chain for c in b.children if id(c) not in nxt]

    # right: children off the RMB chain go to RUL if they head up, children of the BI end split RML/RLL
    for c in side_children(ch['rmb']):
        if c is not ch['bi'][0]:
            fill(c, 'RUL' if c.heading()[1] > -0.2 else 'RLL')
    for c in side_children(ch['bi']):
        fill(c, 'RML' if c.heading()[2] > 0.15 and c.heading()[1] > -0.8 else 'RLL')
    for c in side_children(ch['lmb']):
        h = c.heading()
        fill(c, 'LUL' if (h[1] + h[2]) > (0.0) and h[1] > -0.6 else 'LLL')
    for b in walk(root):
        tag.setdefault(id(b), 'RLL')
    return tag


ZONE_OK = {'RUL': {'RUL'}, 'RML': {'RML'}, 'RLL': {'RLL'}, 'LUL': {'LUL', 'LING'}, 'LLL': {'LLL'}}


def label_branches(root, M, proc, lm):
    """Id of the nearest procedural airway (within the CT branch's own lobe) for each CT branch."""
    from scipy.spatial import cKDTree
    zones = lobe_zones(lm, root)
    per = {}
    for nd in proc['nodes'].values():
        if nd['level'] in ('subsegment', 'distal'):
            continue
        c = np.array(nd['centerline'], float)
        d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(c, axis=0), axis=1))]
        for t in np.arange(0, d[-1] + 0.01, 1.0):
            per.setdefault(nd['zone'] if nd['level'] in ('lobar', 'division', 'segment') else None, []).append(
                ([np.interp(t, d, c[:, k]) for k in range(3)], nd['id']))
    trees = {}
    for zone, rows in per.items():
        trees[zone] = (cKDTree(np.array([r[0] for r in rows])), np.array([r[1] for r in rows]))
    out = {}
    for b in walk(root):
        z = zones[id(b)]
        if z in ('TR', 'RMB', 'BI', 'LMB'):
            out[id(b)] = (z, 1.0, 0.0, z)
            continue
        zk = [k for k in trees if k in ZONE_OK[z]]
        q = apply(M, b.pts)
        best = None
        for k in zk:
            dist, j = trees[k][0].query(q)
            ids, counts = np.unique(trees[k][1][j], return_counts=True)
            cand = (float(np.median(dist)), str(ids[np.argmax(counts)]), float(counts.max() / len(q)))
            best = min(best, cand) if best else cand
        out[id(b)] = (best[1], best[2], best[0], z)
    return out
