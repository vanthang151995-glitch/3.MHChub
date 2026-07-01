# MHChub AI Project Context

Use this file first when working with the MHChub repository from Continue or a local LM Studio model.

## Project Shape

MHChub is a React/Vite frontend with a Node/Express backend.

- Frontend entry areas: `src/app`, `src/pages`, `src/components`, `src/services`.
- App shell/navigation: `src/app/AppShell.tsx`, `src/app/AppTopNav.tsx`, `src/app/AppSidebar.tsx`, `src/app/appShellNav.ts`.
- Main API client: `src/services/api.ts`.
- Main backend entry: `server/index.js`.
- Backend stores/services: `server/core`, `server/auth`.
- Database schema/migrations: `database/migrations`.
- Important verification commands: `npm run typecheck`, `npm run build`, `npm run verify`.

## Key Domains

- Home/dashboard: `src/pages/HomePage.tsx`, `src/pages/HomePage.css`, `src/pages/HomeSafetyKpiPanel.css`.
- Departments/documents: `src/pages/DepartmentPage.tsx`, `src/pages/DepartmentPage.css`, `src/pages/DocumentsPage.tsx`.
- Safety 6S module: `src/pages/safety`.
- Safety API helpers: `src/pages/safety/safety-api.ts`.
- Safety domain/i18n: `src/pages/safety/safety-domain.ts`, `src/pages/safety/safety-i18n.ts`.
- Safety backend stores: `server/core/mysqlSafetyOperationsStore.js`, `server/core/mysqlSafetyBulletinStore.js`, `server/core/mysqlSafetyArchitectureStore.js`.

## Working Rules

- Inspect existing files before editing.
- Keep changes narrow.
- Preserve user edits and unrelated files.
- Prefer existing service/API patterns over new abstractions.
- Avoid broad CSS selectors; keep UI stable on laptop and mobile viewports.
- For Vietnamese/Japanese UI, preserve readable text and existing i18n patterns.

## Safety Bulletin Invariants

- Hide/show uses `published`.
- Delete is soft delete.
- Restore is admin-only.
- Deleted/draft bulletins must be hidden from public users.
- Hide/show/delete/restore actions require confirmation.

## Local AI Workflow

For repository questions, first read:

1. `docs/ai-project-context.md`
2. `package.json`
3. The directly relevant files from `src`, `server`, or `database`

Never answer that local files cannot be accessed before trying available Continue Agent tools such as `ls`, `read_file`, `grep_search`, or `file_glob_search`.
