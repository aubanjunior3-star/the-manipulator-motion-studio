# The Manipulator Motion Studio

Logiciel de création d'animations 2D/3D pilotée par IA : l'utilisateur décrit ce qu'il veut,
l'IA conçoit la scène, choisit les mouvements, la caméra et la lumière, et produit un rendu
professionnel, modifiable par la conversation ou à la main dans une timeline.

- Étude technique et plan de construction : [`docs/ETUDE_TECHNIQUE.md`](docs/ETUDE_TECHNIQUE.md)
- Avancement : [`docs/ROADMAP.md`](docs/ROADMAP.md)
- Décisions d'architecture : [`docs/adr/`](docs/adr/README.md)
- Format de scène (MSD) : [`docs/schema/MSD.md`](docs/schema/MSD.md)

## État actuel — phase 0 (fondations)

Opérationnel et testé :
- **Schéma de scène MSD 0.1** (Python/Pydantic) : nœuds, matériaux, assets, keyframes,
  behaviors, marqueurs.
- **Validation** structurelle et sémantique, erreurs avec code + chemin JSON Pointer.
- **Génération** du JSON Schema, du registre et des types TypeScript, avec détection de
  divergence en CI.
- **Paquet TypeScript** `@manipulator/scene-schema` (types, registre, validation structurelle).
- **10 scènes de référence** valides + 26 scènes invalides avec erreurs attendues.

Pas encore disponible : rendu, interface, IA, export (phases 1 à 4).

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

## Modifier le schéma
1. Modifier `services/api/manipulator_api/schema/models.py` ou `registry.py`.
2. `pnpm schema:export` puis `pnpm schema:types`.
3. Ajouter ou ajuster les scènes de référence dans `tests/fixtures/scenes/` et leurs tests.
4. `pnpm test`.

## Structure
```
packages/scene-schema/   types TS générés, registre, validation structurelle (Ajv)
services/api/            backend Python : schéma MSD (source de vérité), validation
tests/fixtures/scenes/   scènes de référence partagées Python ⇄ TypeScript
docs/                    étude, roadmap, ADR, référence du format
```
