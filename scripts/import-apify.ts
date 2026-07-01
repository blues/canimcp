/**
 * Import seed data from apify/mcp-client-capabilities (Apache-2.0).
 *
 * The Apify dataset is coarse (presence-of-capability, no sub-feature
 * granularity, no sourcing). We map CONSERVATIVELY: presence of a capability
 * implies the base call/list features are supported; explicit nested
 * `listChanged: true` maps to the corresponding listChanged feature. Anything
 * we cannot infer is LEFT OUT (defaults to `unknown` at build time). Every
 * imported cell carries `provenance: apify` + a `source` + `last_verified`.
 *
 * Run: tsx scripts/import-apify.ts
 * A manual review pass (git diff) is required after running — see Task 1.5.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const APIFY_RAW =
  'https://raw.githubusercontent.com/apify/mcp-client-capabilities/master/src/mcp_client_capabilities/mcp-clients.json';
const APIFY_SOURCE = 'https://github.com/apify/mcp-client-capabilities';
// Last commit date of mcp-clients.json at import time.
const LAST_VERIFIED = '2026-02-02';

interface ApifyCap {
  [key: string]: unknown;
}
interface ApifyClient {
  protocolVersion?: string;
  title?: string;
  url?: string;
  [cap: string]: unknown;
}

function slugify(key: string): string {
  return key
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function cell(status = 'yes') {
  return { status, provenance: 'apify', source: APIFY_SOURCE, last_verified: LAST_VERIFIED };
}

/** Conservative capability-key → feature-id mapping. */
function mapSupport(client: ApifyClient): Record<string, ReturnType<typeof cell>> {
  const support: Record<string, ReturnType<typeof cell>> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(client, k);
  const nested = (k: string, n: string) =>
    has(k) && typeof client[k] === 'object' && client[k] !== null &&
    (client[k] as ApifyCap)[n] === true;

  if (has('tools')) {
    support['tools.call'] = cell();
    support['tools.list'] = cell();
    if (nested('tools', 'listChanged')) support['tools.listChanged'] = cell();
  }
  if (has('resources')) {
    support['resources.read'] = cell();
    support['resources.list'] = cell();
    if (nested('resources', 'listChanged')) support['resources.listChanged'] = cell();
    if (nested('resources', 'subscribe')) support['resources.subscribe'] = cell();
  }
  if (has('prompts')) {
    support['prompts.get'] = cell();
    support['prompts.list'] = cell();
  }
  if (has('sampling')) {
    support['sampling.createMessage'] = cell();
  }
  if (has('roots')) {
    support['roots.list'] = cell();
    if (nested('roots', 'listChanged')) support['roots.listChanged'] = cell();
  }
  if (has('elicitation')) {
    support['elicitation.create'] = cell();
  }
  // NOTE: Apify has no data for transports, auth, completions, logging,
  // prompts.arguments/listChanged, resources.templates, tool annotations —
  // these are intentionally left `unknown`. `tasks` is not in our taxonomy.
  return support;
}

async function main() {
  const res = await fetch(APIFY_RAW);
  if (!res.ok) throw new Error(`Failed to fetch Apify dataset: ${res.status}`);
  const data = (await res.json()) as Record<string, ApifyClient>;

  const outDir = path.join(process.cwd(), 'data/clients');
  fs.mkdirSync(outDir, { recursive: true });

  // Accumulate by slug so colliding Apify keys (e.g. "Visual Studio Code" and
  // "Visual-Studio-Code" — the same product) MERGE deterministically instead
  // of silently overwriting each other and losing capability data.
  const bySlug = new Map<string, Record<string, unknown>>();
  for (const [apifyKey, client] of Object.entries(data)) {
    const id = slugify(apifyKey);
    if (!id) continue;
    const support = mapSupport(client);
    const existing = bySlug.get(id);
    if (existing) {
      console.log(`merge (slug collision): "${apifyKey}" -> ${id}.yaml`);
      const mergedSupport = {
        ...((existing.support as Record<string, unknown>) ?? {}),
        ...support,
      };
      if (Object.keys(mergedSupport).length) existing.support = mergedSupport;
      continue;
    }
    const record: Record<string, unknown> = {
      id,
      title: client.title ?? apifyKey,
      url: client.url ?? APIFY_SOURCE,
      clientInfo_name: apifyKey,
    };
    if (client.protocolVersion) record.protocolVersion = client.protocolVersion;
    record.usage_rank = null;
    if (Object.keys(support).length) record.support = support;
    bySlug.set(id, record);
  }

  let written = 0;
  for (const [id, record] of bySlug) {
    const file = path.join(outDir, `${id}.yaml`);
    const header =
      `# Seed-imported from apify/mcp-client-capabilities (Apache-2.0).\n` +
      `# Coarse data — sub-features left \`unknown\`. Review & source before promoting.\n`;
    // Do not clobber a manually-curated file: only overwrite files that still
    // carry the seed header (i.e. have not been hand-edited/promoted).
    if (fs.existsSync(file)) {
      const existing = fs.readFileSync(file, 'utf8');
      if (!existing.startsWith('# Seed-imported from apify')) {
        console.log(`skip (manually curated): ${id}.yaml`);
        continue;
      }
    }
    fs.writeFileSync(file, header + YAML.stringify(record), 'utf8');
    written++;
  }
  console.log(`Imported ${written} client stubs into data/clients/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
