/**
 * Build step: compile data/features.yaml + data/clients/*.yaml into
 * public/data/matrix.json. Runs as `prebuild` before `astro build`.
 * Fails (non-zero exit) on any invalid client file — this is the CI gate.
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadFeatures } from '../lib/features';
import { loadClients, buildMatrix } from '../lib/build';

function main() {
  const taxonomy = loadFeatures();
  const clientsDir = path.join(process.cwd(), 'data/clients');
  const clients = loadClients(clientsDir, taxonomy);

  const bundle = buildMatrix(clients, taxonomy);

  const outDir = path.join(process.cwd(), 'public/data');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, 'matrix.json');
  fs.writeFileSync(outFile, JSON.stringify(bundle, null, 2), 'utf8');

  console.log(
    `Built matrix.json: ${bundle.clients.length} clients × ` +
      `${Object.values(bundle.matrix[bundle.clients[0]?.id] ?? {}).length} features -> ${outFile}`,
  );
}

main();
