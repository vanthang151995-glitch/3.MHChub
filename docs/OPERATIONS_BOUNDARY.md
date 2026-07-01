# MHChub operations boundary

This document defines what MHChub owns operationally and what it does not own yet.

## Current owned service

MHChub is the internal web/API service for:

- Home dashboard and utility links.
- Safety - 6S pages and bulletins.
- Document library, upload, preview, and download.
- Admin configuration.
- Operations status, readiness, activity log, and runtime backup.

The production entrypoint is:

```powershell
node server/index.js
```

On Windows, the intended production manager is the `MHChub` service installed by:

```powershell
.\setup\home-install\install-mhchub-service-windows.ps1 -Start
```

## Current ports

- MHChub web/API: `3333` in the current company setup.
- MySQL for MHChub data/auth may use `3308` when configured.

Do not assume MHChub owns PLC/IoT ports such as `5000`, `5173`, `1881`, `1883`, or Redis `6379`. Those belong to other systems unless explicitly configured in this repo.

## What MHChub does not own yet

These are not configured in this workspace:

- Node-RED flow runtime.
- MQTT bridge.
- Redis runtime.
- PM2 cluster.
- Linux systemd unit.
- Cloudflare Tunnel public exposure.

The placeholder npm script `mqtt:bridge` intentionally fails with a clear message. It exists only to keep ops entrypoints predictable while preventing accidental fake MQTT operation.

## Safe operator commands

Inspect service and port:

```powershell
Get-Service MHChub
npm run ops:ports -- -ExpectListening -Json
```

Health check:

```powershell
npm run ops:health -- -BaseUrl http://127.0.0.1:3333 -CheckExcelPreview
```

Strict readiness after admin password/secret are set:

```powershell
npm run ops:health -- -BaseUrl http://127.0.0.1:3333 -StrictReady -CheckExcelPreview
```

Preview restart without touching the live service:

```powershell
.\scripts\restart-clean.ps1 -PreviewOnly
```

Start guard after Windows boot:

```powershell
.\scripts\startup-guard.ps1
```

Update admin password and web auth secret:

```powershell
npm run ops:secrets
```

Safety API runtime audit runbook:

```powershell
docs\SAFETY_API_RUNTIME_AUDIT_RUNBOOK.md
```

## Public exposure rule

Do not start Cloudflare Tunnel or any public reverse proxy until all are true:

- `npm run verify` passes.
- Strict readiness is green.
- `ALLOWED_ORIGINS` contains the public origin only where intended.
- `TRUST_PROXY=true` is set only behind a trusted proxy.
- Admin login and document download routes have been reviewed for the public hostname.

## Verification

Run:

```powershell
npm run audit:ops
npm run audit:current-source-api-runtime
npm run audit:live-api-runtime
npm run ops:preflight
npm run verify
```

`audit:ops` checks the entrypoint scripts, preview guards, shutdown confirmation, secret tooling dry-run support, package aliases, and this boundary document.
`audit:live-api-runtime` is read-only; if it reports `restartRecommended: true`, restart or reload the intended MHChub process and run the audit again before production use.
