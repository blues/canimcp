<!-- Thanks for contributing to canimcp! -->

## What does this PR do?

<!-- Brief description. If it changes client capability data, say which clients/features. -->

## Type of change

- [ ] Client capability data (add/update a `data/clients/*.yaml`)
- [ ] Feature taxonomy change (`data/features.yaml`)
- [ ] Site / UI
- [ ] Tooling / CI / ingestion
- [ ] Docs

## Data-change checklist (if this touches `data/`)

- [ ] Every non-`unknown` cell has a real `source` URL.
- [ ] `provenance` is set correctly (`manual` / `conformance` / `apify` / `submission`).
- [ ] `last_verified` reflects when the claim was checked.
- [ ] `status` is one of `yes` / `partial` / `no` / `unknown`.
- [ ] Feature ids exist in `data/features.yaml`.

## Verification

- [ ] `npm test` passes.
- [ ] `npx tsx scripts/build-data.ts` succeeds (data validates + matrix builds).

<!-- CI runs the above on every PR and will block on validation errors. -->
