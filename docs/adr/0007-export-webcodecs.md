# ADR 0007 — Export vidéo dans le navigateur (WebCodecs + Mediabunny)

- **Statut :** acceptée — 2026-11-22
- **Modifie :** ADR 0004 (FFmpeg n'est plus requis pour l'export MP4 / WebM)

## Contexte
L'étude prévoyait d'encoder les vidéos avec FFmpeg côté backend. Cela impose à l'utilisateur
d'installer FFmpeg (et le backend Python) : une étape technique de plus pour un public
non-spécialiste, constatée lors de la première installation sur le poste cible.

## Options
1. **FFmpeg (backend)** : tous les formats, mais installation, transfert des images du navigateur
   vers le backend (lent : ~6 Mo par image 1080p non compressée).
2. **ffmpeg.wasm** : sans installation, mais lourd (~30 Mo), lent (pas d'accélération matérielle),
   licence LGPL/GPL à surveiller.
3. **WebCodecs + Mediabunny** : encodeurs intégrés à Chrome/Edge (accélération matérielle Intel
   Quick Sync sous Windows), multiplexage MP4/WebM par Mediabunny (MPL-2.0, TypeScript, sans
   dépendance).

## Décision
Option 3 pour **MP4 (H.264 High)** et **WebM (VP9)**. Vérifié : Chromium (y compris headless,
sans GPU) encode H.264, VP9 et AV1.

- Image *i* rendue à l'instant *i / fps*, horodatée *i / fps* : nombre exact d'images
  (`round(durée × fps)`), aucune image sautée ni dupliquée.
- Canvas dédié à la résolution de sortie : l'aperçu n'est pas affecté.
- Débit cible 0,13 bit/pixel/image (≈ 8 Mb/s en 1080p30), en débit variable : les aplats 2D
  produisent des fichiers bien plus petits que l'estimation affichée (« jusqu'à… »).
- L'encodeur du navigateur marque la vidéo en plage de couleurs complète (`yuvj420p`). Vérifié
  sans impact : PSNR 42–46 dB entre vidéo décodée et rendu direct.

## Tests
`apps/viewer/test/visual/export.test.ts` : conformité (ffprobe : codec, profil, dimensions,
cadence, nombre d'images, durée), fidélité image par image avec contrôle d'absence de décalage
temporel, 9:16 à 60 i/s, mémoire stable sur 60 s (1 800 images), parcours utilisateur du bouton
Exporter (export, téléchargement, annulation).

## Conséquences
- Export sans aucune installation, dans la visionneuse puis l'éditeur.
- **FFmpeg reste prévu** pour ce que WebCodecs ne couvre pas : ProRes 4444 avec alpha, GIF
  optimisé, séquences PNG, mixage audio avancé, rendus cloud (V1/V2).
- Firefox/Safari : WebCodecs partiel ; le logiciel cible Chrome/Edge (et WebView2 avec Tauri).
