/**
 * evaluate(t) — état complet d'une scène MSD à l'instant t (secondes).
 *
 * Fonction pure et déterministe : même document + même t ⇒ même résultat, quel que soit
 * l'ordre des appels (aucun état conservé entre deux évaluations). Tout l'aléatoire dérive
 * de settings.seed.
 *
 * Ordre de calcul pour chaque nœud :
 *   1. valeurs statiques du document ;
 *   2. pistes de keyframes (remplacent la propriété ; avant la 1re clé → 1re valeur,
 *      après la dernière → dernière valeur) ;
 *   3. behaviors, dans l'ordre du tableau `animations` (cumulatifs) ;
 *   4. hiérarchie (matrices monde, opacité cumulée) ;
 *   5. look_at puis dolly (ils dépendent des positions monde).
 *
 * Le document est supposé validé (services/api … validate.py). Un behavior que ce moteur
 * ne sait pas exécuter lève UnsupportedFeatureError : jamais d'omission silencieuse.
 */
import type {
  Behavior,
  CameraNode,
  KeyframeTrack,
  LightNode,
  Material,
  SceneDocument,
  TextNode,
} from "@manipulator/scene-schema";
import { hexToLinear } from "./color.js";
import { applyEase, EASES, resolveEase, type EaseFn } from "./ease.js";
import {
  AXES,
  clamp01,
  DEG,
  type Mat4,
  mat4Compose,
  mat4Mul,
  mat4Position,
  mat4Rotation,
  type Quat,
  quatAxisAngle,
  quatConj,
  quatFromEulerDeg,
  quatLookDirection,
  quatMul,
  quatNormalize,
  rotateVec,
  smoothstep,
  v3,
  type Vec3,
} from "./math.js";
import { hashString, noise1, shuffledIndices } from "./random.js";
import { splitGlyphs, unitCount, type GlyphUnit } from "./text.js";

// ---------------------------------------------------------------------------
// Types de sortie
// ---------------------------------------------------------------------------

export interface GlyphState {
  /** Décalage (repère local du texte) à appliquer au glyphe, autour de son centre. */
  offset: Vec3;
  quaternion: Quat;
  scale: Vec3;
  opacity: number;
}

export interface NodeState {
  id: string;
  type: string;
  parent: string | null;
  position: Vec3;
  quaternion: Quat;
  scale: Vec3;
  /** Opacité propre (après animations). */
  opacity: number;
  /** Opacité cumulée avec les parents : celle à afficher. */
  worldOpacity: number;
  visible: boolean;
  /** Visibilité cumulée avec les parents. */
  worldVisible: boolean;
  worldMatrix: Mat4;
  /** Propriétés animables propres au type (fov, intensity, color linéaire, size…). */
  props: Record<string, number | Vec3>;
  /** Textes uniquement : un état par glyphe (caractères non blancs, dans l'ordre). */
  glyphs?: GlyphState[];
  /** Nœud visé par un look_at actif à cet instant, sinon null. Les lumières directionnelles
   *  et spots visent ce nœud ; sans look_at, elles visent l'origine du monde (ADR 0003). */
  lookAtTarget: string | null;
}

export interface MaterialState {
  id: string;
  /** Couleurs en sRGB linéaire. */
  base_color: Vec3;
  emissive: Vec3;
  metalness: number;
  roughness: number;
  emissive_intensity: number;
  opacity: number;
}

export interface FrameState {
  t: number;
  activeCamera: string | null;
  /** Fond en sRGB linéaire. */
  background: Vec3;
  /** Nœuds dans l'ordre parent → enfants. */
  nodes: NodeState[];
  byId: Record<string, NodeState>;
  materials: Record<string, MaterialState>;
}

export class UnsupportedFeatureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFeatureError";
  }
}

export const IMPLEMENTED_BEHAVIORS = [
  "enter",
  "exit",
  "spin",
  "float",
  "pulse",
  "wiggle",
  "orbit",
  "dolly",
  "look_at",
] as const;

// ---------------------------------------------------------------------------
// Pré-calcul (une fois par document)
// ---------------------------------------------------------------------------

type AnyNode = SceneDocument["nodes"] extends (infer N)[] | undefined ? N : never;

