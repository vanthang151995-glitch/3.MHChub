# Safety - 6S Pageization Deep Audit

Date: 2026-06-06

## Executive Summary

Safety - 6S has reached a routed, source-separated, page-level lazy-loaded state. The real data pagination contract is now implemented for Warnings, Incidents, KPI/Approval, Data Entry, Documents, Reports, and Training. The remaining work is no longer list pageization; it is deployment/cache hardening, broader all-route mobile smoke coverage, and future ownership refinement if Approval needs a workflow beyond KPI review.

- Route coverage: complete for the planned Safety child routes currently mounted under `/safety-6s/*`.
- Source separation: strong. Dashboard, Warnings, Incidents, Approval wrapper, CRUD pages, reference, settings, and route frame/nav now have separated TSX ownership. `SafetyOperationsModule.tsx` is now a thin lazy route registry.
- Bundle pageization: done for Safety child routes. Heavy child pages are lazy-loaded and emitted as separate Vite chunks.
- Data pagination: complete for the Safety list pages in scope. `/api/warnings`, `/api/incidents`, `/api/kpi-entries`, `/api/reports`, and `/api/training-courses` support opt-in paged responses with `items` and `pagination` metadata while preserving array responses for legacy consumers. `/api/documents` already uses paged document-library responses and now supports Safety document type filtering. Checklist remains a documented bounded dataset by department/period item count.
- Verification: improved. A root `tsconfig.json` is active with `allowJs: false` and `noImplicitAny: true`; `npm run typecheck`, `npm run audit:frontend-js-migration`, `npm run audit:no-runtime-jsx`, `npm run build`, and the full `npm run verify` gate pass after Dashboard extraction, page-level lazy loading, pagination work, and JSX-to-TSX migration hardening.

## Evidence

Primary plan:

- `docs/SAFETY_TSX_MIGRATION_PLAN.md` defines the target route map for Dashboard, Warnings, Incidents, Checklist, KPI, DataEntry, Approval, Documents, Reports, Training, and Settings.

Route mounting:

- `src/App.tsx` mounts `/safety-6s/*` through `SafetyOperationsModule`.
- `src/App.tsx` separately mounts `/safety-6s/departments/:id` to `DepartmentPage`.

Current Safety module:

- `src/pages/safety/SafetyOperationsModule.tsx` now contains only:
  - lazy child-route imports
  - `ShellProps`
  - `SafetyRouteFallback`
  - the `/safety-6s/*` `Routes` registry
- `src/pages/safety/SafetyDashboardPage.tsx` now owns the dashboard data queries, charts, hot warning panel, recent activity panel, ranking widgets, and dashboard helper functions.
- `src/pages/safety/SafetyFrame.tsx` now owns `safetyNav`, `SafetySecondaryNav`, and `SafetyFrame`.
- `src/pages/safety/SafetyWarningsPage.tsx` now owns the Warnings page flow, including submit form, filters, risk matrix, review actions, and reject modal wiring.
- `src/pages/safety/SafetyIncidentsPage.tsx` now owns the Incidents page flow, including submit form, filters, 5M/root-cause fields, review actions, and reject modal wiring.
- `src/pages/safety/SafetyWarningsIncidentsShared.tsx` owns shared Warning/Incident constants, form defaults, risk UI helpers, review actions, and reject modal UI.
- `src/pages/safety/SafetyWarningsIncidentsPage.tsx` is now only a 2-line compatibility barrel that re-exports the split pages.
- `src/pages/safety/SafetyApprovalPage.tsx` now documents the approval route artifact and intentionally wraps `SafetyKpiPage approvalOnly`.
- The unused `Legacy*` pages and generic `EntityListPage` have been removed from `SafetyOperationsModule.tsx`.
- `vite.config.ts` now groups shared Safety helper modules into `SafetyCore-*` so page-level lazy chunks pass the existing dist asset audit without duplicate `safety-*` chunk groups.

Backend:

