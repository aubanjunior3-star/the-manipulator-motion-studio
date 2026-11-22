import { registry } from "@manipulator/scene-schema";

/** builtin:<clé> → /builtin/<fichier du catalogue> ; project:<chemin> → /project-assets/<chemin>
 *  (assets des scènes de référence). Toute autre URI est refusée (null → avertissement). */
export function resolveAsset(uri: string, projectBase: string | null = "/project-assets/"): string | null {
  if (uri.startsWith("builtin:")) {
    const entry = registry.builtin_assets[uri.slice("builtin:".length)];
    return entry ? `/builtin/${entry.file}` : null;
  }
  if (uri.startsWith("project:")) return projectBase ? projectBase + uri.slice("project:".length) : null;
  return null;
}
