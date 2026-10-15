# ITGlow CRM: architecture, implementation, and setup

## Overview

ITGlow remains a multi-page HTML/CSS application rather than being rebuilt on a new frontend framework. The shared browser layer is TypeScript, compiled to a classic script. A dependency-free Python HTTP server serves the app and JSON API; SQLite persists accounts, workspaces, sessions, records, and preferences.

## Architecture and important files

- `src/app.ts` contains the shared, typed navigation configuration and renders the common topbar, primary sidebar, secondary navigation, and page shell mounts. It also exposes `window.ITGlowUI` and `window.ITGlowAPI` for page scripts.
- `assets/js/app.js` is generated output. Edit the TypeScript source and run `npm run build`.
- `assets/css/design-system.css` contains shared color, typography, shell, navigation, responsive, focus, and motion rules. The HTML pages retain their existing blue branding and page-specific presentation.
- `backend/app.py` is the Python standard-library HTTP server and JSON API. It creates SQLite tables on startup, validates inputs, hashes passwords with scrypt, issues HttpOnly session cookies, applies CSRF and origin checks to writes, enforces workspace scoping, and serves allowed static assets.
- `data/itglow.sqlite3` is created at runtime and ignored by Git. Set `ITGLOW_DB_PATH` to use a different database location.
- `backend/test_api.py` exercises registration/login, sessions, CSRF, tenant isolation, validation, pagination/search, and record CRUD.
- `scripts/verify-project.mjs` statically checks HTML/script syntax, local asset links, duplicate IDs, shared shell mount points, and centralized navigation links.

## API and persistence

The API includes `/api/auth/register`, `/api/auth/login`, `/api/auth/me`, `/api/auth/logout`, workspace-scoped CRUD collections for leads, contacts, organizations, deals, activities and inbox records, `/api/settings`, `/api/workspace`, and `/api/insights`. List endpoints support `page`, `limit`, and `q`. API mutations are protected by same-origin checks, the session CSRF token, and role restrictions. Data is isolated by workspace ID.

The Leads, Deals, Activities, Contacts, Organizations, Settings, and Insights screens use the API for their current record/preferences operations. Contacts include search, owner-independent zero-closed-deal filtering, pagination, CSV export, create, delete, and detail navigation. Organizations include search, owner filtering, create/update, and CSV template download. Insights use API totals and export those totals.

## Run locally

Requirements: Python 3.10+ and Node.js/npm. No Python packages or runtime npm dependencies are required.

```powershell
npm install
npm run build
npm test
npm run start:api
```

Open `http://127.0.0.1:8000/sign-in.html`. Registration creates a workspace and signs the user in. Passwords must contain at least 12 characters, uppercase and lowercase letters, and a number. `ITGLOW_HOST` and `ITGLOW_PORT` configure the server bind address. Set `ITGLOW_COOKIE_SECURE=1` only when serving over HTTPS. Back up the SQLite database before upgrades or moving hosts.

## Known limits and items needing a production service

- Password recovery/reset routes are not implemented because sending and verifying email requires a configured delivery and token service. Recovery/reset pages must not be treated as working until that service exists.
- Sales Inbox still contains illustrative conversation content and has no connected email provider. Archive/send/draft actions do not deliver email; email send is intentionally not simulated as a live integration.
- CSV selection in Contacts and Organizations is not a complete importer; no records are written from a selected file. Organization template download works. Contacts CSV export is generated from records loaded from the API.
- Settings preferences and workspace name persist. Team invitations, server role management, password change, session listing/revocation, and account deletion are not complete backend features. Their UI remains explicitly identified as preview/unavailable.
- Contact detail and setup-guide content still include prototype copy and need further data binding. Insights stage trend/activity-owner breakdowns remain presentation content; only the headline aggregates and exported aggregate metrics are live.
- SQLite plus Python's development HTTP server is appropriate for local development and evaluation, not a hardened public production deployment. Production should use HTTPS, a production WSGI/ASGI server, managed secret/configuration handling, backups, migrations, and an email provider.
- Browser end-to-end tests and a deployment security assessment are not included. Static verification and API integration tests do not replace those checks.
