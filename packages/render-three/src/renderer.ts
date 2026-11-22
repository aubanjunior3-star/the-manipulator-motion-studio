/**
 * SceneRenderer — affiche une scène MSD avec Three.js à n'importe quel instant t.
 *
 * Le rendu ne calcule aucune animation : il applique l'état produit par le moteur
 * (`motion-engine`) aux objets Three.js. renderAt(t) est donc reproductible : le même t
 * donne la même image (à pilote graphique identique).
 *
 * Choix de rendu (documentés dans docs/adr/0006) :
 * - pas de tone mapping : les couleurs du document sortent telles quelles (chartes, aplats) ;
 * - environnement « studio neutre » (RoomEnvironment) en perspective seulement, pour que les
 *   métaux et surfaces brillantes aient des reflets ; désactivé en orthographique (2D) pour
 *   ne pas altérer les aplats ;
 * - lumières directionnelles et spots : visent l'origine ou leur cible look_at (ADR 0003).
 *
 * Un asset introuvable produit un avertissement (LoadReport) et l'objet n'est pas affiché :
 * jamais de substitution silencieuse.
 */
import type { CameraNode, LightNode, SceneDocument, ShapeNode, TextNode } from "@manipulator/scene-schema";
import { createEvaluator, type Evaluator, type FrameState, type NodeState, splitGlyphs } from "@manipulator/motion-engine";
import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { type AssetResolver, loadFont } from "./assets.js";
import { isFlat, shapeGeometry } from "./shapes.js";
import { layoutText } from "./text.js";

export interface RendererOptions {
  canvas: HTMLCanvasElement;
  resolveAsset: AssetResolver;
  /** Densité de pixels (1 par défaut ; réduire pour alléger l'aperçu). */
  pixelRatio?: number;
  antialias?: boolean;
  /** Nécessaire pour relire les pixels après le rendu (export, tests). */
  preserveDrawingBuffer?: boolean;
}

export interface LoadReport {
  warnings: string[];
}

interface MeshBinding {
  mesh: THREE.Mesh;
  materialId: string | null;
  /** Opacité d'origine du matériau (modèles importés). */
  baseOpacity: number;
  glyphIndex?: number;
  glyphCenter?: THREE.Vector3;
}

interface Built {
  object: THREE.Object3D;
  meshes: MeshBinding[];
  camera?: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  light?: THREE.Light;
  lightTarget?: THREE.Object3D;
}

const ENV_INTENSITY_3D = 0.4;

export class SceneRenderer {
  readonly renderer: THREE.WebGLRenderer;
  private readonly resolveAsset: AssetResolver;
  private scene = new THREE.Scene();
  private built = new Map<string, Built>();
  private evaluator: Evaluator | null = null;
  private doc: SceneDocument | null = null;
  private defaultCamera = new THREE.PerspectiveCamera(35, 16 / 9, 0.1, 1000);
  private envTexture: THREE.Texture | null = null;
  private disposables: { dispose(): void }[] = [];