interface Prepared {
  doc: SceneDocument;
  order: AnyNode[];
  tracksByTarget: Map<string, KeyframeTrack[]>;
  behaviorsByTarget: Map<string, PreparedBehavior[]>;
  glyphsByNode: Map<string, GlyphUnit[]>;
  materials: Material[];
}

interface PreparedBehavior {
  b: Behavior;
  ease: EaseFn;
  easeGiven: boolean;
  /** rang (ordre de départ) de chaque unité de découpage, si split != none */
  ranks?: number[];
  seed: number;
}

function topoOrder(nodes: AnyNode[]): AnyNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const out: AnyNode[] = [];
  const done = new Set<string>();
  const visit = (n: AnyNode, depth: number) => {
    if (done.has(n.id)) return;
    if (depth > nodes.length) throw new Error(`Cycle de parenté sur '${n.id}' (document non validé ?)`);
    const p = n.parent ? byId.get(n.parent) : undefined;
    if (p) visit(p, depth + 1);
    done.add(n.id);
    out.push(n);
  };
  nodes.forEach((n) => visit(n, 0));
  return out;
}

function ranksFor(count: number, order: Behavior["order"], seed: number): number[] {
  const idx = Array.from({ length: count }, (_, i) => i);
  switch (order ?? "forward") {
    case "forward":
      return idx;
    case "reverse":
      return idx.map((i) => count - 1 - i);
    case "center_out":
      return idx.map((i) => Math.floor(Math.abs(i - (count - 1) / 2)));
    case "random": {
      const perm = shuffledIndices(count, seed);
      const ranks = new Array<number>(count);
      perm.forEach((unit, rank) => (ranks[unit] = rank));
      return ranks;
    }
  }
}

function prepare(doc: SceneDocument): Prepared {
  const nodes = doc.nodes ?? [];
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const tracksByTarget = new Map<string, KeyframeTrack[]>();
  const behaviorsByTarget = new Map<string, PreparedBehavior[]>();
  const glyphsByNode = new Map<string, GlyphUnit[]>();
  for (const n of nodes) if (n.type === "text") glyphsByNode.set(n.id, splitGlyphs((n as TextNode).content));

  const baseSeed = doc.settings.seed ?? 0;
  for (const a of doc.animations ?? []) {
    if (a.kind === "keyframes") {
      const list = tracksByTarget.get(a.target) ?? [];
      list.push(a);
      tracksByTarget.set(a.target, list);
      continue;
    }
    if (!(IMPLEMENTED_BEHAVIORS as readonly string[]).includes(a.behavior)) {
      throw new UnsupportedFeatureError(`Behavior '${a.behavior}' non pris en charge par ce moteur.`);
    }
    const seed = hashString(a.id, baseSeed >>> 0);
    const easeParam = a.params?.ease;
    const defaultEase: Record<string, string> = {
      enter: "ease_out_strong",
      exit: "ease_in_strong",
      spin: "linear",
      orbit: "ease_in_out",
      dolly: "ease_in_out",
    };
    const pb: PreparedBehavior = {
      b: a,
      ease: resolveEase(typeof easeParam === "string" ? easeParam : undefined, defaultEase[a.behavior] ?? "linear"),
      easeGiven: typeof easeParam === "string",
      seed,
    };
    const split = a.split ?? "none";
    if (split !== "none") {
      const target = nodeById.get(a.target);
      if (!target || target.type !== "text") throw new UnsupportedFeatureError(`split réservé aux textes ('${a.id}').`);
      const count = unitCount(glyphsByNode.get(a.target) ?? [], split);
      pb.ranks = ranksFor(count, a.order, seed);
    }
    const list = behaviorsByTarget.get(a.target) ?? [];
    list.push(pb);
    behaviorsByTarget.set(a.target, list);
  }
  return { doc, order: topoOrder(nodes), tracksByTarget, behaviorsByTarget, glyphsByNode, materials: doc.materials ?? [] };
}

// ---------------------------------------------------------------------------
// Pistes de keyframes
// ---------------------------------------------------------------------------

type Value = number | Vec3;

