/**
 * canimcp — build-time matrix loader (NODE ONLY).
 *
 * Kept separate from `matrix.ts` so that the browser/island bundle (which
 * imports types + pure helpers from `matrix.ts`) never pulls in node built-ins.
 * Only Astro frontmatter / build scripts should import this module.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { MatrixBundle } from './matrix';

/**
 * Read and parse the compiled matrix bundle from disk at build time.
 *
 * Reads from `<cwd>/public/data/matrix.json`. Run
 * `npx tsx scripts/build-data.ts` (or `npm run build:data`) beforehand if the
 * file is missing — it is gitignored.
 */
export function loadMatrix(): MatrixBundle {
  const p = path.join(process.cwd(), 'public', 'data', 'matrix.json');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw) as MatrixBundle;
}
