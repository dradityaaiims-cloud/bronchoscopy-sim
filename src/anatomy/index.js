// Anatomy provider facade. Anything that returns a valid airway-tree JSON can
// drive the whole app; Phase 2 adds a CT-derived provider here (centerline JSON
// + GLB mesh) without touching rendering or modes.
import { generateProceduralTree } from './proceduralTree.js';
import { validateTree, prepareTree } from './airwayTree.js';

/**
 * @param {{source?: 'procedural'|'json', url?: string}} opts
 *   source 'json' fetches an airway-tree JSON from `url` (see README schema).
 */
export async function loadAirwayTree({ source = 'procedural', url } = {}) {
  let raw;
  if (source === 'json') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Could not load airway tree from ${url}: ${res.status}`);
    raw = await res.json();
  } else {
    raw = generateProceduralTree();
  }
  return prepareTree(validateTree(raw));
}

export { generateProceduralTree, validateTree, prepareTree };
export * from './airwayTree.js';