/** Les couleurs sont converties en linéaire avant interpolation (composante par composante). */
function trackValue(track: KeyframeTrack, t: number): Value {
  const kfs = track.keyframes;
  const conv = (v: number | number[] | string): Value =>
    typeof v === "string" ? hexToLinear(v) : Array.isArray(v) ? ([v[0]!, v[1]!, v[2]!] as Vec3) : v;
  const first = kfs[0];
  if (t <= first.t || kfs.length === 1) return conv(first.value);
  const last = kfs[kfs.length - 1]!;
  if (t >= last.t) return conv(last.value);
  let i = 0;
  while (i < kfs.length - 2 && t >= kfs[i + 1]!.t) i++;
  const a = kfs[i]!, b = kfs[i + 1]!;
  const e = applyEase(resolveEase(a.ease), (t - a.t) / (b.t - a.t));
  const va = conv(a.value), vb = conv(b.value);
  if (typeof va === "number" && typeof vb === "number") return va + (vb - va) * e;
  return v3.lerp(va as Vec3, vb as Vec3, e);
}

interface Working {
  position: Vec3;
  rotationDeg: Vec3;
  quaternion: Quat;
  scale: Vec3;
  opacity: number;
  props: Record<string, number | Vec3>;
  glyphs?: GlyphState[];
  lookAt?: { target: string };
  dolly: number;
}

function setPath(w: Working, path: string, value: Value): void {
  const parts = path.split(".");
  if (parts[0] === "transform") {
    const key = parts[1] === "position" ? "position" : parts[1] === "rotation" ? "rotationDeg" : "scale";
    if (parts.length === 2) w[key] = [...(value as Vec3)] as Vec3;
    else w[key][parts[2] === "x" ? 0 : parts[2] === "y" ? 1 : 2] = value as number;
    return;
  }
  if (path === "opacity") {
    w.opacity = value as number;
    return;
  }
  w.props[path] = value;
}

// ---------------------------------------------------------------------------
// Behaviors
// ---------------------------------------------------------------------------

interface Delta {
  offset: Vec3;
  /** rotation locale (appliquée après l'orientation existante) */
  postRot: Quat;
  scale: Vec3;
  opacity: number;
}

const identityDelta = (): Delta => ({ offset: [0, 0, 0], postRot: [0, 0, 0, 1], scale: [1, 1, 1], opacity: 1 });

const num = (b: Behavior, key: string, dflt: number): number => {
  const v = b.params?.[key];
  return typeof v === "number" ? v : dflt;
};
const str = (b: Behavior, key: string, dflt: string): string => {
  const v = b.params?.[key];
  return typeof v === "string" ? v : dflt;
};

/** Enveloppe d'entrée/sortie douce des behaviors continus (float, pulse, wiggle) :
 *  évite tout saut au début et à la fin de leur fenêtre. */
function envelope(tau: number, duration: number): number {
  if (tau < 0 || tau > duration) return 0;
  const r = Math.min(0.25, duration / 4);
  return smoothstep(0, r, tau) * smoothstep(0, r, duration - tau);
}

/** Delta d'un behavior « par unité » (objet entier ou une lettre/mot/ligne) à l'instant t,
 *  pour une unité qui démarre à `start`. */