- `server/index.js` exposes Safety APIs for warnings, incidents, KPI entries, checklists, reports, training courses, notifications, profile, and activity feed.
- `server/core/mysqlSafetyOperationsStore.js` uses `listRows(...)` with a capped `LIMIT` for legacy array consumers and now returns `{ items, pagination }` when callers pass `paged`, `page`, or `pageSize`.
- Warnings support server-side `status` and `riskLevel` filters in paged mode.
- Incidents support server-side `statusOrApproval` filtering in paged mode.
- Reports and Training inherit the same opt-in `items/pagination` contract from `listRows(...)`.
- KPI supports opt-in pagination plus `entryType`, `approvalStatus`, `period`, `search`, `excludeApprovalStatus`, and `sortMode` query controls for the KPI and Approval routes.
- Reports support server-side `type` filtering in paged mode.
- Data Entry reuses the paged KPI API with server-side `entryType` and `approvalStatus` filters.
- Documents use the paged document-library API with Safety `category`, `q`, `departmentId`, and `fileType` filters across MySQL and JSON fallback stores.

Build evidence:

- A temporary Vite build to `output/safety-page-audit-build` passed before cleanup.
- `npm run typecheck` passes with the root `tsconfig.json`.
- `npm run build` passes after extracting the Safety frame/nav, removing legacy page code, moving Warnings/Incidents into their own source file, extracting Dashboard, adding lazy child routes, and adding pagination to Warnings/Incidents/KPI/Data Entry/Documents/Reports/Training.
- `SafetyOperationsModule.tsx` is about 3.4 KB / 77 lines.
- `SafetyDashboardPage.tsx` is about 73.8 KB / 1607 lines.
- `SafetyWarningsPage.tsx` is about 25.3 KB / 520 lines before pagination and now owns its paged query/filter state directly.
- `SafetyIncidentsPage.tsx` is about 19.6 KB / 376 lines before pagination and now owns its paged query/filter state directly.
- `SafetyReportsPage.tsx` now owns paged table query state and keeps report stats on a bounded summary query.
- `SafetyTrainingPage.tsx` now owns paged table query state and keeps training stats on a bounded summary query.
- `SafetyKpiPage.tsx` now owns paged table query state for both KPI and Approval while keeping KPI summary cards on a bounded summary query.
- `SafetyDataEntryPage.tsx` now owns paged recent-entry query state and keeps submission stats on a bounded summary query.
- `SafetyDocumentsPage.tsx` now owns paged Safety document query state and pushes search, department, and file type filters to `/api/documents`.
- `SafetyWarningsIncidentsShared.tsx` is about 17.8 KB / 513 lines.
- `SafetyApprovalPage.tsx` is about 0.13 KB / 4 lines.
- `SafetyFrame.tsx` is about 4.4 KB / 102 lines.
- The generated Safety route shell chunk is about 6.68 KB. Heavy child pages now emit separately, including `SafetyDashboardPage` at about 44.76 KB, `SafetyWarningsPage` at about 18.59 KB, `SafetyIncidentsPage` at about 15.96 KB, `SafetyReportsPage` at about 14.93 KB, `SafetyTrainingPage` at about 9.65 KB, `SafetyKpiPage` at about 24.82 KB, `SafetyDataEntryPage` at about 10.05 KB, `SafetyDocumentsPage` at about 9.34 KB, `SafetyWarningsIncidentsShared` at about 9.93 KB, `SafetyApprovalPage` at about 0.28 KB, shared `SafetyCore` at about 84.01 KB, and `vendor-recharts` at about 405.79 KB.
- `vite.config.ts` now separates Recharts/D3 into `vendor-recharts`, keeping the Reports route page chunk small while preserving the charted report experience.
- `qa/reports/dist-asset-audit.json` reports `"ok": true` and duplicate chunk group count `0` after the lazy-load build.
- Browser smoke on the running local service `http://127.0.0.1:4174/safety-6s` redirects to `/login` when no session is present and reports no browser console errors.
- Authenticated desktop browser smoke passed for Dashboard, Warnings, Incidents, Checklist, KPI, Data Entry, Approval, Documents, Reports, Training, Reference, and Settings after the Warnings/Incidents split. Each route loaded its own Safety child chunk and added no new console errors.
- Authenticated desktop smoke verified the split chunks: `SafetyWarningsPage-*`, `SafetyIncidentsPage-*`, `SafetyWarningsIncidentsShared-*`, and `SafetyApprovalPage-*`.
- Authenticated mobile-width smoke at 390x844 passed for Dashboard, Warnings, Incidents, KPI, Reference, Settings, and a post-split focused pass on Warnings, Incidents, and Approval. The only detected horizontal overflow was the intentional scrollable secondary nav.
- Runtime API pagination smoke on a fresh local service at `http://127.0.0.1:4184` passed:
  - `/api/warnings?paged=true&page=1&pageSize=3` returned 3 items with `totalItems: 18` and `totalPages: 6`.
  - `/api/incidents?paged=true&page=1&pageSize=3` returned 3 items with `totalItems: 8` and `totalPages: 3`.
  - `/api/kpi-entries?paged=true&page=1&pageSize=3&sortMode=target_gap` returned 3 items with `totalItems: 36` and `totalPages: 12`.
  - `/api/kpi-entries?paged=true&page=1&pageSize=3&excludeApprovalStatus=approved` returned 0 items with `totalItems: 0` and `totalPages: 1`, matching the current all-approved seed data.
  - `/api/reports?paged=true&page=1&pageSize=2` returned 2 items with `totalItems: 4` and `totalPages: 2`.
  - `/api/reports?paged=true&page=1&pageSize=2&type=Inspection` returned 2 `Inspection` items with `totalItems: 2`.
  - `/api/training-courses?paged=true&page=1&pageSize=2` returned 2 items with `totalItems: 6` and `totalPages: 3`.
  - `/api/kpi-entries?paged=true&page=1&pageSize=2&entryType=safety_score_monthly` returned 2 items with `totalItems: 36` and `totalPages: 18`.
  - `/api/kpi-entries?paged=true&page=1&pageSize=2&approvalStatus=approved` returned 2 items with `totalItems: 36` and `totalPages: 18`.
  - `/api/documents?category=safety&page=1&pageSize=2` returned 1 item with `totalItems: 1` and `totalPages: 1`.
  - `/api/documents?category=safety&page=1&pageSize=2&fileType=pdf` returned the current `safety-handbook.pdf` item with `totalItems: 1` and `totalPages: 1`.
