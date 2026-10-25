import sys, json, time, numpy as np
sys.path.insert(0, '.')
import ct_tree as T
case, data = sys.argv[1], sys.argv[2]
proc = json.load(open('../../public/data/airway-tree.json'))
t = time.time()
mask, aff = T.load_mask(f'{data}/{case}/{case}_CT_HR_label_airways.nii.gz')
root = T.build_tree(mask, aff)
T.resample(root)
print('branches', sum(1 for _ in T.walk(root)), 'secs', round(time.time() - t))
lm = T.find_landmarks(root)
print('carina', lm['carina'].round(1), 'tracheaLen', round(T.tracheal_point(lm, 1e9)[1]))
M, res = T.register(lm, proc)
print('landmark residual mm', res.round(1), 'scale', np.linalg.svd(M[:3, :3])[1].round(2), 'det', round(np.linalg.det(M[:3, :3]), 2))
lab = T.label_branches(root, M, proc, lm)
from collections import Counter
c = Counter(v[0] for v in lab.values())
print('segments hit', sorted(k for k in c if k.startswith(('RB', 'LB'))), len([k for k in c if k.startswith(('RB', 'LB'))]), '/18')