function unitDelta(pb: PreparedBehavior, t: number, start: number, unitSeed: number): Delta {
  const { b } = pb;
  const d = identityDelta();
  const dur = b.duration;
  const p = clamp01((t - start) / dur);
  const tau = t - start;
  switch (b.behavior) {
    case "enter": {
      const style = str(b, "style", "rise");
      const dist = num(b, "distance", 0.5);
      const ease = style === "pop" && !pb.easeGiven ? EASES.back_out! : pb.ease;
      const e = applyEase(ease, p);
      const fadeIn = clamp01(p / 0.6);
      switch (style) {
        case "fade":
          d.opacity = clamp01(e);
          break;
        case "rise":
          d.offset = [0, -dist * (1 - e), 0];
          d.opacity = fadeIn;
          break;
        case "drop":
          d.offset = [0, dist * (1 - e), 0];
          d.opacity = fadeIn;
          break;
        case "slide_left":
          d.offset = [dist * (1 - e), 0, 0];
          d.opacity = fadeIn;
          break;
        case "slide_right":
          d.offset = [-dist * (1 - e), 0, 0];
          d.opacity = fadeIn;
          break;
        case "scale_up": {
          const s = Math.max(0, e);
          d.scale = [s, s, s];
          d.opacity = fadeIn;
          break;
        }
        case "pop": {
          const s = Math.max(0, 0.4 + 0.6 * e);
          d.scale = [s, s, s];
          d.opacity = clamp01(p / 0.4);
          break;
        }
        default:
          throw new UnsupportedFeatureError(`Style d'entrée '${style}' non pris en charge.`);
      }
      return d;
    }
    case "exit": {
      const style = str(b, "style", "fade");
      const dist = num(b, "distance", 0.5);
      const e = applyEase(pb.ease, p);
      const fadeOut = clamp01((1 - p) / 0.6);
      switch (style) {
        case "fade":
          d.opacity = clamp01(1 - e);
          break;
        case "rise":
          d.offset = [0, dist * e, 0];
          d.opacity = fadeOut;
          break;
        case "drop":
          d.offset = [0, -dist * e, 0];
          d.opacity = fadeOut;
          break;
        case "slide_left":
          d.offset = [-dist * e, 0, 0];
          d.opacity = fadeOut;
          break;
        case "slide_right":
          d.offset = [dist * e, 0, 0];
          d.opacity = fadeOut;
          break;
        case "scale_down": {
          const s = Math.max(0, 1 - e);
          d.scale = [s, s, s];
          d.opacity = fadeOut;
          break;
        }
        default:
          throw new UnsupportedFeatureError(`Style de sortie '${style}' non pris en charge.`);
      }
      return d;
    }
    case "spin": {
      const axis = AXES[str(b, "axis", "y") as "x" | "y" | "z"] ?? AXES.y;
      const angle = num(b, "revolutions", 1) * 2 * Math.PI * applyEase(pb.ease, p);
      d.postRot = quatAxisAngle(axis, angle);
      return d;
    }
    case "float": {
      const env = envelope(tau, dur);
      const a = num(b, "amplitude", 0.1), f = num(b, "frequency", 0.5);
      d.offset = [0, a * Math.sin(2 * Math.PI * f * tau) * env, 0];
      d.postRot = quatAxisAngle(AXES.z, 4 * DEG * Math.sin(Math.PI * f * tau + 1) * env);
      return d;
    }
    case "pulse": {
      const env = envelope(tau, dur);
      const s = 1 + num(b, "amount", 0.08) * (0.5 - 0.5 * Math.cos(2 * Math.PI * num(b, "frequency", 1) * tau)) * env;
      d.scale = [s, s, s];
      return d;
    }
    case "wiggle": {
      const env = envelope(tau, dur);
      const a = num(b, "amplitude", 0.05), x = num(b, "frequency", 2) * tau;
      // Phase propre à chaque axe : sans elle, le bruit (nul aux entiers) ramènerait les trois
      // axes au repos aux mêmes instants, une régularité visible à l'écran.
      const axis = (k: number) => {
        const s = (unitSeed ^ k) >>> 0;
        return a * noise1(s, x + (s % 1000) / 1000 + 0.5) * env;
      };
      d.offset = [axis(0x1), axis(0x2), axis(0x3)];
      return d;
    }
    default:
      return d;
  }
}

function composeDelta(w: { position: Vec3; quaternion: Quat; scale: Vec3; opacity: number }, d: Delta): void {
  w.position = v3.add(w.position, d.offset);
  w.quaternion = quatNormalize(quatMul(w.quaternion, d.postRot));
  w.scale = v3.mul(w.scale, d.scale);
  w.opacity *= d.opacity;
}

