/** Géométries des formes MSD. Les formes 2D (rect, ellipse) sont plates dans le plan XY. */
import type { ShapeNode } from "@manipulator/scene-schema";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

type Shape = ShapeNode["shape"];

function roundedRect(w: number, h: number, r: number): THREE.Shape {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  const x = -w / 2, y = -h / 2;
  const s = new THREE.Shape();
  s.moveTo(x + rr, y);
  s.lineTo(x + w - rr, y);
  if (rr) s.quadraticCurveTo(x + w, y, x + w, y + rr);
  s.lineTo(x + w, y + h - rr);
  if (rr) s.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  s.lineTo(x + rr, y + h);
  if (rr) s.quadraticCurveTo(x, y + h, x, y + h - rr);
  s.lineTo(x, y + rr);
  if (rr) s.quadraticCurveTo(x, y, x + rr, y);
  return s;
}

export function shapeGeometry(shape: Shape): THREE.BufferGeometry {
  switch (shape.kind) {
    case "box": {
      const [w, h, d] = shape.size ?? [1, 1, 1];
      const r = Math.min(shape.corner_radius ?? 0, w / 2, h / 2, d / 2);
      return r > 0 ? new RoundedBoxGeometry(w, h, d, 4, r) : new THREE.BoxGeometry(w, h, d);
    }
    case "sphere":
      return new THREE.SphereGeometry(shape.radius ?? 0.5, 48, 32);
    case "cylinder":
      return new THREE.CylinderGeometry(shape.radius_top ?? 0.5, shape.radius_bottom ?? 0.5, shape.height ?? 1, 48);
    case "torus":
      return new THREE.TorusGeometry(shape.radius ?? 0.5, shape.tube ?? 0.15, 24, 96);
    case "plane": {
      const [w, h] = shape.size ?? [1, 1];
      return new THREE.PlaneGeometry(w, h);
    }
    case "rect": {
      const [w, h] = shape.size ?? [1, 1];
      return new THREE.ShapeGeometry(roundedRect(w, h, shape.corner_radius ?? 0), 8);
    }
    case "ellipse": {
      const [rx, ry] = shape.radii ?? [0.5, 0.5];
      const s = new THREE.Shape();
      s.absellipse(0, 0, rx, ry, 0, Math.PI * 2, false, 0);
      return new THREE.ShapeGeometry(s, 64);
    }
  }
}

/** Les formes plates sont visibles des deux côtés. */
export const isFlat = (shape: Shape): boolean => shape.kind === "rect" || shape.kind === "ellipse" || shape.kind === "plane";
