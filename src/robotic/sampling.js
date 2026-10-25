// Sampling tools and outcomes. A tool is "in" the lesion if its working segment [tip, tip + reach*f]
// passes within `margin * r` of the lesion centre. Reach/margins are teaching values, not device specs.
import * as V from '../anatomy/math.js';
import { distToSegment } from './geometry.js';

export const TOOLS = {
  needle: { name: 'Needle (TBNA)', reach: 18, margin: 0.95, yield: 0.9, note: 'Passes through the airway wall, so it can reach a lesion that is beside the airway.' },
  forceps: { name: 'Forceps', reach: 6, margin: 0.8, yield: 0.85, note: 'Short reach: the tip must be at or in the lesion, normally via an airway that leads into it.' },
  brush: { name: 'Cytology brush', reach: 8, margin: 0.7, yield: 0.7, note: 'Endoluminal sampling with a modest yield; works best with a bronchus sign.' },
};

/** Deterministic pseudo-random in [0,1) from a case seed and attempt number (reproducible outcomes). */
export const roll = (seed, attempt) => V.mulberry32((seed * 7919 + attempt * 104729) >>> 0)();

/**
 * @returns {{diagnostic:boolean, inLesion:boolean, minDist:number, reason:string, p:number}}
 *   inLesion = geometry says the tool reached the lesion; diagnostic additionally needs the yield roll.
 */
export function sample(toolId, tip, fwd, nodule, seed, attempt) {
  const tool = TOOLS[toolId];
  const end = V.add(tip, V.scale(V.norm(fwd), tool.reach));
  const minDist = distToSegment(nodule.center, tip, end);
  const inLesion = minDist <= tool.margin * nodule.r;
  // smaller lesions are harder even when the geometry is right
  const p = tool.yield * Math.min(1, 0.6 + nodule.r / 20);
  const diagnostic = inLesion && roll(seed, attempt) < p;
  const reason = !inLesion
    ? `The ${tool.name.toLowerCase()} passed ${(minDist - nodule.r).toFixed(1)} mm outside the lesion edge.`
    : diagnostic ? 'Tissue obtained from the lesion.' : 'The tool was in the lesion but the specimen was non-diagnostic (sampling error).';
  return { diagnostic, inLesion, minDist, reason, p };
}
