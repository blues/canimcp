/**
 * Enrich flagship client files with MANUALLY-VERIFIED, source-cited capability
 * cells. Every cell below was confirmed by the orchestrator against the cited
 * official documentation (quotes checked on 2026-07-01). Cells NOT listed here
 * are intentionally left as-is (apify seed or unknown) — no fabrication.
 *
 * Merge policy: these `manual` cells OVERWRITE existing apify/unknown cells for
 * the same feature (manual + a real source beats coarse seed data). Other
 * existing cells are preserved. Re-runnable (idempotent).
 */
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';

const VERIFIED = '2026-07-01';

type Cell = {
  status: 'yes' | 'partial' | 'no';
  source: string;
  notes?: string;
  provenance: 'manual';
  last_verified: string;
};
const c = (status: Cell['status'], source: string, notes?: string): Cell => ({
  status,
  source,
  ...(notes ? { notes } : {}),
  provenance: 'manual',
  last_verified: VERIFIED,
});

// --- Verified data per client id ---------------------------------------------
const VSC = 'https://code.visualstudio.com/api/extension-guides/ai/mcp';
const CC = 'https://code.claude.com/docs/en/mcp';
const CUR = 'https://cursor.com/docs/mcp';
const CGPT = 'https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt';
const GOOSE = 'https://block.github.io/goose/docs/getting-started/using-extensions/';
const CLAUDE_LOCAL = 'https://modelcontextprotocol.io/docs/develop/connect-local-servers';
const CLAUDE_REMOTE = 'https://modelcontextprotocol.io/docs/develop/connect-remote-servers';

