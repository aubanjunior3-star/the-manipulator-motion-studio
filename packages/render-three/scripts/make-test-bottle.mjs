// Génère tests/fixtures/scenes/assets/models/bottle.glb : une bouteille par révolution
// (LatheGeometry), écrite directement au format GLB 2.0. Modèle de test de la scène 04.
// Usage : node packages/render-three/scripts/make-test-bottle.mjs
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/scenes/assets/models/bottle.glb");

const profile = [
  [0, 0], [0.3, 0], [0.34, 0.03], [0.36, 0.08], [0.36, 0.95], [0.33, 1.05], [0.22, 1.18],
  [0.14, 1.26], [0.12, 1.42], [0.145, 1.45], [0.145, 1.6], [0, 1.6],
].map(([x, y]) => new THREE.Vector2(x, y));
const geo = new THREE.LatheGeometry(profile, 64);
geo.computeVertexNormals();

const pos = geo.getAttribute("position").array;
const nor = geo.getAttribute("normal").array;
const idx = Uint32Array.from(geo.getIndex().array);

const pad4 = (n) => (n + 3) & ~3;
const views = [
  { data: new Float32Array(pos), target: 34962 },
  { data: new Float32Array(nor), target: 34962 },
  { data: idx, target: 34963 },
];
let offset = 0;
const bufferViews = views.map((v) => {
  const bv = { buffer: 0, byteOffset: offset, byteLength: v.data.byteLength, target: v.target };
  offset = pad4(offset + v.data.byteLength);
  return bv;
});
const bin = new Uint8Array(offset);
views.forEach((v, i) => bin.set(new Uint8Array(v.data.buffer), bufferViews[i].byteOffset));

geo.computeBoundingBox();
const { min, max } = geo.boundingBox;
const gltf = {
  asset: { version: "2.0", generator: "manipulator make-test-bottle.mjs" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "bottle" }],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
  materials: [{ name: "verre_vert", pbrMetallicRoughness: { baseColorFactor: [0.08, 0.32, 0.2, 1], metallicFactor: 0, roughnessFactor: 0.12 } }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: pos.length / 3, type: "VEC3", min: [min.x, min.y, min.z], max: [max.x, max.y, max.z] },
    { bufferView: 1, componentType: 5126, count: nor.length / 3, type: "VEC3" },
    { bufferView: 2, componentType: 5125, count: idx.length, type: "SCALAR" },
  ],
  bufferViews,
  buffers: [{ byteLength: bin.byteLength }],
};

const json = new TextEncoder().encode(JSON.stringify(gltf));
const jsonLen = pad4(json.byteLength);
const total = 12 + 8 + jsonLen + 8 + bin.byteLength;
const glb = new Uint8Array(total);
const dv = new DataView(glb.buffer);
dv.setUint32(0, 0x46546c67, true);
dv.setUint32(4, 2, true);
dv.setUint32(8, total, true);
dv.setUint32(12, jsonLen, true);
dv.setUint32(16, 0x4e4f534a, true);
glb.fill(0x20, 20, 20 + jsonLen);
glb.set(json, 20);
dv.setUint32(20 + jsonLen, bin.byteLength, true);
dv.setUint32(24 + jsonLen, 0x004e4942, true);
glb.set(bin, 28 + jsonLen);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, glb);
console.log(`Écrit ${out} (${total} octets, ${idx.length / 3} triangles)`);
