# Deploy runbook — canimcp.dev

This project is built and verified locally. Going live requires three
user-gated steps (guardrails). Do them in order.

## 1. Create the public repo (Blues org) + push

`gh` account `bsatrom` is confirmed **admin** on the `blues` org.

```bash
cd /Users/satch/Development/blues/canimcp
gh repo create blues/canimcp --public \
  --description "caniuse-style MCP client compatibility matrix"
git remote add origin git@github.com:blues/canimcp.git
git push -u origin main
```

Verify: `git status` → "up to date with 'origin/main'".

## 2. Enable GitHub Pages (Source: GitHub Actions)

```bash
# In repo Settings → Pages → Build and deployment → Source: "GitHub Actions"
gh api -X POST repos/blues/canimcp/pages \
  -f build_type=workflow 2>/dev/null || \
  echo "Enable via Settings → Pages UI if the API call 404s."
```

The `.github/workflows/deploy.yml` (withastro/action → deploy-pages) runs on
push to `main` and publishes `dist/` (which includes `public/CNAME`).

## 3. DNS for canimcp.dev (you set these)

For an **apex** domain on GitHub Pages, create four A records + four AAAA
records pointing at GitHub's Pages IPs, and one CNAME for `www`:

**A (apex `canimcp.dev`):**
```
185.199.108.153
185.199.109.153
185.199.110.153
185.199.111.153
```

**AAAA (apex `canimcp.dev`):**
```
2606:50c0:8000::153
2606:50c0:8001::153
2606:50c0:8002::153
2606:50c0:8003::153
```

**CNAME (`www.canimcp.dev`):**
```
blues.github.io.
```

Then in repo Settings → Pages: set Custom domain = `canimcp.dev`, wait for the
DNS check to pass, and tick **Enforce HTTPS**. `public/CNAME` already pins the
custom domain across deploys.

Verify once propagated:
```bash
dig +short canimcp.dev
curl -sI https://canimcp.dev | head -1   # expect HTTP/2 200
```

## 4. Footer logo (guardrail)

The footer references `/blues-logo.svg` (light) and `/blues-logo-light.svg`
(dark). Both `<img>` tags `onerror`-remove themselves, so the text wordmark
"Built by Blues" always renders. Drop the correct, trademark-compliant SVGs
from the Blues brand-resources Dropbox into `public/` to show the logomark:
- `public/blues-logo.svg` — dark logomark (for light background)
- `public/blues-logo-light.svg` — light logomark (for dark mode)

## 5. Announce (Phase 5.5)

Comment on SEP-1814 announcing canimcp.dev as the Blues-maintained community
implementation; coordinate schema with registry#718.
