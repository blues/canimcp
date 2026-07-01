/**
 * spec-drift-check — detect when the MCP specification has moved past the
 * version canimcp currently tracks (data/features.yaml `spec_version`).
 *
 * Signal: the MCP repo publishes one machine-readable schema directory per
 * spec revision at `schema/<YYYY-MM-DD>/`. We list those, pick the newest,
 * and compare it to our tracked version.
 *
 * Output: prints a human summary and writes machine-readable results to the
 * GitHub Actions step output (`drift`, `latest`, `current`, `all`) when
 * running in CI. Exit code is always 0 — drift is reported, not an error.
 *
 * Run: tsx scripts/spec-drift-check.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const REPO = 'modelcontextprotocol/modelcontextprotocol';
const SCHEMA_API = `https://api.github.com/repos/${REPO}/contents/schema`;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface GhContent {
  name: string;
  type: string;
}

function currentSpecVersion(): string {
  const p = path.join(process.cwd(), 'data/features.yaml');
  const doc = YAML.parse(fs.readFileSync(p, 'utf8')) as { spec_version?: string };
  if (!doc?.spec_version) throw new Error('features.yaml has no spec_version');
  return doc.spec_version;
}

async function listSpecVersions(): Promise<string[]> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'canimcp-spec-drift-check',
  };
  // Use the token if present (avoids the low anonymous rate limit in CI).
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(SCHEMA_API, { headers });
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} listing ${SCHEMA_API}`);
  }
  const items = (await res.json()) as GhContent[];
  return items
    .filter((i) => i.type === 'dir' && DATE_RE.test(i.name))
    .map((i) => i.name)
    .sort(); // ISO date strings sort lexicographically = chronologically
}

function setOutput(key: string, value: string) {
  const out = process.env.GITHUB_OUTPUT;
  if (!out) return;
  // Multi-line-safe delimiter form.
  fs.appendFileSync(out, `${key}<<__EOF__\n${value}\n__EOF__\n`);
}

async function main() {
  const current = currentSpecVersion();
  const versions = await listSpecVersions();
  if (versions.length === 0) throw new Error('No spec versions found upstream');

  const latest = versions[versions.length - 1];
  const drift = latest !== current;
  const newer = versions.filter((v) => v > current);

  console.log(`Tracked spec version : ${current}`);
  console.log(`Latest upstream       : ${latest}`);
  console.log(`All upstream versions : ${versions.join(', ')}`);
  if (drift) {
    console.log(`\n⚠️  SPEC DRIFT: upstream has ${newer.length} newer revision(s): ${newer.join(', ')}`);
  } else {
    console.log('\n✓ Up to date — canimcp tracks the latest MCP spec revision.');
  }

  setOutput('drift', String(drift));
  setOutput('current', current);
  setOutput('latest', latest);
  setOutput('newer', newer.join(', '));
  setOutput('all', versions.join(', '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
