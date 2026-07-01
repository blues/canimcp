# canimcp — MCP Client Compatibility Matrix

A [caniuse.com](https://caniuse.com)-style compatibility matrix showing **which
MCP features each MCP client supports** — with per-sub-feature granularity,
sourced and dated evidence per cell, a 4-state support model, and a
feature-centric "which clients support X?" view.

🔗 **[canimcp.dev](https://canimcp.dev)** · Built and maintained by
**[Blues](https://blues.com)**.

## Why this exists

[SEP-1814](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1814)
proposes a client compatibility matrix for MCP. It is open, unsponsored, and
explicitly invites a community implementation — Blues is picking it up as the
maintained home.

The official [`modelcontextprotocol.io/clients`](https://modelcontextprotocol.io)
table is coarse and hard to maintain; [`apify/mcp-client-capabilities`](https://github.com/apify/mcp-client-capabilities)
is machine data for servers, not a presentation layer. **The gap canimcp fills**
is the rich presentation layer:

- **Per-sub-feature granularity** — not just "tools: yes" but `tools.listChanged`,
  `tools.annotations`, `resources.subscribe`, transports, and more.
- **Sourced + dated evidence** — every non-`unknown` cell carries a `source`,
  `last_verified` date, and `provenance` (`manual` / `conformance` / `apify` /
  `submission`).
- **4-state support** — `yes` / `partial` / `no` / `unknown` (aligned with
  [registry#718](https://github.com/modelcontextprotocol/registry/issues/718)).
- **Feature-centric view** — a page per feature listing every client's status.

## Relationship to the MCP ecosystem

| Project | Relationship |
| --- | --- |
| [SEP-1814](https://github.com/modelcontextprotocol/modelcontextprotocol/issues/1814) | The proposal canimcp implements. |
| [registry#718](https://github.com/modelcontextprotocol/registry/issues/718) | We align our schema (transports, 4-state support) for future interop. |
| [SEP-1627](https://github.com/modelcontextprotocol/modelcontextprotocol) | Conformance test suite — our long-term accuracy engine (see the ingester). |
| [apify/mcp-client-capabilities](https://github.com/apify/mcp-client-capabilities) | Apache-2.0 seed dataset (attributed; see `NOTICE`). |

## How the data works

- **Source of truth:** per-client YAML in [`data/clients/`](data/clients) +
  the feature taxonomy in [`data/features.yaml`](data/features.yaml).
- **Validation:** every client file is checked against
  [`schema/client.schema.json`](schema/client.schema.json) plus a taxonomy
  cross-check. **CI fails the PR on any violation** — this keeps community data
  clean.
- **Build:** [`scripts/build-data.ts`](scripts/build-data.ts) compiles
  everything into a single denormalized bundle (`public/data/matrix.json`) with
  every (client × feature) cell explicitly filled.
- **Two ingestion paths** open validated auto-PRs:
  - **Conformance ingester** (SEP-1627) — see [`docs/conformance-format.md`](docs/conformance-format.md).
  - **Community submission bot** — file a
    [support report](../../issues/new?template=client-support-report.yml) and a
    bot opens a validated PR.

## Data provenance & licensing

- **Code:** [MIT](LICENSE).
- **Data:** [CC-BY 4.0](LICENSE-data).
- Seed data imported from `apify/mcp-client-capabilities` (Apache-2.0) — see
  [`NOTICE`](NOTICE). Apify-derived cells are marked `provenance: apify`; the
  mapping is conservative and gaps are left `unknown`.

## Tech stack

Astro (static output) + Preact islands + Tailwind + TypeScript. Data validation
via `ajv` + JSON Schema, tests via `vitest`. Hosted on GitHub Pages at
`canimcp.dev`. Ingestion + submission run as GitHub Actions.

## Local development

```bash
npm install
npm run build:data   # compile data/ -> public/data/matrix.json
npm test             # vitest: taxonomy, validation, build, ingester, submission
npm run dev          # dev server (runs build:data via prebuild on `npm run build`)
npm run build        # prebuild data + static build to dist/
```

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). The easiest path is the
[client support report](../../issues/new?template=client-support-report.yml)
issue form — the submission bot turns it into a validated PR. Every non-`unknown`
cell must carry a real `source`.
