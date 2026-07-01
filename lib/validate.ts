import fs from 'node:fs';
import path from 'node:path';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { allFeatureIds, loadFeatures, type FeatureTaxonomy } from './features';

export interface SupportCell {
  status: 'yes' | 'partial' | 'no' | 'unknown';
  notes?: string;
  source?: string;
  last_verified?: string;
  version_tested?: string;
  provenance?: 'manual' | 'conformance' | 'apify' | 'submission';
}

export interface ClientRecord {
  id: string;
  title: string;
  vendor?: string;
  url: string;
  clientInfo_name?: string;
  platforms?: string[];
  protocolVersion?: string;
  usage_rank?: number | null;
  install_docs_url?: string;
  support?: Record<string, SupportCell>;
}

const schema = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), 'schema/client.schema.json'), 'utf8'),
);

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateSchema = ajv.compile(schema);

/**
 * Validate a client record against the JSON Schema, then cross-check every
 * `support` key against the feature taxonomy. Throws on the first problem.
 */
export function validateClient(
  data: unknown,
  taxonomy: FeatureTaxonomy = loadFeatures(),
): ClientRecord {
  if (!validateSchema(data)) {
    const msg = (validateSchema.errors ?? [])
      .map((e) => `${e.instancePath || '(root)'} ${e.message}`)
      .join('; ');
    throw new Error(`Schema validation failed: ${msg}`);
  }

  const client = data as ClientRecord;
  const known = new Set(allFeatureIds(taxonomy));
  for (const key of Object.keys(client.support ?? {})) {
    if (!known.has(key)) {
      throw new Error(
        `Client "${client.id}" references unknown feature id: "${key}"`,
      );
    }
  }
  return client;
}
