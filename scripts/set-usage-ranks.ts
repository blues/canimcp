/**
 * One-off: assign usage_rank to the top MCP clients so the matrix orders the
 * most-used clients first. Ranking is editorial ordering metadata (rough,
 * based on general ecosystem prominence) — it is NOT a capability claim and
 * carries no per-cell source. Everything not listed keeps usage_rank: null.
 *
 * Idempotent: re-running just re-sets the same ranks. Preserves the seed
 * header comment and all other fields.
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

// id -> rank. Ids are the slugs already present in data/clients/.
const RANKS: Record<string, number> = {
  'claude-ai': 1,
  'claude-code': 2,
  'visual-studio-code': 3,
  'cursor-vscode': 4,
  'chatgpt': 5,
  'github-copilot-developer': 6,
  'windsurf': 7,
  'cline': 8,
  'goose': 9,
  'zed': 10,
  'continue-cli-client': 11,
  'codex': 12,
  'gemini-cli-mcp-client': 13,
  'roo-code': 14,
  'com.raycast.macos': 15,
};

const dir = path.join(process.cwd(), 'data/clients');
let updated = 0;
for (const [id, rank] of Object.entries(RANKS)) {
  const file = path.join(dir, `${id}.yaml`);
  if (!fs.existsSync(file)) {
    console.warn(`WARN: no file for ranked id "${id}" (${file})`);
    continue;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const headerMatch = raw.match(/^(#[^\n]*\n)+/);
  const header = headerMatch ? headerMatch[0] : '';
  const doc = YAML.parse(raw) as Record<string, unknown>;
  doc.usage_rank = rank;
  fs.writeFileSync(file, header + YAML.stringify(doc), 'utf8');
  updated++;
}
console.log(`Set usage_rank on ${updated} clients.`);
