/** Découpage d'un texte en unités animables, indépendant de la police.
 *  Un « glyphe » = un caractère non blanc de `content`, dans l'ordre. Le moteur de rendu
 *  doit produire ses glyphes dans le même ordre (contrat partagé avec render-three). */

export interface GlyphUnit {
  /** Index du glyphe (caractères non blancs). */
  char: number;
  word: number;
  line: number;
  /** Caractère d'origine. */
  value: string;
}

export function splitGlyphs(content: string): GlyphUnit[] {
  const out: GlyphUnit[] = [];
  const lines = content.split(/\r?\n/);
  let word = 0;
  let char = 0;
  lines.forEach((lineText, line) => {
    let inWord = false;
    for (const ch of lineText) {
      if (/\s/.test(ch)) {
        if (inWord) word++;
        inWord = false;
        continue;
      }
      inWord = true;
      out.push({ char: char++, word, line, value: ch });
    }
    if (inWord) word++;
  });
  return out;
}

export function unitCount(glyphs: GlyphUnit[], split: "char" | "word" | "line"): number {
  if (glyphs.length === 0) return 1;
  const last = glyphs[glyphs.length - 1]!;
  return split === "char" ? glyphs.length : split === "word" ? last.word + 1 : last.line + 1;
}
