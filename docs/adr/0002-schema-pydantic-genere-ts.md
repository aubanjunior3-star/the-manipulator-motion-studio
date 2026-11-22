# ADR 0002 — Schéma défini en Pydantic ; JSON Schema et types TypeScript générés

- **Statut :** acceptée — 2026-11-21

## Contexte
Le schéma MSD est utilisé côté Python (IA, validation, rendu Blender) et côté TypeScript
(éditeur, moteur d'animation, rendu Three.js). Deux définitions écrites à la main finiraient
par diverger.

## Décision
- **Source unique :** `services/api/manipulator_api/schema/models.py` (Pydantic v2, mode
  strict, champs inconnus interdits) et `registry.py` (propriétés animables, behaviors, easings).
- **Générés et versionnés** (`pnpm schema:export` puis `pnpm schema:types`) :
  - `packages/scene-schema/generated/msd.schema.json` (JSON Schema 2020-12) ;
  - `packages/scene-schema/generated/registry.json` ;
  - `packages/scene-schema/src/generated/msd.ts` (types TypeScript).
- La CI (`pnpm schema:check`) échoue si un fichier généré n'est pas à jour.
- **Validation en deux couches :**
  - *structure* — identique des deux côtés (Pydantic strict ⇔ Ajv sur le JSON Schema) ;
  - *sémantique* (références, hiérarchie, temps, paramètres de behaviors) — fait autorité
    en Python (`validate.py`), là où l'IA produit les scènes.
- Les **scènes de référence** (`tests/fixtures/scenes`) sont testées des deux côtés : même
  verdict structurel exigé.

## Pourquoi le mode strict
Sans lui, Pydantic convertirait `"0.5"` en `0.5` alors que le JSON Schema le refuse : les
deux côtés ne seraient plus d'accord. Le mode strict accepte en revanche un entier là où un
décimal est attendu, comme JSON Schema.

## Écart connu
JSON Schema considère `30.0` comme un entier, Pydantic strict non. Sans conséquence pratique
(le moteur écrit des entiers), mais à garder en tête.

## Conséquences / suite
Quand l'éditeur permettra l'édition manuelle (phase 4), la validation sémantique sera portée
en TypeScript, testée sur les **mêmes** scènes invalides et leurs codes d'erreur attendus
(`tests/fixtures/scenes/invalid/expectations.json`).