function applyBehavior(pb: PreparedBehavior, w: Working, t: number, glyphMeta: GlyphUnit[] | undefined): void {
  const { b } = pb;
  const split = b.split ?? "none";

  if (split !== "none" && w.glyphs && glyphMeta && pb.ranks) {
    const units = pb.ranks;
    w.glyphs.forEach((g, i) => {
      const meta = glyphMeta[i]!;
      const unit = split === "char" ? meta.char : split === "word" ? meta.word : meta.line;
      const rank = units[unit] ?? 0;
      const start = b.start + (b.stagger ?? 0) * rank;
      const d = unitDelta(pb, t, start, pb.seed ^ Math.imul(unit + 1, 0x9e3779b1));
      g.offset = v3.add(g.offset, d.offset);
      g.quaternion = quatNormalize(quatMul(g.quaternion, d.postRot));
      g.scale = v3.mul(g.scale, d.scale);
      g.opacity *= d.opacity;
    });
    return;
  }

  switch (b.behavior) {
    case "orbit": {
      const p = clamp01((t - b.start) / b.duration);
      const axis = AXES[str(b, "axis", "y") as "x" | "y" | "z"] ?? AXES.y;
      const angle = num(b, "degrees", 45) * DEG * applyEase(pb.ease, p);
      const c = b.params?.center;
      const center: Vec3 = Array.isArray(c) ? [c[0]!, c[1]!, c[2]!] : [0, 0, 0];
      const q = quatAxisAngle(axis, angle);
      w.position = v3.add(center, rotateVec(q, v3.sub(w.position, center)));
      w.quaternion = quatNormalize(quatMul(q, w.quaternion));
      return;
    }
    case "dolly": {
      const p = clamp01((t - b.start) / b.duration);
      w.dolly += num(b, "distance", 1) * applyEase(pb.ease, p);
      return;
    }
    case "look_at": {
      if (t >= b.start && t <= b.start + b.duration) {
        const node = b.params?.node;
        if (typeof node === "string") w.lookAt = { target: node };
      }
      return;
    }
    default:
      composeDelta(w, unitDelta(pb, t, b.start, pb.seed));
  }
}

// ---------------------------------------------------------------------------
// Évaluation
// ---------------------------------------------------------------------------

export interface Evaluator {
  readonly doc: SceneDocument;
  evaluate(t: number): FrameState;
}

export function createEvaluator(doc: SceneDocument): Evaluator {
  const prep = prepare(doc);
  return { doc, evaluate: (t: number) => evaluateFrame(prep, t) };
}

/** Raccourci sans pré-calcul réutilisé. */
export function evaluate(doc: SceneDocument, t: number): FrameState {
  return createEvaluator(doc).evaluate(t);
}

function baseProps(n: AnyNode): Record<string, number | Vec3> {
  switch (n.type) {
    case "text": {
      const tn = n as TextNode;
      return { size: tn.size ?? 1, letter_spacing: tn.letter_spacing ?? 0 };
    }
    case "camera": {
      const c = n as CameraNode;
      return { fov: c.fov ?? 35, ortho_height: c.ortho_height ?? 10 };
    }
    case "light": {
      const l = n as LightNode;
      return { intensity: l.intensity ?? 1, color: hexToLinear(l.color ?? "#ffffff"), spot_angle: l.spot_angle ?? 30 };
    }
    default:
      return {};
  }
}

const isLightOrCamera = (type: string): boolean => type === "camera" || type === "light";

