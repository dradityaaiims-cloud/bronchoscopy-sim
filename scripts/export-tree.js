// Writes the procedural airway tree to public/data/airway-tree.json.
// Load it in the app with  ?anatomy=data/airway-tree.json  (same JSON schema a
// CT-derived provider will emit in Phase 2).
import { mkdirSync, writeFileSync } from 'node:fs';
import { generateProceduralTree, validateTree } from '../src/anatomy/index.js';

const tree = validateTree(generateProceduralTree());
mkdirSync(new URL('../public/data/', import.meta.url), { recursive: true });
const out = new URL('../public/data/airway-tree.json', import.meta.url);
writeFileSync(out, JSON.stringify(tree));
console.log(`wrote ${out.pathname}: ${Object.keys(tree.nodes).length} airways`);
