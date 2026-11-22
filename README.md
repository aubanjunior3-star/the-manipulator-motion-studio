# The Manipulator Motion Studio

Logiciel de création d'animations 2D/3D pilotée par IA : l'utilisateur décrit ce qu'il veut,
l'IA conçoit la scène, choisit les mouvements, la caméra et la lumière, et produit un rendu
professionnel, modifiable par la conversation ou à la main dans une timeline.

- Étude technique et plan de construction : [`docs/ETUDE_TECHNIQUE.md`](docs/ETUDE_TECHNIQUE.md)
- Avancement : [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Décisions d'architecture : [`docs/adr/`](docs/adr/README.md)
- Format de scène (MSD) : [`docs/schema/MSD.md`](docs/schema/MSD.md)

## État actuel — phases 1 et 2 terminées

Opérationnel et testé :
- **Format de scène MSD 0.1** et sa validation (structure + cohérence), erreurs avec chemin précis.
- **Moteur d'animation** déterministe : keyframes, courbes, 9 mouvements, animation par
  lettre / mot / ligne.
- **Rendu Three.js** : texte 3D extrudé, formes, matériaux, lumières, ombres, caméras, modèles glTF.
- **Visionneuse** pour jouer les scènes.
- **Export vidéo MP4 / WebM** directement depuis la visionneuse (bouton « Exporter… »), sans rien installer.
- **Tests** : Python, TypeScript et tests visuels sur images de référence (CI Linux + Windows).

Pas encore disponible : IA (phase 3), éditeur complet (phase 4), formats ProRes/GIF et audio (V1).

## Démarrage (Windows, macOS, Linux)

Prérequis : [Node.js 22](https://nodejs.org), [uv](https://docs.astral.sh/uv/) (gère Python
automatiquement), pnpm (`corepack enable`).

```bash
pnpm install
uv --directory services/api sync
pnpm test
```

`pnpm test` vérifie que les fichiers générés sont à jour, puis lance les tests Python, la
vérification de types et les tests TypeScript.

### Visionneuse
```bash
pnpm viewer
```
Ouvre l'adresse affichée (http://localhost:5173). Espace : lecture/pause ; ← → : image par image.
Le compteur en haut à droite indique la cadence réelle sur ta machine.

### Tests visuels
```bash
pnpm test:visual
```
Rend chaque scène de référence dans Chromium et compare aux images de `tests/golden/`.
Après un changement de rendu **voulu** : `UPDATE_GOLDEN=1 pnpm test:visual`, puis vérifier les
nouvelles images avant de les commiter. Première fois : `pnpm --filter @manipulator/viewer exec playwright install chromium`.

## Modifier le schéma
1. Modifier `services/api/manipulator_api/schema/models.py` ou `registry.py`.
2. `pnpm schema:export` puis `pnpm schema:types`.
3. Ajouter ou ajuster les scènes de référence dans `tests/fixtures/scenes/` et leurs tests.
4. `pnpm test`.

## Structure
```
apps/viewer/             visionneuse (Vite) + tests visuels
packages/scene-schema/   types TS générés, registre, validation structurelle (Ajv)
packages/motion-engine/  evaluate(scène, t) : moteur d'animation pur
packages/render-three/   rendu Three.js (texte, formes, lumières, glTF)
packages/export/         export vidéo navigateur (WebCodecs + Mediabunny)
assets/builtin/          ressources livrées (polices OFL)
services/api/            backend Python : schéma MSD (source de vérité), validation
tests/fixtures/scenes/   scènes de référence partagées Python ⇄ TypeScript
tests/golden/            images de référence des tests visuels
docs/                    étude, roadmap, ADR, référence du format
```