- Authenticated browser smoke on `http://127.0.0.1:4184` passed for Warnings and Incidents pagination:
  - Warnings rendered `Hiển thị 1-8 / 18`, advanced to `Hiển thị 9-16 / 18`, and showed `Trang 2/3`.
  - Incidents rendered `Hiển thị 1-8 / 8`; filtering `Đang xử lý` rendered 2 incident rows and `Hiển thị 1-2 / 2`.
  - Mobile width 390x844 rendered Warnings and Incidents pagination with no horizontal document overflow and no console errors from the test service.
- Authenticated browser smoke on `http://127.0.0.1:4184` passed for Reports and Training pagination:
  - Reports rendered 4 table rows, `Hiển thị 1-4 / 4`, and `Trang 1/1`.
  - Training rendered 6 table rows, `Hiển thị 1-6 / 6`, and `Trang 1/1`.
  - Mobile width 390x844 rendered Reports and Training pagination with no horizontal document overflow and no console errors from the test service.
- Authenticated browser smoke on `http://127.0.0.1:4184` passed for KPI and Approval pagination:
  - KPI rendered 10 rows with `Hiển thị 1-10 / 36`, advanced to `Hiển thị 11-20 / 36`, and showed `Trang 2/4`.
  - Approval rendered the valid empty queue state with `Hiển thị 0-0 / 0` and `Trang 1/1`.
  - Mobile width 390x844 rendered KPI, Approval, and Reports pagination with no horizontal document overflow and no console errors from the test service.
- Authenticated browser smoke on `http://127.0.0.1:4184` passed for Data Entry and Documents pagination:
  - Data Entry rendered 10 rows, showed `Hiển thị 1-10 / 36`, advanced to `Hiển thị 11-20 / 36`, and showed `Trang 2/4`.
  - Documents rendered the current Safety handbook item with `Hiển thị 1-1 / 1`; filtering by PDF preserved the same paged result.
  - Mobile width 390x844 rendered Data Entry and Documents with no horizontal document overflow and no console errors from the test service.

## Completion Matrix