const DATA: Record<string, Record<string, Cell>> = {
  'visual-studio-code': {
    'transport.stdio': c('yes', VSC, 'Docs list Local stdio as a supported transport.'),
    'transport.streamable_http': c('yes', VSC, 'Docs list Streamable HTTP (http) transport.'),
    'transport.sse': c('yes', VSC, 'Docs list SSE as legacy-supported transport.'),
    'tools.call': c('yes', VSC, 'MCP tools supported in agent mode, invoked as needed.'),
    'tools.list': c('yes', VSC, 'Users enable/configure tools with the tools picker.'),
    'tools.listChanged': c('yes', VSC, 'Supports dynamic tool discovery at runtime.'),
    'tools.annotations': c('yes', VSC, 'Supports tool annotations (title, readOnlyHint).'),
    'resources.read': c('yes', VSC, 'Resources can be browsed/attached as chat context.'),
    'resources.templates': c('yes', VSC, 'Supports resource templates with input parameters.'),
    'resources.subscribe': c('yes', VSC, 'Supports resource updates in real-time.'),
    'prompts.get': c('yes', VSC, 'Prompts invocable as slash commands in chat.'),
    'prompts.arguments': c('yes', VSC, 'Prompt input arguments collected via a dialog.'),
    'sampling.createMessage': c('yes', VSC, "Servers can make LM requests using the user's models."),
    'roots.list': c('yes', VSC, "Provides the server with the user's workspace root folder(s)."),
    'elicitation.create': c('yes', VSC, 'Elicitation: request input from the user.'),
    'auth.oauth': c('yes', VSC, 'Authorization via OAuth 2.1 (and 2.0) standards.'),
    // 2025-11-25 features (VS Code 1.107 release notes).
    'elicitation.url': c(
      'yes',
      'https://code.visualstudio.com/updates/v1_107',
      'v1.107 supports MCP 2025-11-25 incl. URL mode elicitation.',
    ),
    'auth.client_id_metadata': c(
      'yes',
      'https://code.visualstudio.com/updates/v1_107',
      'Supports the Client ID Metadata Document authentication flow.',
    ),
  },
  'claude-code': {
    'transport.stdio': c('yes', CC, 'Stdio servers run as local processes.'),
    'transport.streamable_http': c('yes', CC, 'type accepts streamable-http; HTTP is recommended.'),
    'transport.sse': c('partial', CC, 'SSE transport supported but deprecated.'),
    'tools.call': c('yes', CC, 'MCP servers give Claude Code access to tools.'),
    'tools.list': c('yes', CC, 'Runs tools/list capability discovery on connect.'),
    'tools.listChanged': c('yes', CC, 'Supports list_changed notifications for tools.'),
    'prompts.get': c('yes', CC, 'MCP prompts become commands in Claude Code.'),
    'prompts.list': c('yes', CC, 'Runs prompts/list capability discovery on connect.'),
    'prompts.listChanged': c('yes', CC, 'Supports list_changed notifications for prompts.'),
    'resources.list': c('yes', CC, 'Runs resources/list capability discovery on connect.'),
    'resources.listChanged': c('yes', CC, 'Supports list_changed notifications for resources.'),
    'roots.list': c('yes', CC, 'Server can call roots/list; returns launch directory.'),
    'auth.oauth': c('yes', CC, 'Authenticate with remote servers requiring OAuth 2.0.'),
    // 2025-11-25 features (Claude Code MCP docs).
    'elicitation.url': c(
      'yes',
      CC,
      'URL mode: opens a browser URL for authentication or approval.',
    ),
    'auth.client_id_metadata': c(
      'yes',
      CC,
      'Supports servers using a Client ID Metadata Document (CIMD); auto-discovered.',
    ),
  },
  'cursor-vscode': {
    'transport.stdio': c('yes', CUR, 'Supports stdio (local) transport.'),
    'transport.sse': c('yes', CUR, 'Supports SSE (local/remote) transport.'),
    'transport.streamable_http': c('yes', CUR, 'Supports Streamable HTTP (local/remote) transport.'),
    'tools.call': c('yes', CUR, 'Tools: Supported (functions for the model to execute).'),
    'tools.list': c('yes', CUR, 'Tools listed as Supported in protocol support table.'),
    'prompts.get': c('yes', CUR, 'Prompts: Supported (templated messages/workflows).'),
    'resources.read': c('yes', CUR, 'Resources: Supported (structured data sources).'),
    'roots.list': c('yes', CUR, 'Roots: Supported (URI/filesystem boundary inquiries).'),
    'elicitation.create': c('yes', CUR, 'Elicitation: Supported (server-initiated user requests).'),
    'auth.oauth': c('yes', CUR, 'OAuth used to authenticate remote (SSE/HTTP) servers.'),
  },
  'chatgpt': {
    'transport.stdio': c('no', CGPT, 'Cannot connect to a local MCP server directly.'),
    'transport.streamable_http': c('yes', CGPT, 'ChatGPT connects to remote MCP servers.'),
    'tools.list': c('yes', CGPT, 'Scan Tools discovers the server\u2019s tools.'),
    'tools.call': c('yes', CGPT, 'Use tools exposed by the app, including write actions.'),
    'auth.oauth': c('yes', CGPT, 'Supports OAuth/OpenID Connect for server authentication.'),
  },
  'goose': {
    'transport.stdio': c('yes', GOOSE, 'Command-Line Extension runs a local command/script.'),
    'transport.streamable_http': c('yes', GOOSE, 'Remote Extension connects via Streamable HTTP.'),
    'tools.list': c('yes', GOOSE, 'Extensions expose functionality through tools.'),
    'tools.call': c('yes', GOOSE, 'Goose runs the JSON-formatted tool call and gathers results.'),
    'roots.list': c('yes', GOOSE, 'Supports MCP Roots (session working directory).'),
    'auth.oauth': c('yes', 'https://goose-docs.ai/docs/mcp/square-mcp/', 'Connects to remote servers that use OAuth (e.g. Square).'),
  },
  'claude-ai': {
    // Claude Desktop / Claude.ai — the MCP docs use Claude as the concrete
    // example client; only cells the docs explicitly demonstrate are recorded.
    'transport.stdio': c('yes', CLAUDE_LOCAL, 'Claude Desktop runs local servers via command/args config.'),
    'tools.call': c('yes', CLAUDE_LOCAL, 'Each server exposes tools Claude can use, with approval.'),
    'resources.read': c('yes', CLAUDE_REMOTE, "Connected server's resources become available in conversations."),
    'prompts.get': c('yes', CLAUDE_REMOTE, 'Connected server\u2019s prompts become available in conversations.'),
    'auth.oauth': c('yes', CLAUDE_REMOTE, 'Custom Connectors authenticate to remote servers (commonly OAuth).'),
  },
};

const dir = path.join(process.cwd(), 'data/clients');
let filesTouched = 0;
let cellsWritten = 0;
for (const [id, cells] of Object.entries(DATA)) {
  const file = path.join(dir, `${id}.yaml`);
  if (!fs.existsSync(file)) {
    console.warn(`WARN: no file for ${id} (${file})`);
    continue;
  }
  const raw = fs.readFileSync(file, 'utf8');
  const headerMatch = raw.match(/^(#[^\n]*\n)+/);
  const doc = YAML.parse(raw) as Record<string, unknown>;
  const support = (doc.support as Record<string, unknown>) ?? {};
  for (const [fid, cell] of Object.entries(cells)) {
    support[fid] = cell;
    cellsWritten++;
  }
  doc.support = support;
  // Manual data supersedes the seed header note; drop it so the file reads as curated.
  const header = headerMatch && !DATA[id] ? headerMatch[0] : '';
  fs.writeFileSync(file, header + YAML.stringify(doc), 'utf8');
  filesTouched++;
}
console.log(`Enriched ${filesTouched} client files with ${cellsWritten} verified manual cells.`);
