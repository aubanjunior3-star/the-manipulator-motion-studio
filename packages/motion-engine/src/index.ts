export {
  createEvaluator,
  evaluate,
  IMPLEMENTED_BEHAVIORS,
  UnsupportedFeatureError,
  type Evaluator,
  type FrameState,
  type GlyphState,
  type MaterialState,
  type NodeState,
} from "./evaluate.js";
export { applyEase, bezier, EASES, resolveEase, type EaseFn } from "./ease.js";
export { hexToLinear } from "./color.js";
export { splitGlyphs, unitCount, type GlyphUnit } from "./text.js";
export type { Mat4, Quat, Vec3 } from "./math.js";
