# iPaaS UI

Standalone Angular application for the platform workspace. This foundation implements
the application shell and placeholder routes for GitHub issue #8. It runs independently
of infrastructure, provider packages, and the orchestration engine.

## Prerequisites

- Node.js 24.18.0 and npm 11.16.0 are the validated local toolchain.
- Supported Node versions are declared in package.json; .nvmrc pins the validated version.
- Use a compatible Node installation before installing dependencies. The project enables
  engine-strict so unsupported toolchains fail early.

On Windows, if PATH selects an older NVM installation, select the existing compatible
installation for the current PowerShell session:

```powershell
$env:Path = 'C:\Program Files\nodejs;' + $env:Path
node --version
npm --version
```

## Development

Run from this directory:

```powershell
npm ci
npm start
```

Open http://localhost:4200. No database, backend API, credential file, or sibling
project needs to be running. Use npm install when intentionally changing dependencies;
commit the resulting lockfile with those changes.

## Validation

```powershell
npm run build
npm run build:production
npm run build:development
npm test -- --watch=false
npm run lint
npm run typecheck
npm run format:check
```

Tests use the Angular CLI's Vitest runner and cover the root application, lazy routes,
default redirect, page titles, active navigation, not-found recovery, and navigation
focus behavior.

## Structure

- src/app/app.ts: root router outlet only.
- src/app/core/layout: shell, header, and responsive navigation.
- src/app/core/config: typed configuration injection token and navigation definitions.
- src/app/core/errors: not-found page.
- src/app/features: lazy-loaded overview, tenants, global mappings, and canonical schemas.
- src/app/shared/ui: reusable feature placeholder.
- src/environments: typed build-time configuration.
- src/styles: global design tokens.

Components are standalone and use OnPush. The shell owns navigation visibility only;
it contains no domain state. Mobile navigation is an in-flow disclosure rather than a
modal: hidden links leave the tab order, Escape closes the disclosure, and successful
navigation closes it and moves focus to the main content. Route titles and aria-current
identify the current page.

Domain models, repositories, DTOs, adapters, and other feature folders will be added
when those issues introduce real functionality. No empty scaffolding is maintained.
Angular forms is available for future typed reactive forms; this issue has no form.

## Routes

| Path               | Page                            |
| ------------------ | ------------------------------- |
| /                  | Redirect to /overview           |
| /overview          | Workspace preview               |
| /tenants           | Tenants placeholder             |
| /global-mappings   | Global mappings placeholder     |
| /canonical-schemas | Canonical schemas placeholder   |
| Any unmatched path | Not-found page within the shell |

## Configuration and future data access

Production is the default build configuration. Development replaces environment.ts
with environment.development.ts. Both currently declare mock mode. Environment files
are public browser configuration and must never contain secrets.

There is no HTTP provider, API URL, backend implementation, or database connection.
Future features should inject repository contracts backed by mock implementations,
then swap to HTTP adapters when API contracts are available. Keep transport concerns
out of page components.

## Production hosting

npm run build:production writes static files to dist/ipaas-ui/browser. Configure the
static host to serve index.html for application routes so direct links and reloads work.
Missing asset requests should remain 404s. No server-rendering runtime is required.