  constructor(opts: RendererOptions) {
    this.resolveAsset = opts.resolveAsset;
    this.renderer = new THREE.WebGLRenderer({
      canvas: opts.canvas,
      antialias: opts.antialias ?? true,
      preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(opts.pixelRatio ?? 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.defaultCamera.position.set(0, 0, 10);
  }

  get document(): SceneDocument | null {
    return this.doc;
  }

  /** Taille de l'image en pixels CSS (multipliée par pixelRatio). */
  setSize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
  }

  setPixelRatio(ratio: number): void {
    this.renderer.setPixelRatio(ratio);
  }

  async load(doc: SceneDocument): Promise<LoadReport> {
    this.clear();
    const warnings: string[] = [];
    this.doc = doc;
    this.evaluator = createEvaluator(doc);
    const first = this.evaluator.evaluate(0);
    const nodeDefs = new Map((doc.nodes ?? []).map((n) => [n.id, n]));
    const assets = new Map((doc.assets ?? []).map((a) => [a.id, a]));
    const materialDefs = new Map((doc.materials ?? []).map((m) => [m.id, m]));

    const makeMaterial = (materialId: string, flat: boolean): THREE.MeshStandardMaterial | THREE.MeshBasicMaterial => {
      const def = materialDefs.get(materialId);
      const side = flat ? THREE.DoubleSide : THREE.FrontSide;
      // shading "flat" : couleur exacte, sans éclairage (aplats 2D, typographie de charte)
      const mat = def?.shading === "flat" ? new THREE.MeshBasicMaterial({ side }) : new THREE.MeshStandardMaterial({ side });
      if (!def) warnings.push(`Matériau '${materialId}' introuvable.`);
      this.disposables.push(mat);
      return mat;
    };

    let anyShadow = false;
    const pending: Promise<void>[] = [];

    for (const state of first.nodes) {
      const node = nodeDefs.get(state.id)!;
      let built: Built;
      switch (node.type) {
        case "group":
          built = { object: new THREE.Group(), meshes: [] };
          break;
        case "shape": {
          const n = node as ShapeNode;
          const geo = shapeGeometry(n.shape);
          this.disposables.push(geo);
          const mesh = new THREE.Mesh(geo, makeMaterial(n.material, isFlat(n.shape)));
          built = { object: mesh, meshes: [{ mesh, materialId: n.material, baseOpacity: 1 }] };
          break;
        }
        case "text": {
          const n = node as TextNode;
          const group = new THREE.Group();
          built = { object: group, meshes: [] };
          const asset = assets.get(n.font);
          const url = asset ? this.resolveAsset(asset.uri) : null;
          if (!url) {
            warnings.push(`Police '${asset?.uri ?? n.font}' introuvable : le texte '${n.id}' n'est pas affiché.`);
            break;
          }
          const b = built;
          pending.push(
            loadFont(url)
              .then((font) => {
                const glyphs = layoutText(font, {
                  content: n.content,
                  size: n.size ?? 1,
                  extrude: n.extrude ?? 0,
                  bevel: n.bevel ?? 0,
                  align: n.align ?? "center",
                  letterSpacing: n.letter_spacing ?? 0,
                  lineHeight: n.line_height ?? 1.2,
                });
                const expected = splitGlyphs(n.content).length;
                if (glyphs.length !== expected) {
                  throw new Error(`Texte '${n.id}' : ${glyphs.length} glyphes rendus, ${expected} attendus.`);
                }
                glyphs.forEach((g, i) => {
                  if (!g.geometry) return; // caractère sans contour
                  this.disposables.push(g.geometry);
                  const mesh = new THREE.Mesh(g.geometry, makeMaterial(n.material, (n.extrude ?? 0) === 0));
                  mesh.position.copy(g.center);
                  group.add(mesh);
                  b.meshes.push({ mesh, materialId: n.material, baseOpacity: 1, glyphIndex: i, glyphCenter: g.center.clone() });
                });
              })
              .catch((e: unknown) => {
                warnings.push(`Police '${asset!.uri}' illisible (${(e as Error).message}) : texte '${n.id}' non affiché.`);
              }),
          );
          break;
        }
        case "model": {
          const group = new THREE.Group();
          built = { object: group, meshes: [] };
          const asset = assets.get(node.asset);
          const url = asset ? this.resolveAsset(asset.uri) : null;
          if (!url) {
            warnings.push(`Modèle '${asset?.uri ?? node.asset}' introuvable : '${node.id}' n'est pas affiché.`);
            break;
          }
          const b = built;
          pending.push(
            new GLTFLoader()
              .loadAsync(url)
              .then((gltf) => {
                group.add(gltf.scene);
                gltf.scene.traverse((o) => {
                  const mesh = o as THREE.Mesh;
                  if (!mesh.isMesh) return;
                  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
                  mats.forEach((m) => this.disposables.push(m));
                  this.disposables.push(mesh.geometry);
                  b.meshes.push({ mesh, materialId: null, baseOpacity: mats[0]?.opacity ?? 1 });
                });
              })
              .catch((e: unknown) => {
                warnings.push(`Modèle '${asset!.uri}' illisible (${(e as Error).message}) : '${node.id}' non affiché.`);
              }),
          );
          break;
        }
        case "camera": {
          const n = node as CameraNode;
          const camera =
            (n.projection ?? "perspective") === "orthographic"
              ? new THREE.OrthographicCamera(-1, 1, 1, -1, n.near ?? 0.1, n.far ?? 1000)
              : new THREE.PerspectiveCamera(n.fov ?? 35, 1, n.near ?? 0.1, n.far ?? 1000);
          built = { object: camera, meshes: [], camera };
          break;
        }
        case "light": {
          const n = node as LightNode;
          let light: THREE.Light;
          let target: THREE.Object3D | undefined;
          switch (n.light) {
            case "ambient":
              light = new THREE.AmbientLight();
              break;
            case "directional": {
              const l = new THREE.DirectionalLight();
              target = l.target;
              light = l;
              break;
            }
            case "point":
              light = new THREE.PointLight();
              break;
            case "spot": {
              const l = new THREE.SpotLight();
              l.penumbra = 0.4;
              target = l.target;
              light = l;
              break;
            }
          }
          if (n.cast_shadow && n.light !== "ambient") {
            light.castShadow = true;
            anyShadow = true;
            const shadow = (light as THREE.DirectionalLight).shadow;
            shadow.mapSize.set(1024, 1024);
            shadow.bias = -0.0005;
            if (n.light === "directional") {
              const cam = shadow.camera as THREE.OrthographicCamera;
              cam.left = cam.bottom = -12;
              cam.right = cam.top = 12;
              cam.near = 0.5;
              cam.far = 60;
            }
          }
          if (target) this.scene.add(target);
          built = { object: light, meshes: [], light, lightTarget: target };
          break;
        }
      }
      this.built.set(state.id, built);
      built.object.name = state.id;
      const parent = state.parent ? this.built.get(state.parent)?.object : undefined;
      (parent ?? this.scene).add(built.object);
    }

    await Promise.all(pending);

    this.renderer.shadowMap.enabled = anyShadow;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    for (const b of this.built.values())
      for (const m of b.meshes) {
        m.mesh.castShadow = anyShadow;
        m.mesh.receiveShadow = anyShadow;
      }

    const activeCam = doc.active_camera ? nodeDefs.get(doc.active_camera) : undefined;
    const perspective = !activeCam || (activeCam as CameraNode).projection !== "orthographic";
    if (perspective) {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      this.envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      pmrem.dispose();
      this.scene.environment = this.envTexture;
      this.scene.environmentIntensity = ENV_INTENSITY_3D;
    }
    if (!doc.active_camera) warnings.push("Aucune caméra active : caméra par défaut (0, 0, 10).");

    return { warnings };
  }

  /** Applique l'état à l'instant t et dessine. Renvoie l'état calculé. */
  renderAt(t: number): FrameState {
    if (!this.evaluator || !this.doc) throw new Error("Aucune scène chargée.");
    const frame = this.evaluator.evaluate(t);
    this.apply(frame);
    this.renderer.render(this.scene, this.activeCamera(frame));
    return frame;
  }

  private activeCamera(frame: FrameState): THREE.Camera {
    const b = frame.activeCamera ? this.built.get(frame.activeCamera) : undefined;
    const aspect = this.doc!.settings.width! / this.doc!.settings.height!;
    if (!b?.camera) {
      this.defaultCamera.aspect = aspect;
      this.defaultCamera.updateProjectionMatrix();
      return this.defaultCamera;
    }
    return b.camera;
  }

  private apply(frame: FrameState): void {
    this.scene.background = new THREE.Color().setRGB(...frame.background);
    const aspect = this.doc!.settings.width! / this.doc!.settings.height!;

    for (const state of frame.nodes) {
      const b = this.built.get(state.id);
      if (!b) continue;
      const o = b.object;
      o.position.set(...state.position);
      o.quaternion.set(...state.quaternion);
      o.scale.set(...state.scale);
      o.visible = state.visible;

      for (const mb of b.meshes) this.applyMesh(mb, state, frame);

      if (b.camera) this.applyCamera(b.camera, state, aspect);
      if (b.light) this.applyLight(b, state, frame);
    }
  }

  private applyMesh(mb: MeshBinding, state: NodeState, frame: FrameState): void {
    let opacity = state.worldOpacity * mb.baseOpacity;
    if (mb.glyphIndex !== undefined && state.glyphs) {
      const g = state.glyphs[mb.glyphIndex]!;
      mb.mesh.position.set(mb.glyphCenter!.x + g.offset[0], mb.glyphCenter!.y + g.offset[1], mb.glyphCenter!.z + g.offset[2]);
      mb.mesh.quaternion.set(...g.quaternion);
      mb.mesh.scale.set(...g.scale);
      opacity *= g.opacity;
    }
    const mats = (Array.isArray(mb.mesh.material) ? mb.mesh.material : [mb.mesh.material]) as (
      | THREE.MeshStandardMaterial
      | THREE.MeshBasicMaterial
    )[];
    for (const mat of mats) {
      if (mb.materialId) {
        const ms = frame.materials[mb.materialId];
        if (ms) {
          mat.color.setRGB(...ms.base_color);
          if (mat instanceof THREE.MeshStandardMaterial) {
            mat.emissive.setRGB(...ms.emissive);
            mat.emissiveIntensity = ms.emissive_intensity;
            mat.metalness = ms.metalness;
            mat.roughness = ms.roughness;
          }
          opacity *= ms.opacity;
        }
      }
      const transparent = opacity < 0.999;
      if (mat.transparent !== transparent) {
        mat.transparent = transparent;
        mat.needsUpdate = true;
      }
      mat.opacity = opacity;
      mat.depthWrite = !transparent;
    }
    // Une forme est elle-même l'objet du nœud : sa visibilité propre compte aussi.
    mb.mesh.visible = (mb.glyphIndex === undefined && mb.mesh.name === state.id ? state.visible : true) && opacity > 0.001;
  }

  private applyCamera(cam: THREE.PerspectiveCamera | THREE.OrthographicCamera, state: NodeState, aspect: number): void {
    if (cam instanceof THREE.PerspectiveCamera) {
      cam.fov = state.props.fov as number;
      cam.aspect = aspect;
    } else {
      const h = state.props.ortho_height as number;
      cam.top = h / 2;
      cam.bottom = -h / 2;
      cam.left = (-h * aspect) / 2;
      cam.right = (h * aspect) / 2;
    }
    cam.updateProjectionMatrix();
  }

  private applyLight(b: Built, state: NodeState, frame: FrameState): void {
    const light = b.light!;
    light.color.setRGB(...(state.props.color as [number, number, number]));
    light.intensity = state.props.intensity as number;
    light.visible = state.worldVisible;
    if (light instanceof THREE.SpotLight) light.angle = ((state.props.spot_angle as number) * Math.PI) / 180;
    if (b.lightTarget) {
      const target = state.lookAtTarget ? frame.byId[state.lookAtTarget] : undefined;
      if (target) b.lightTarget.position.set(target.worldMatrix[12]!, target.worldMatrix[13]!, target.worldMatrix[14]!);
      else b.lightTarget.position.set(0, 0, 0);
      b.lightTarget.updateMatrixWorld();
    }
  }

  private clear(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.envTexture?.dispose();
    this.envTexture = null;
    this.scene = new THREE.Scene();
    this.built.clear();
    this.evaluator = null;
    this.doc = null;
  }

  dispose(): void {
    this.clear();
    this.renderer.dispose();
  }
}
