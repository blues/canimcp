# Conformance-report ingestion contract (SEP-1627, interim)

This document specifies the **interim** contract between an MCP conformance test
run and canimcp's canonical data. It is implemented by
[`scripts/ingest-conformance.ts`](../scripts/ingest-conformance.ts) and validated
by [`schema/conformance-report.schema.json`](../schema/conformance-report.schema.json).

> **Status: interim.** [SEP-1627](https://github.com/modelcontextprotocol/modelcontextprotocol/issues)
> defines a conformance test suite intended as canimcp's primary long-term data
> source, but its concrete output format is **not yet stable**. Rather than block
> on it, we define our own small interim report shape here and adapt to it with a
> thin mapping layer. When SEP-1627's format lands, only the mapping in
> `scripts/ingest-conformance.ts` (and this schema) needs to change — the merge
> policy and downstream YAML stay the same.

## 1. Input shape

A conformance report is a single JSON object:

```jsonc
{
  "run_url": "https://github.com/blues/canimcp/actions/runs/1234567890", // optional
  "run_date": "2026-06-28",           // required, YYYY-MM-DD (date the run executed)
  "spec_version": "2025-06-18",       // required, MCP spec version tested against
  "results": [
    {
      "clientInfo_name": "cursor-vscode", // required; params.clientInfo.name of the client under test
      "version": "0.47",                   // optional; client version string
      "features": [
        { "feature_id": "tools.call",        "outcome": "pass" },
        { "feature_id": "tools.listChanged", "outcome": "fail" },
        { "feature_id": "resources.subscribe","outcome": "skip" },
        { "feature_id": "sampling.createMessage", "outcome": "fail",
          "notes": "createMessage handler not implemented as of this run." }
      ]
    }
  ]
}
```

- `feature_id` **must** be a canimcp feature id declared in
  [`data/features.yaml`](../data/features.yaml) (e.g. `tools.call`,
  `resources.subscribe`, `elicitation.create`). Unknown ids cause the ingester to
  fail loudly.
- `outcome` is one of `pass` | `fail` | `skip`.
- The full JSON Schema is `schema/conformance-report.schema.json` (draft-07).
  The ingester validates every report against it before applying anything.

## 2. Outcome → support-status mapping

| Conformance `outcome` | canimcp cell `status` | Effect |
| --------------------- | --------------------- | ------ |
| `pass`                | `yes`                 | Write/overwrite a cell (subject to merge policy). |
| `fail`                | `no`                  | Write/overwrite a cell (subject to merge policy). |
| `skip`                | *(none)*              | **Leave the existing cell untouched.** No cell is created; an absent cell stays absent (`unknown` at build time). |

Each cell produced by conformance carries:

- `provenance: conformance`
- `last_verified: <report.run_date>`
- `version_tested: <result.version>` (when present)
- `source: <report.run_url>` (when present)
- `notes: <feature.notes>` (when present)

## 3. Merge policy

canimcp mixes machine-sourced data (`apify`, `conformance`) with human-curated
data (`manual`, `submission`). Conformance is authoritative for machine data but
**must never silently clobber a human's judgment**. On each `(client, feature)`:

| Existing cell provenance            | Action for a `pass`/`fail` outcome |
| ----------------------------------- | ---------------------------------- |
| *absent* / `apify` / prior `conformance` | **Overwrite** with the new conformance cell. |
| `manual` / `submission`             | **Do not overwrite.** If the new value differs, record a **`[review needed]`** flag (client + feature + old→new) and print a warning. If it already agrees, do nothing. |

`skip` outcomes never overwrite and never flag — they simply leave the cell as-is.

> Note: the schema has no literal `provenance: unknown` value; "unknown" in the
> policy means a cell with **no** `provenance` set (a bare/unset cell).

The core is a **pure function** so it is unit-testable without disk IO:

```ts
applyConformanceReport(report, existingClients, taxonomy?)
  => { patches, reviewFlags, unmatched }
```

- `patches`: `{ [clientId]: ClientRecord }` — only clients that actually changed,
  deep-copied (inputs are never mutated).
- `reviewFlags`: conflicts against `manual`/`submission` cells — recorded, **not**
  applied. The CLI prints each as `[review needed] <client> / <feature>: old → new`.
- `unmatched`: report `clientInfo_name`s that matched no client record.

`main()` does the IO: read + schema-validate the report, load `data/clients/*.yaml`,
apply, **validate each patched record with `validateClient`** (fails loudly if the
result is invalid), then write the YAML back preserving all other fields.

## 4. Client matching

A report result is matched to a `data/clients/<id>.yaml` record by, in order:

1. exact match on the client's `clientInfo_name`,
2. exact match on the client's `id`,
3. match on `slugify(clientInfo_name)` (lowercase, non-`[a-z0-9._-]` → `-`).

Unmatched results are reported and skipped (never error the whole run).

## 5. Running the ingester

```bash
# Against a specific report:
npx tsx scripts/ingest-conformance.ts path/to/report.json

# With no argument it defaults to the bundled sample fixture:
npx tsx scripts/ingest-conformance.ts
# => tests/fixtures/sample-conformance-report.json
```

After ingestion, run the build to re-validate everything and recompile the bundle:

```bash
npx tsx scripts/build-data.ts
```

## 6. Workflow wiring

[`.github/workflows/ingest-conformance.yml`](../.github/workflows/ingest-conformance.yml)
runs the pipeline and opens a validated auto-PR. It triggers on:

- **`schedule`** — nightly cron, to re-ingest the latest available report.
- **`workflow_dispatch`** — manual run (accepts an optional `report_path` input).
- **`repository_dispatch`** (event type `conformance-report`) — fired by an
  upstream SEP-1627 conformance run once real feeds exist; the report path/URL can
  be passed in `client_payload`.

Steps: `checkout` → `setup-node@v4` (Node 22, npm cache) → `npm ci` → run the
ingester against the report (defaults to the bundled sample) → `npx tsx
scripts/build-data.ts` (validate + build gate) → open a PR via
`peter-evans/create-pull-request@v6`, labeled **`data:conformance`**, on branch
`ingest/conformance-<run>`. Requires `permissions: contents: write` and
`pull-requests: write`. A human maintainer reviews and merges — conformance data
is proposed, never force-merged, and any `[review needed]` conflicts appear in the
job log for the reviewer to resolve by hand.

## 7. Getting a real feed (SEP-1627 coordination)

Until SEP-1627 emits a stable artifact, the workflow ingests the bundled sample so
the pipeline stays exercised. To wire a real feed, have the upstream conformance
run either (a) `repository_dispatch` this repo with the report location in
`client_payload`, or (b) publish an artifact the workflow fetches before the
ingest step. Only the fetch step and the report→feature-id mapping should need to
change; the schema, merge policy, and PR flow are stable.