| Area | Status | Notes |
| --- | --- | --- |
| `/safety-6s` overview route | Separated + lazy | Dashboard now lives in `SafetyDashboardPage.tsx` and lazy-loads as its own chunk. |
| `/safety-6s/warnings` | Separated + lazy + paged | Page flow now lives in `SafetyWarningsPage.tsx`, emits as its own chunk, and consumes paged Warnings API responses with server-side status/risk filters. |
| `/safety-6s/incidents` | Separated + lazy + paged | Page flow now lives in `SafetyIncidentsPage.tsx`, emits as its own chunk, and consumes paged Incidents API responses with server-side status/approval filtering. |
| `/safety-6s/checklist` | Separated | Own TSX file, but UI still uses generic 12-item checklist labels. |
| `/safety-6s/kpi` | Separated + lazy + paged | Own TSX file with server-backed filters, sorting, pagination, detail modal, and approval actions. |
| `/safety-6s/data-entry` | Separated + lazy + paged | Own TSX file for KPI submission flow with paged recent-entry table and server-side type/status filters. |
| `/safety-6s/approval` | Explicit wrapper + lazy + paged | `SafetyApprovalPage.tsx` intentionally wraps `SafetyKpiPage approvalOnly`, now backed by the paged KPI API and `excludeApprovalStatus=approved`. |
| `/safety-6s/documents` | Separated + lazy + paged | Reuses the document library API with paged Safety category queries and server-side search, department, and file type filters. |
| `/safety-6s/reports` | Separated + lazy + paged | Own CRUD page with paged report table and bounded summary stats. |
| `/safety-6s/training` | Separated + lazy + paged | Own CRUD page with paged training table and bounded summary stats. |
| `/safety-6s/reference` | Separated | Own reference page and nav item. |
| `/safety-6s/settings` | Separated | Own settings page. |
| Department drilldown | Separate route | Lives outside `/safety-6s/*` route tree in `App.tsx`. |
| TypeScript gate | Repaired | Root `tsconfig.json` exists and `npm run typecheck` passes. |
| Page-level lazy loading | Done | Safety child routes now lazy-load; route shell chunk is about 6.68 KB. |
| Browser smoke | Passed with note | Local service is reachable on `127.0.0.1:4174`; focused pagination smoke passed on `127.0.0.1:4184`; authenticated desktop and mobile checks for Warnings, Incidents, KPI, Approval, Data Entry, Documents, Reports, and Training added no new console errors from the test service. |
| Frontend TS migration guard | Locked | Active frontend source has no runtime JSX files; `vite.config.ts` is typed; `tsconfig.json` keeps `allowJs: false` and `noImplicitAny: true`; shared browser imports are covered by `.d.ts` declarations. |

## Risk Findings

1. `SafetyOperationsModule.tsx` is now thin and all primary Safety child routes have explicit page artifacts.
   Approval still reuses the KPI implementation by design, but that reuse is now documented in `SafetyApprovalPage.tsx`.

2. Warnings and Incidents are now page-separated but share a helper module.
   This is the desired ownership split, but shared form constants and review components remain in `SafetyWarningsIncidentsShared.tsx`, so changes to shared risk/review behavior still affect both routes.

3. Approval is route-complete with a wrapper, but not yet a fully independent product page.
   Reusing `SafetyKpiPage approvalOnly` works and is explicit, but a future richer approval workflow may still need its own implementation.

4. Pagination is now real for Warnings, Incidents, KPI/Approval, Data Entry, Documents, Reports, and Training.
   Checklist remains intentionally bounded by department/period item count, so it does not need list pagination unless the checklist model expands beyond the current fixed 6S items.

5. Stale route chunks can still appear after a rebuild in an already-open browser session.
   The app recovered after retry and loaded the current Safety chunk, but the server currently falls missing asset URLs back to `index.html`, which makes old dynamic imports fail noisily before recovery.

## Recommended Next Work

1. Add a deployment/cache hardening check so missing hashed assets return a clear 404 or trigger a controlled refresh without serving `index.html` as a JavaScript module.
2. Run mobile-width authenticated browser smoke for every Safety route after the latest Data Entry/Documents changes, not only the focused pagination routes.
3. Consider promoting `SafetyApprovalPage.tsx` from wrapper to independent workflow if approval needs non-KPI review queues later.

## Definition Of Done

Safety - 6S pageization should be considered complete only when:

- Every planned route has an owning page file or an intentionally shared page file documented in code.
- `SafetyOperationsModule.tsx` becomes a thin route registry plus route-local CSS import only.
- Warnings, incidents, dashboard, approval, and CRUD pages can be changed independently.
- List pages have explicit pagination behavior or documented bounded datasets.
- Frontend migration guards remain active: no `.jsx` in active source, no JS files under `src`, `allowJs: false`, `noImplicitAny: true`, no TypeScript suppressions, and no explicit `any`.
- `npm run typecheck`, `npm run build`, and browser smoke for all Safety routes pass against the running service.