function evaluateFrame(prep: Prepared, t: number): FrameState {
  const { doc } = prep;
  const byId: Record<string, NodeState> = {};
  const nodes: NodeState[] = [];
  const working = new Map<string, Working>();

  // --- 1 à 3 : valeurs locales ---
  for (const n of prep.order) {
    const tr = n.transform ?? {};
    const w: Working = {
      position: [...(tr.position ?? [0, 0, 0])] as Vec3,
      rotationDeg: [...(tr.rotation ?? [0, 0, 0])] as Vec3,
      quaternion: [0, 0, 0, 1],
      scale: [...(tr.scale ?? [1, 1, 1])] as Vec3,
      opacity: n.opacity ?? 1,
      props: baseProps(n),
      dolly: 0,
    };
    const glyphMeta = prep.glyphsByNode.get(n.id);
    if (glyphMeta) {
      w.glyphs = glyphMeta.map(() => ({ offset: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], opacity: 1 }));
    }
    for (const track of prep.tracksByTarget.get(n.id) ?? []) {
      setPath(w, track.property, trackValue(track, t));
    }
    w.quaternion = quatFromEulerDeg(w.rotationDeg);
    for (const pb of prep.behaviorsByTarget.get(n.id) ?? []) applyBehavior(pb, w, t, glyphMeta);
    working.set(n.id, w);
  }

  // --- 4 : hiérarchie ---
  const computeWorld = () => {
    for (const n of prep.order) {
      const w = working.get(n.id)!;
      const local = mat4Compose(w.position, w.quaternion, w.scale);
      const parent = n.parent ? byId[n.parent] : undefined;
      const worldMatrix = parent ? mat4Mul(parent.worldMatrix, local) : local;
      const opacity = clamp01(w.opacity);
      const visible = n.visible ?? true;
      const state: NodeState = {
        id: n.id,
        type: n.type,
        parent: n.parent ?? null,
        position: w.position,
        quaternion: w.quaternion,
        scale: w.scale,
        opacity,
        worldOpacity: parent ? parent.worldOpacity * opacity : opacity,
        visible,
        worldVisible: parent ? parent.worldVisible && visible : visible,
        worldMatrix,
        props: w.props,
        lookAtTarget: w.lookAt?.target ?? null,
      };
      if (w.glyphs) state.glyphs = w.glyphs.map((g) => ({ ...g, opacity: clamp01(g.opacity) }));
      byId[n.id] = state;
    }
  };
  computeWorld();

  // --- 5 : look_at puis dolly (dans l'ordre parent → enfant) ---
  let needsRecompute = false;
  for (const n of prep.order) {
    const w = working.get(n.id)!;
    if (!w.lookAt && w.dolly === 0) continue;
    needsRecompute = true;
    const parent = n.parent ? byId[n.parent] : undefined;
    const parentRot: Quat = parent ? mat4Rotation(parent.worldMatrix) : [0, 0, 0, 1];
    if (w.lookAt) {
      const target = byId[w.lookAt.target];
      if (target) {
        const selfWorld = parent ? mat4Position(mat4Mul(parent.worldMatrix, mat4Compose(w.position, [0, 0, 0, 1], [1, 1, 1]))) : w.position;
        const dir = v3.sub(mat4Position(target.worldMatrix), selfWorld);
        if (v3.len(dir) > 1e-9) {
          const worldQ = quatLookDirection(dir, isLightOrCamera(n.type));
          w.quaternion = quatNormalize(quatMul(quatConj(parentRot), worldQ));
        }
      }
    }
    if (w.dolly !== 0) {
      const forward = rotateVec(w.quaternion, isLightOrCamera(n.type) ? [0, 0, -1] : [0, 0, 1]);
      w.position = v3.add(w.position, v3.scale(forward, w.dolly));
    }
  }
  if (needsRecompute) {
    for (const k of Object.keys(byId)) delete byId[k];
    computeWorld();
  }

  for (const n of prep.order) nodes.push(byId[n.id]!);

  // --- matériaux ---
  const materials: Record<string, MaterialState> = {};
  for (const m of prep.materials) {
    const w: Working = { position: [0, 0, 0], rotationDeg: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1], opacity: m.opacity ?? 1, dolly: 0, props: {
      base_color: hexToLinear(m.base_color ?? "#ffffff"),
      emissive: hexToLinear(m.emissive ?? "#000000"),
      metalness: m.metalness ?? 0,
      roughness: m.roughness ?? 0.5,
      emissive_intensity: m.emissive_intensity ?? 0,
    } };
    for (const track of prep.tracksByTarget.get(m.id) ?? []) {
      setPath(w, track.property, trackValue(track, t));
    }
    materials[m.id] = {
      id: m.id,
      base_color: w.props.base_color as Vec3,
      emissive: w.props.emissive as Vec3,
      metalness: clamp01(w.props.metalness as number),
      roughness: clamp01(w.props.roughness as number),
      emissive_intensity: Math.max(0, w.props.emissive_intensity as number),
      opacity: clamp01(w.opacity),
    };
  }

  return {
    t,
    activeCamera: doc.active_camera ?? null,
    background: hexToLinear(doc.settings.background ?? "#0e0f11"),
    nodes,
    byId,
    materials,
  };
}
