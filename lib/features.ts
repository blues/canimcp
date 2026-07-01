import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

export interface Feature {
  id: string;
  title: string;
  spec_url?: string;
}

export interface Category {
  id: string;
  title: string;
  spec_url?: string;
  features: Feature[];
}

export interface FeatureTaxonomy {
  spec_version: string;
  categories: Category[];
}

/** Load and parse the feature taxonomy from data/features.yaml. */
export function loadFeatures(): FeatureTaxonomy {
  const p = path.join(process.cwd(), 'data/features.yaml');
  return YAML.parse(fs.readFileSync(p, 'utf8')) as FeatureTaxonomy;
}

/** Flat list of every feature id declared in the taxonomy. */
export function allFeatureIds(taxonomy: FeatureTaxonomy = loadFeatures()): string[] {
  return taxonomy.categories.flatMap((c) => c.features.map((f) => f.id));
}
