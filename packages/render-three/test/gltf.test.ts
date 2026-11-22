import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { describe, expect, it } from "vitest";

const file = resolve(dirname(fileURLToPath(import.meta.url)), "../../../tests/fixtures/scenes/assets/models/bottle.glb");

describe("modèle de test bottle.glb", () => {
  it("se charge avec le chargeur glTF de Three.js", async () => {
    const buf = readFileSync(file);
    const gltf = await new GLTFLoader().parseAsync(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, "");
    let meshes = 0;
    const box = new THREE.Box3().setFromObject(gltf.scene);
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes++;
    });
    expect(meshes).toBe(1);
    expect(box.min.y).toBeCloseTo(0, 5);
    expect(box.max.y).toBeCloseTo(1.6, 5);
  });
});
