# ADR 0006 — Choix de rendu (render-three)

- **Statut :** acceptée — 2026-11-22

## Contexte
Le rendu doit être fidèle aux intentions du document (couleurs de charte exactes en 2D,
reflets crédibles en 3D), léger pour un GPU intégré, et reproductible pour les tests.

## Décisions
1. **Le rendu n'anime rien** : il applique l'état calculé par `motion-engine` (ADR 0001).
   `renderAt(t)` est reproductible ; vérifié par les tests visuels (octets identiques).
2. **Pas de tone mapping** : la couleur demandée est la couleur affichée. Les scènes 3D très
   éclairées peuvent saturer ; c'est au document (intensités) de le gérer.
3. **`shading` des matériaux** (ajouté au schéma) : `lit` (PBR éclairé, défaut) ou `flat`
   (couleur exacte, non éclairée) pour la typographie, les aplats et les éléments de charte.
4. **Environnement « studio neutre »** (RoomEnvironment, intensité 0,4) en perspective
   uniquement, pour que métaux et surfaces brillantes aient des reflets ; désactivé quand la
   caméra active est orthographique (2D).
5. **Texte** : opentype.js, un maillage par glyphe (animation par lettre), conversion caractère
   par caractère avec crénage. Pas de ligatures ni de mise en forme contextuelle : suffisant
   pour le titrage latin, insuffisant pour l'arabe ou les écritures indiennes (à traiter si
   le besoin apparaît, par exemple avec HarfBuzz compilé en WebAssembly).
6. **Ombres** : activées seulement si une lumière a `cast_shadow` ; carte 1024 px, PCF doux.
7. **Assets** : l'hôte fournit la résolution URI → URL. Asset introuvable ou illisible ⇒
   avertissement et objet non affiché ; jamais de substitution.
8. **Tests visuels** : Chromium + SwiftShader (rendu logiciel, identique en CI), images de
   référence dans `tests/golden/`, tolérance de 0,1 % des pixels. Une première tolérance de
   0,5 % laissait passer le changement de couleur d'une barre fine : vérifié et corrigé.

## Conséquences
- Rendu fidèle et testable ; l'aspect « cinéma » (tone mapping, post-traitements, flou de
  bouger) viendra comme options explicites du document, pas comme réglages cachés.
