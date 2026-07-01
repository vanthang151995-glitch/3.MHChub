# AppShell Structure

`AppShell` owns the shared application chrome: sidebar, top navigation, notification menu, language controls, theme toggle, and page title behavior.

## Files

- `AppShell.tsx`: shell state, route-aware behavior, notifications, help menu, and composition.
- `AppSidebar.tsx`: sidebar markup only.
- `AppTopNav.tsx`: top navigation markup only.
- `appShellNav.ts`: sidebar route config, visible item filtering, active route matching, and page title helpers.
- `styles/app-sidebar.css`: sidebar drawer, rail, colors, active states, laptop/zoom behavior.
- `styles/app-topnav.css`: topbar layout, title visibility, notification menu, language/auth button responsiveness.
- `styles/index.css`: imports the AppShell CSS files after global styles so AppShell rules win predictably.

## Rules

- Do not add new `.side-rail`, `.sidebar-*`, or sidebar active-state rules to `src/styles.css`.
- Do not add new `.topbar`, `.topnav-*`, `.notification-*`, or `.language-menu` rules to `src/styles.css`.
- Shared app tokens can stay in `src/styles.css` or `src/design-system.css`; AppShell layout belongs in `src/app/AppShell/styles/`.
- Route labels, sidebar sections, and active matching belong in `appShellNav.ts`, not inside JSX.
- If a new page needs a different title in the top navigation, update `getRouteTitle` in `appShellNav.ts`.
- If a new route needs a sidebar item, update `buildSidebarSections` in `appShellNav.ts`.

## Responsive Contract

- `> 1700px`: opened sidebar uses a stable 324px drawer.
- `<= 1700px`: sidebar uses a stable 308px off-canvas drawer, including 14-inch laptop with Windows zoom 125%.
- Hover/focus must not change sidebar width, padding, grid columns, or label visibility.
- When a sidebar item is selected, `AppShell` closes the drawer.
- Mobile TopNav keeps only compact controls that fit without horizontal overflow.
