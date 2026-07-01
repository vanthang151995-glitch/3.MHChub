# Safety API runtime audit runbook

This runbook separates two different checks:

- Current-source runtime: proves the code in this worktree can run the Safety API and JSON API contract.
- Live runtime drift: proves the process already listening on the intended URL has loaded the current server code.

Use environment variables for credentials. Do not write real passwords into docs, scripts, reports, or shell history snippets committed to the repo.

## 1. Prove current source

Run this from the repository root:

```powershell
$env:MHCHUB_AUDIT_USERNAME="<admin-user>"
$env:MHCHUB_AUDIT_PASSWORD="<admin-password>"
npm run audit:current-source-api-runtime
```

Expected result:

- `ok: true`
- child `audit:api-json-contract` passes `6/6`
- child `audit:safety-api` passes `23/23`
- temporary audit port is cleaned up

This command starts a temporary `node server/index.js` process on a free port, probes it, writes `qa/reports/current-source-api-runtime-audit.json`, and stops only that temporary process.

## 2. Prove live runtime

For the company service port, set the live base URL explicitly:

```powershell
$env:MHCHUB_LIVE_BASE_URL="http://127.0.0.1:3333"
$env:MHCHUB_AUDIT_USERNAME="<admin-user>"
$env:MHCHUB_AUDIT_PASSWORD="<admin-password>"
npm run audit:live-api-runtime
```

For a local preview process on port `4174`, use:

```powershell
$env:MHCHUB_LIVE_BASE_URL="http://localhost:4174"
$env:MHCHUB_AUDIT_USERNAME="<admin-user>"
$env:MHCHUB_AUDIT_PASSWORD="<admin-password>"
npm run audit:live-api-runtime
```

Expected healthy result:

- `ok: true`
- `restartRecommended: false`
- unknown `/api/*` returns JSON `404`
- `/api/safety/programs`, each special program, and `/api/safety/document-architecture` return JSON payloads

Expected stale result:

- `ok: false`
- `restartRecommended: true`
- stale signals include unknown `/api/*` returning HTML or Safety program endpoints returning HTML

## 3. Recovery after stale live runtime

When live runtime drift is detected:

1. Restart or reload the intended live MHChub process so it loads the current `server/index.js`.
2. Run `npm run audit:live-api-runtime` again against the same `MHCHUB_LIVE_BASE_URL`.
3. Run `npm run ops:preflight`.
4. For Safety UI smoke, run `npm run audit:safety-interactions` against the same host after login credentials are set.

Do not treat a passing browser smoke as proof that the API process is current. The Safety pages have controlled fallbacks, so the UI can remain usable while live API drift still exists.

## 4. Report paths

- Current source: `qa/reports/current-source-api-runtime-audit.json`
- Live runtime drift: `qa/reports/live-api-runtime-drift-audit.json`
- API JSON contract: `qa/reports/api-json-contract-audit.json`
- Safety API endpoints: `qa/reports/safety-api-endpoints-audit.json`
- Production preflight: `qa/reports/production-preflight-summary.json`

`npm run ops:preflight` reads the live runtime drift report and blocks production readiness when `restartRecommended` is true.
