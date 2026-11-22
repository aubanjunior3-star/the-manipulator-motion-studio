/// <reference path="./opentype.d.ts" />
/**
 * Mise en page et géométrie du texte (opentype.js → formes Three.js).
 *
 * Contrat avec le moteur : un glyphe par caractère non blanc, dans l'ordre de `content`
 * (voir motion-engine/src/text.ts). Chaque glyphe a sa propre géométrie, centrée sur son
 * centre visuel, pour pouvoir être animé indépendamment (découpage lettre/mot/ligne).
 *
 * Conventions :
 * - `size` = taille du corps (em) en unités de scène ;
 * - `letter_spacing` en fraction de `size`, `line_height` en multiple de `size` ;
 * - origine du texte : milieu de la hauteur des capitales du bloc ; horizontalement,
 *   centre (align center), début (left) ou fin (right) de chaque ligne ;
 * - pas de ligatures ni de mise en forme contextuelle (titrage latin) ; crénage de la table
 *   `kern`/GPOS quand opentype.js sait le lire.
 */
import type { Font, PathCommand } from "opentype.js";
import * as THREE from "three";

export interface GlyphLayout {
  /** Caractère d'origine. */
  char: string;
  /** Centre du glyphe dans le repère du texte. */
  center: THREE.Vector3;
  /** Géométrie centrée sur l'origine ; null pour un caractère sans contour. */
  geometry: THREE.BufferGeometry | null;
}

export interface TextOptions {
  content: string;
  size: number;
  extrude: number;
  bevel: number;
  align: "left" | "center" | "right";
  letterSpacing: number;
  lineHeight: number;
  /** Segments par courbe : qualité / coût (6 par défaut). */
  curveSegments?: number;
}

function commandsToShapes(commands: PathCommand[], scale: number): THREE.Shape[] {
  const sp = new THREE.ShapePath();
  // opentype : Y vers le bas → on inverse
  for (const c of commands) {
    switch (c.type) {
      case "M":
        sp.moveTo(c.x! * scale, -c.y! * scale);
        break;
      case "L":
        sp.lineTo(c.x! * scale, -c.y! * scale);
        break;
      case "Q":
        sp.quadraticCurveTo(c.x1! * scale, -c.y1! * scale, c.x! * scale, -c.y! * scale);
        break;
      case "C":
        sp.bezierCurveTo(c.x1! * scale, -c.y1! * scale, c.x2! * scale, -c.y2! * scale, c.x! * scale, -c.y! * scale);
        break;
      case "Z":
        break;
    }
  }
  // Détection automatique du sens des contours : les polices TrueType et CFF sont opposées.
  return sp.toShapes();
}

export function layoutText(font: Font, o: TextOptions): GlyphLayout[] {
  const scale = o.size / font.unitsPerEm;
  const capHeight = (font.tables.os2?.sCapHeight || font.unitsPerEm * 0.7) * scale;
  const lines = o.content.split(/\r?\n/);
  const lineAdvance = o.lineHeight * o.size;
  const spacing = o.letterSpacing * o.size;
  const segments = o.curveSegments ?? 6;
  const out: GlyphLayout[] = [];

  // Hauteur du bloc : de la hauteur de capitale de la 1re ligne à la ligne de base de la dernière.
  const blockTop = capHeight + 0;
  const blockBottom = -(lines.length - 1) * lineAdvance;
  const yShift = -(blockTop + blockBottom) / 2;

  lines.forEach((line, li) => {
    const chars = [...line];
    const glyphs = chars.map((ch) => font.charToGlyph(ch));
    // positions de stylo (en unités de scène)
    const pens: number[] = [];
    let x = 0;
    glyphs.forEach((g, i) => {
      pens.push(x);
      x += (g.advanceWidth ?? 0) * scale + spacing;
      const next = glyphs[i + 1];
      if (next) x += font.getKerningValue(g, next) * scale;
    });
    const width = Math.max(0, x - spacing);
    const startX = o.align === "left" ? 0 : o.align === "right" ? -width : -width / 2;
    const baseline = -li * lineAdvance + yShift;

    chars.forEach((ch, i) => {
      if (/\s/.test(ch)) return;
      const g = glyphs[i]!;
      const shapes = commandsToShapes(g.getPath(0, 0, font.unitsPerEm).commands, scale);
      let geometry: THREE.BufferGeometry | null = null;
      const center = new THREE.Vector3(startX + pens[i]! + ((g.advanceWidth ?? 0) * scale) / 2, baseline + capHeight / 2, 0);
      if (shapes.length > 0) {
        geometry =
          o.extrude > 0
            ? new THREE.ExtrudeGeometry(shapes, {
                depth: o.extrude,
                curveSegments: segments,
                bevelEnabled: o.bevel > 0,
                bevelThickness: o.bevel,
                bevelSize: o.bevel * 0.6,
                bevelSegments: 2,
              })
            : new THREE.ShapeGeometry(shapes, segments);
        geometry.computeBoundingBox();
        const bb = geometry.boundingBox!;
        const c = new THREE.Vector3();
        bb.getCenter(c);
        // centre visuel du glyphe : pivot des rotations / échelles par lettre
        geometry.translate(-c.x, -c.y, -c.z);
        center.set(startX + pens[i]! + c.x, baseline + c.y, c.z);
      }
      out.push({ char: ch, center, geometry });
    });
  });
  return out;
}
