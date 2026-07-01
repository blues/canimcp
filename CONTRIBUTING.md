# Contributing to canimcp

Thanks for helping build the caniuse-style compatibility matrix for MCP
clients! The data is the product, so almost all contributions are edits to the
per-client capability records.

There are **two ways** to contribute a support state. Pick whichever fits:

1. **The easy path — submit an issue form.** A bot turns it into a validated
   pull request for you. Best for a single feature/client report, and the only
   practical path for UI-only clients you can't test programmatically (attach a
   screen recording as your source).
2. **By hand — edit the client YAML directly.** Best for bulk edits, new
   clients with many features, or if you're comfortable with a PR.

Either way, the same rules apply: **every non-`unknown` cell needs a real
source, and CI must pass before a maintainer merges.**

---

## Data model in 30 seconds

- Feature taxonomy lives in [`data/features.yaml`](data/features.yaml) — the
  canonical list of feature ids (e.g. `tools.call`, `resources.subscribe`,
  `transport.streamable_http`). You may only report against ids that exist
  there.
- One file per client in `data/clients/<id>.yaml`. Each entry under `support`
  is a **cell** keyed by a feature id.

A cell looks like this:

```yaml
resources.subscribe:
  status: partial            # yes | partial | no | unknown
  notes: "Reads resources but does not honor subscribe notifications."
  source: https://example.com/evidence   # required unless status is `unknown`
  last_verified: "2026-06-15"            # YYYY-MM-DD
  version_tested: "0.45"
  provenance: submission     # manual | conformance | apify | submission
```

### Support states

| Status    | Meaning                                             |
| --------- | --------------------------------------------------- |
| `yes`     | Fully supported.                                    |
| `partial` | Partially supported — explain the caveat in `notes`. |
| `no`      | Explicitly not supported.                           |
| `unknown` | Not yet verified (the default for unlisted cells).  |

### Provenance

Where the claim came from: `manual` (hand-curated), `conformance` (SEP-1627
conformance run), `apify` (seed import from `apify/mcp-client-capabilities`),
or `submission` (this community flow). The bot always writes `submission`.

### The sourcing requirement

**Every `yes` / `partial` / `no` cell must carry a real `source`.** This is the
single rule that keeps the matrix trustworthy and is enforced both by the
submission parser and by review. Acceptable sources:

- Official client docs or changelog entries.
- A commit/PR/issue demonstrating the behaviour.
- **A screen recording** (e.g. a Loom / YouTube / asciinema link) for clients
  that only expose the feature through a GUI and can't be exercised by the
  conformance suite. This is the intended path for hard-to-test, UI-only
  clients.

`unknown` cells don't need a source (there's nothing to back up).

---

## Path 1 — Submit via the issue form (recommended)

1. Open a new issue and choose **"Client support report."**
2. Fill in the fields — they map 1:1 to a YAML cell:
   - **Client ID** — the stable slug. Reuse an existing id from
     `data/clients/` so your report merges into that client; otherwise a new
     file is created.
   - **Client name**, **Client URL**.
   - **Feature IDs** — one or more ids from `data/features.yaml` (comma- or
     newline-separated). Every listed feature gets the status + source below.
   - **Support status** — `yes` / `partial` / `no` / `unknown`.
   - **Notes** (optional), **Source URL** (required unless status is
     `unknown`; screen-recording links welcome), **Version tested** (optional).
3. Submit. The issue is auto-labeled `submission`, which triggers the
   [submission bot](.github/workflows/submission-bot.yml). The bot:
   - parses the issue body
     ([`scripts/submission-to-patch.ts`](scripts/submission-to-patch.ts)),
   - validates every feature id and status against the taxonomy + schema,
   - merges the patch into `data/clients/<id>.yaml`,
   - runs the full data build (`scripts/build-data.ts`) as a gate,
   - opens a pull request on branch `submission/issue-<number>` that closes
     your issue, and
   - comments back on the issue with the PR link — or, on failure, with the
     validation error so you can fix and retry (re-apply the `submission`
     label or comment `/submit`).
4. A maintainer reviews the PR and merges. The human gate is deliberate: it
   keeps data quality high and filters spam.

**Common rejection reasons:** an unknown feature id, an invalid status, a
missing required field, or a missing `Source URL` on a non-`unknown` report.

---

## Path 2 — Edit a client YAML by hand

1. Fork the repo and create a branch.
2. Edit or create `data/clients/<id>.yaml`. Only use feature ids that exist in
   `data/features.yaml`. Add/adjust cells following the shape above — remember
   the `source` for any non-`unknown` cell.
3. Validate locally before pushing:

   ```bash
   npm ci
   npx vitest run              # unit tests
   npx tsx scripts/build-data.ts   # validates every client + builds matrix.json
   ```

   The build **fails** on any unknown feature id, invalid status, bad date, or
   non-URI source. That failing build is the CI gate — a red build won't be
   merged.
4. Open a pull request. CI re-runs the same checks; a maintainer reviews and
   merges.

### Adding a brand-new client

Create `data/clients/<id>.yaml` with at least the required top-level fields
(`id`, `title`, `url`) and any support cells you can source. Unlisted features
default to `unknown` at build time, so you only need to record what you can
back with evidence.

---

## How the matrix stays current

canimcp is kept fresh by three mechanisms so it doesn't rot like a
hand-maintained table:

1. **Community submissions (client improvements).** The
   [issue form](../../issues/new?template=client-support-report.yml) → the
   submission bot opens a validated PR. This is the primary path for "client X
   now supports feature Y." A maintainer merges; the site redeploys on push.
2. **Conformance ingestion (accuracy).** `.github/workflows/ingest-conformance.yml`
   runs nightly (and on `repository_dispatch` from an upstream SEP-1627 run),
   ingests a conformance report, and opens a `data:conformance` PR. It overwrites
   `apify`/unknown/stale-conformance cells but never silently overwrites
   human-verified `manual`/`submission` cells (those are flagged for review).
   *Note:* until SEP-1627 emits a consumable report, this runs against the
   bundled sample — point it at the real feed via the `report_path` input or a
   dispatch payload (see `docs/conformance-format.md`).
3. **Spec-drift watch (spec changes).** `.github/workflows/spec-drift.yml` runs
   weekly, compares `data/features.yaml`'s `spec_version` against the MCP repo's
   published `schema/<date>/` revisions, and opens a `spec-drift` tracking issue
   when the spec has moved on. A maintainer then updates the taxonomy and
   re-verifies affected cells.

Everything routes through the same CI gate (schema + taxonomy validation), so no
update — automated or human — can land invalid data.

---

## Questions

Open an issue or start a discussion. This project is stewarded by
[Blues](https://blues.com) as the community home for the MCP client
compatibility matrix (see SEP-1814).
