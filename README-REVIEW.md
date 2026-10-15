# ITGlow CRM

This is an incremental full-stack update of the existing multi-page CRM. Shared navigation and browser APIs live in TypeScript; the Python standard-library service serves the application and workspace-scoped SQLite API.

## Local development

Requirements: Node.js/npm and Python 3.10 or newer.

```powershell
npm install
npm run build
npm test
npm run start:api
```

Open `http://127.0.0.1:8000/sign-in.html` and register a workspace. The database is created at `data/itglow.sqlite3`; set `ITGLOW_DB_PATH` to override it. See [PROJECT_ANALYSIS.md](PROJECT_ANALYSIS.md) for the architecture, API coverage, security boundaries, and features that still need external services or additional work.

## Follow-up audit (15 October 2026)

### Fixes applied in this review

- Contacts table: tightened row spacing, improved header hierarchy, added clearer contact initials/name hierarchy, styled deal counts and owner chips, improved hover states and pagination, and preserved horizontal scrolling on narrow screens.
- Contacts loading failure: the empty table now explains that the user should check sign-in/connection instead of looking like there are simply no matching contacts.
- Activities: overdue/today/tomorrow labels now derive from the current local date rather than fixed October 2026 dates; the new-activity date defaults to today.
- Rebuilt the generated shared TypeScript output and reran project checks.

### Verification results

- `npm run typecheck`: passed.
- `npm run verify`: passed; 17 HTML pages, 16 inline JavaScript blocks, 44 local references, and 311 IDs checked.
- `python -m unittest backend.test_api`: passed (3 API integration tests).

These checks confirm syntax, local references, and the tested API behavior. They do not prove every button or page works in a real browser. A browser end-to-end pass could not be completed in this environment because Chromium navigation to the local development server was blocked by the runtime policy.

### Still incomplete / needs real integration

- Recover/reset password: no email delivery and verified reset-token service.
- Sales Inbox: sample conversations only; no real mailbox connection or actual sending.
- Contacts/Organizations CSV import: selection/preview only; imported records are not persisted from a CSV file.
- Settings: invitations, server-side team role changes, password changes, session revocation, and account deletion are not implemented as production features.
- Contact detail and parts of Insights/Setup Guide still include prototype/sample presentation content.
- The app should receive browser end-to-end tests for sign-in, navigation, CRUD, filters, pagination, modals, responsive layouts, and workspace isolation before public deployment.
