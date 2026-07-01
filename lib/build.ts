import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { loadFeatures, allFeatureIds, type FeatureTaxonomy } from './features';
import { validateClient, type ClientRecord, type SupportCell } from './validate';

export interface MatrixBundle {
  spec_version: string;
  generated_at: string;
  features: FeatureTaxonomy['categories'];
  clients: Array<Omit<ClientRecord, 'support'>>;
  /** matrix[clientId][featureId] = cell, every cell explicitly filled. */
  matrix: Record<string, Record<string, SupportCell>>;
}

const UNKNOWN: SupportCell = { status: 'unknown' };

/** Load all client YAML files from a directory, validating each. */
export function loadClients(
  dir: string,
  taxonomy: FeatureTaxonomy = loadFeatures(),
): ClientRecord[] {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  const clients: ClientRecord[] = [];
  const seen = new Set<string>();
  for (const f of files) {
    const raw = YAML.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    const client = validateClient(raw, taxonomy); // throws on invalid
    if (seen.has(client.id)) {
      throw new Error(`Duplicate client id "${client.id}" (file ${f})`);
    }
    seen.add(client.id);
    clients.push(client);
  }
  return clients;
}

/** Compile taxonomy + client records into the denormalized bundle. */
export function buildMatrix(
  clients: ClientRecord[],
  taxonomy: FeatureTaxonomy = loadFeatures(),
): MatrixBundle {
  const featureIds = allFeatureIds(taxonomy);
  const matrix: MatrixBundle['matrix'] = {};

  const sorted = [...clients].sort((a, b) => {
    const ar = a.usage_rank ?? Number.POSITIVE_INFINITY;
    const br = b.usage_rank ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
    return a.title.localeCompare(b.title);
  });

  for (const client of sorted) {
    const row: Record<string, SupportCell> = {};
    for (const fid of featureIds) {
      row[fid] = client.support?.[fid] ?? { ...UNKNOWN };
    }
    matrix[client.id] = row;
  }

  return {
    spec_version: taxonomy.spec_version,
    generated_at: new Date().toISOString(),
    features: taxonomy.categories,
    clients: sorted.map(({ support: _support, ...rest }) => rest),
    matrix,
  };
}
