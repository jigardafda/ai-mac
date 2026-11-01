import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Some default apps ship with a tuned, already-reviewed build in `templates/`.
 * The first open of such an app installs that build at once instead of writing
 * it from scratch, so everyone gets the same version in a few milliseconds.
 * "Rebuild From Scratch" still writes a fresh one from the brief.
 */
export async function loadTemplate(slug: string): Promise<string | null> {
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  try {
    return await readFile(path.join(process.cwd(), "templates", `${slug}.html`), "utf8");
  } catch {
    return null;
  }
}
