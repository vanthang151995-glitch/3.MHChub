# Safety TSX Migration Plan

Source reference: `New/Content-Safety-Hub (2).zip` -> `Content-Safety-Hub/artifacts/mhc-6s`.

## Objective

Keep the current MHChub app shell, top navigation, sidebar, login flow, and Home overview page. Move the Safety - 6S TSX pages from the new source into the existing MHChub routing model so the new dashboard becomes the `/safety-6s` Safety page, not the global Home page.

## Keep From Current MHChub

| Current asset | Decision |
| --- | --- |
| `src/app/AppShell.tsx` | Keep as the only global topnav/sidebar shell. |
| `src/pages/HomePage.tsx` | Keep as `/` overview page. No redesign. |
| `src/auth/AuthContext.tsx` | Keep cookie session and role model. |
| `src/services/api.ts` | Keep existing API service for non-Safety features. |
| `/documents`, `/admin`, `/operations` | Keep current routes and guards. |

## Do Not Copy From New Source

| New source item | Reason |
| --- | --- |
| `src/components/Sidebar.tsx` | Would replace/duplicate MHChub global sidebar. |
| `src/components/Topbar.tsx` | Would replace/duplicate MHChub global topnav. |
| `src/pages/Login.tsx` | MHChub already has cookie login and role guards. |
| Google Font import in `src/index.css` | Current app owns font/CSP/network behavior. |
| `.git`, `.replit-artifact`, build metadata | Not part of MHChub source. |

## Route Mapping

| New TSX page | MHChub route | Notes |
| --- | --- | --- |
| `Dashboard.tsx` | `/safety-6s` | Becomes the Safety - 6S landing page inside current AppShell. |
| `Warnings.tsx` | `/safety-6s/warnings` | Uses `/api/warnings`. |
| `Incidents.tsx` | `/safety-6s/incidents` | Uses `/api/incidents`. |
| `Checklist.tsx` | `/safety-6s/checklist` | Uses `/api/checklists`. |
| `KPI.tsx` | `/safety-6s/kpi` | Uses `/api/kpi-entries`. |
| `DataEntry.tsx` | `/safety-6s/data-entry` | KPI submission flow. |
| `Approval.tsx` | `/safety-6s/approval` | L1/L2 review flow. |
| `Documents.tsx` | `/safety-6s/documents` | Reuse MHChub document library v1. |
| `Reports.tsx` | `/safety-6s/reports` | Uses `/api/reports`. |
| `Training.tsx` | `/safety-6s/training` | Uses `/api/training-courses`. |
| `Settings.tsx` | `/safety-6s/settings` | Safety profile/settings only. |

## Implementation Sequence

1. Convert MHChub entry/router shell files to TSX, then remove the temporary `allowJs` bridge once legacy JSX is gone.
2. Add Tailwind v4 through Vite while avoiding Tailwind preflight so legacy MHChub CSS remains stable.
3. Add `SafetyOperationsModule.tsx` under `src/pages/safety/` and mount it at `/safety-6s/*`.
4. Rebuild the new-source dashboard inside `/safety-6s`: KPI cards, 6S rings, warning/activity lists, trend charts, department ranking, incident charts.
5. Add backend MySQL Safety Operations schema/store/API endpoints under the existing Express app.
6. Keep role boundaries: `viewer` submit/read department data, `leader` department review, `ehs/admin` full Safety review/admin.
7. Verify with `npm run typecheck`, `npm run build`, API smoke tests, and browser checks after login.

## Current Status

- TSX + Tailwind v4 config is in place.
- Frontend TS migration is locked: `tsconfig.json` keeps `allowJs: false` and `noImplicitAny: true`, while `npm run audit:frontend-js-migration` blocks JS files in `src`, TypeScript suppressions, explicit `any`, and disabled migration guards.
- Current topnav/sidebar and Home overview remain the global shell.
- `/safety-6s/*` routes are mounted inside the current shell.
- Dashboard has been migrated toward the new TSX source structure with KPI cards, 6S rings, charts, ranking, warnings, and recent activity.
- Backend Safety Operations migration/store/API is present.

## Remaining Verification

Restart the production/service API on port `3333` when ready. A parallel test server can run on a separate port to avoid touching the NSSM-managed service. Keep `npm run typecheck`, `npm run audit:frontend-js-migration`, `npm run audit:no-runtime-jsx`, `npm run build`, and `npm run verify` green after route or migration changes.
