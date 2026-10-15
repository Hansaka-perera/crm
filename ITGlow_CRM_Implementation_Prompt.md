# ITGlow CRM — Complete Full-Stack Transformation, Secure Backend, UI Improvements & Testing

Act as a **Senior Full-Stack Architect, TypeScript Engineer, Backend Security Engineer, Database Architect, and QA Engineer**.

Your task is to transform my existing ITGlow CRM frontend into a fully functional, secure, maintainable, production-oriented CRM application.

**CRITICAL RULE: DO NOT REBUILD THE PROJECT FROM SCRATCH. INSPECT AND IMPROVE MY EXISTING CODEBASE.**

Preserve my existing ITGlow branding, blue accent color, useful page layouts, existing features, and working functionality. Improve the application professionally without unnecessarily changing the overall design.

The supplied project currently contains frontend pages, assets, scripts, a `src` directory, `package.json`, and `tsconfig.json`. Inspect the actual files and dependencies before deciding how to implement the backend.

The final result must be a working full-stack application, not just a redesigned frontend or a collection of disconnected example files.

---

## 1. INSPECT THE ENTIRE EXISTING PROJECT FIRST

Before editing anything, inspect:

- All existing HTML pages.
- All JavaScript and TypeScript files.
- Existing CSS, stylesheets, and shared UI components.
- `package.json`, `tsconfig.json`, and other configuration files.
- The `assets`, `scripts`, and `src` directories.
- Existing routes, menus, forms, tables, and interactions.
- Existing data models, API integrations, and backend connections, if any.
- Current authentication, registration, password recovery, and settings pages.
- All existing CRM modules and navigation items.

Existing pages include, but are not limited to:

- Leads
- Contacts
- Contact Details
- Organizations
- Deals
- Sales Inbox
- Insights
- Activities
- Settings
- Company Details
- Sign In
- Sign Up
- Password Recovery
- Password Reset
- Registration Complete
- Legal Documents
- Setup Guide

Find every additional route and feature in the actual repository.

Create a project audit identifying:

1. What already works.
2. What is currently hardcoded.
3. Which buttons and forms are nonfunctional.
4. Which components or layouts are duplicated.
5. Which pages have inconsistent styling.
6. Which dependencies are missing or unnecessary.
7. Which security protections are missing.
8. Which database entities and API endpoints are required.

After the audit, implement the improvements directly in the existing project.

Do not stop after writing a report or presenting a proposed architecture.

## 2. CHOOSE A SUITABLE FULL-STACK ARCHITECTURE

Use TypeScript as the primary programming language for application logic.

First check whether the existing project uses a framework or can support one without a risky rewrite.

### Preferred backend

If the existing technology stack supports it, use:

- Node.js with TypeScript.
- Fastify for HTTP API routing and middleware.
- PostgreSQL as the production relational database.
- Prisma ORM with version-controlled database migrations.
- Zod for request validation and shared runtime schemas.
- A suitable maintained library for secure password hashing, such as Argon2id.
- A suitable Excel library, such as ExcelJS, for spreadsheet processing.
- Automated testing tools appropriate to the existing project.

Use current stable, mutually compatible package versions and verify their Node.js requirements before installation.

If an existing backend framework or database is already present, evaluate and reuse it when that is the safer and more maintainable decision.

Do not introduce React, Next.js, or another frontend framework solely for architectural appearance. Preserve the existing frontend unless a migration provides a clear, measurable benefit.

### Suggested modular backend structure

Organize the backend according to actual responsibilities. A possible structure is:

- `src/server.ts`
- `src/app.ts`
- `src/config/`
- `src/plugins/`
- `src/modules/auth/`
- `src/modules/users/`
- `src/modules/leads/`
- `src/modules/contacts/`
- `src/modules/organizations/`
- `src/modules/deals/`
- `src/modules/activities/`
- `src/modules/insights/`
- `src/modules/settings/`
- `src/modules/import-export/`
- `src/modules/audit-logs/`
- `src/lib/`
- `src/types/`
- `src/schemas/`
- `src/tests/`
- `prisma/schema.prisma`
- `prisma/migrations/`

Adapt this structure to the existing project instead of creating unnecessary folders.

Separate routes, validation, business logic, database access, and shared utilities where doing so improves maintainability.

Do not place the entire application in one oversized file.

## 3. BUILD A REAL DATABASE-DRIVEN CRM

Replace fake business data and frontend-only CRUD operations with real backend functionality.

Use a properly designed relational database with primary keys, foreign keys, unique constraints, indexes, transactions, and appropriate deletion rules.

Implement suitable database models for:

- Users
- Organizations
- Contacts
- Leads
- Deals
- Activities
- Notes
- Tasks
- Custom or configured pipeline stages, where required
- Application settings
- Audit events
- Import jobs, if required

Use UUIDs or another suitable non-guessable identifier strategy for externally exposed record IDs.

### Core CRM relationships

Contacts should support their related organization, contact details, owner, notes, and linked deals where applicable.

Leads should support contact information, source, status, owner, priority, and relevant follow-up details.

Organizations should support company information, related contacts, associated deals, and relevant activity history.

Deals should support deal title, value, currency, pipeline, stage, probability, expected closing date, assigned user, organization, contacts, notes, and activity history.

Activities should support tasks, calls, meetings, due dates, status, ownership, and links to appropriate CRM records.

Use relationships and database constraints instead of storing complex relationships as arbitrary text.

Avoid introducing mandatory business fields without examining the existing UI and workflows.

### Database integrity

- Prevent duplicate records where appropriate using business-appropriate uniqueness rules.
- Validate foreign-key relationships.
- Use database transactions for multi-step operations.
- Prevent accidental record loss.
- Support pagination, filtering, searching, and sorting at the database/API level.
- Add indexes based on actual query requirements.
- Use migrations instead of relying on manual production database changes.
- Define a safe development seeding strategy without exposing production credentials or creating default administrator accounts in production.

Do not claim production readiness until the required database, migrations, configuration, and operational checks exist.

## 4. IMPLEMENT SECURE USER AUTHENTICATION

Connect the existing Sign In, Sign Up, Password Recovery, Password Reset, and related pages to real backend endpoints.

Implement:

- Secure account registration.
- Login and logout.
- Password hashing using Argon2id or an appropriately configured alternative.
- Protected application routes.
- Server-side authentication checks.
- Password reset using cryptographically secure, single-use, expiring tokens.
- Safe session or token lifecycle management.
- Session invalidation after logout and appropriate credential changes.
- Login rate limiting and protections against credential-stuffing attacks.
- Generic authentication error messages that do not reveal whether an account exists.
- Server-side input validation and meaningful error handling.
- Secure handling of session cookies when cookie-based authentication is used.

Prefer opaque server-managed sessions in `HttpOnly`, `Secure` in HTTPS deployments, appropriately configured `SameSite` cookies when suitable for the application.

If cookie-based authentication is selected, implement appropriate CSRF protection for state-changing operations. Configure production cookie security and local development separately.

Do not store passwords, session identifiers, refresh tokens, or other sensitive credentials in browser local storage.

Do not treat hiding a page or button in the frontend as authentication or authorization.

Password reset must not send passwords through URLs, logs, or email messages.

Implement email delivery through a configurable provider where email verification or password reset requires it. Do not pretend email delivery works when no provider has been configured.

## 5. IMPLEMENT STRONG SERVER-SIDE SECURITY

Security is a primary requirement, not an optional improvement.

Apply the following safeguards:

### Request protection

- Validate request bodies, query parameters, and path parameters on the server.
- Reject malformed or unexpected inputs.
- Enforce appropriate request-body and upload-size limits.
- Use parameterized database operations or a safe ORM.
- Prevent SQL injection.
- Prevent cross-site scripting by safely rendering untrusted content.
- Configure secure HTTP headers.
- Configure CORS with an explicit allowlist of permitted production origins.
- Apply rate limits to login, password reset, import, and other abuse-prone endpoints.
- Use safe error responses that do not expose secrets, database details, stack traces, or internal implementation details.
- Avoid unsafe object merging and mass assignment.
- Validate uploaded filenames, MIME types, file signatures where applicable, extensions, and file sizes.
- Do not render user-provided HTML as trusted markup.

### Secrets and configuration

- Use environment variables for database credentials, session secrets, API keys, and provider credentials.
- Provide a `.env.example` with placeholder values only.
- Never commit `.env` files, passwords, private keys, or production secrets.
- Add secrets and generated sensitive files to `.gitignore`.
- Validate required configuration at application startup.
- Fail safely when essential production configuration is missing.
- Separate development, testing, and production configuration.

### Authorization and data protection

Implement server-side role-based access control.

At minimum, provide appropriately scoped:

- Administrator permissions.
- Standard user permissions.
- Read-only permissions if supported by the business requirements.

Use permission checks on every relevant API route.

Prevent users from accessing or modifying records they do not own or have permission to access.

If the application supports multiple companies or tenants, enforce tenant isolation at the database-access/service layer and test attempts to access another tenant's records.

Do not assume a user can access a record simply because they know its ID.

Add appropriate protections against insecure direct object references, privilege escalation, mass assignment, and unauthorized deletion.

### Audit logging

Record appropriate security and business events, including:

- Login success and failure.
- Logout.
- Password reset events.
- Permission or role changes.
- Sensitive record updates and deletions.
- Import and export jobs.
- Changes to application settings.

Never log passwords, authentication tokens, secret values, or unnecessary sensitive personal information.

Ensure ordinary users cannot manipulate or delete security audit records.

### Production operational security

Provide:

- Appropriate TLS deployment requirements.
- Health-check and readiness endpoints.
- Graceful shutdown.
- Structured logging with sensitive-value redaction.
- Database backup and recovery instructions.
- Dependency and vulnerability checks.
- Secure production configuration.
- Clear operational documentation.

Do not describe the application as completely secure or invulnerable. Document remaining risks and deployment requirements.

## 6. CONNECT THE EXISTING FRONTEND TO THE BACKEND

The existing pages must use real API endpoints rather than displaying fake data and pretending that operations succeeded.

Build a reusable, typed frontend API client using the project's existing architecture.

It should support:

- Correct API base URL configuration.
- Typed request and response models.
- Authentication/session handling.
- JSON requests and responses.
- Loading states.
- Meaningful error handling.
- Request cancellation when appropriate.
- Validation-error display.
- Consistent handling of expired sessions.
- Safe retries only for operations where retrying is appropriate.

The API base URL must be configurable instead of being duplicated throughout the pages.

Connect actual forms, tables, buttons, filters, navigation actions, and data displays to their corresponding backend operations.

### Required API capabilities

Implement routes for relevant operations, such as:

- Registration, login, logout, and password reset.
- User profile and account settings.
- Lead creation, listing, reading, updating, and deleting.
- Contact creation, listing, reading, updating, and deleting.
- Organization creation, listing, reading, updating, and deleting.
- Deal creation, listing, reading, updating, and deleting.
- Deal-stage updates and pipeline movement.
- Activities, notes, and follow-up tasks.
- Insights and reports.
- Spreadsheet imports and exports.
- Authorized audit-log access.

Choose appropriate HTTP methods and status codes.

Use consistent API response schemas and pagination metadata.

Do not implement destructive endpoints without proper authentication, authorization, validation, and audit handling.

## 7. MAJOR UI IMPROVEMENTS — TABLES, CONTACTS, LEADS, AND DEALS

Preserve the existing ITGlow brand, blue accent color, and recognizable visual identity.

### Standardize the shared application layout

Create or improve shared reusable components for:

- Sidebar.
- Header and navigation.
- Search bar.
- Page heading and action area.
- Breadcrumbs where appropriate.
- Buttons and icon buttons.
- Forms and form fields.
- Dialogs and confirmation dialogs.
- Tables.
- Filters.
- Pagination.
- Loading indicators.
- Notifications.
- Empty states.
- Error states.

Every CRM route should reuse the same application layout and design tokens.

Do not create a completely separate sidebar or header for each module unless there is a genuine functional requirement.

The sidebar must contain appropriate module-specific navigation while maintaining the same dimensions, spacing, active states, and interaction patterns.

Keep existing route names and links working.

### Improve all data tables

Make tables easier to read, navigate, and operate.

Add the following features where appropriate:

- Consistent column widths and alignment.
- Clear headings.
- Sorting.
- Search.
- Filtering.
- Pagination.
- Page-size selection.
- Loading and empty states.
- Error and retry states.
- Row selection when bulk operations are supported.
- Selectable columns or density settings only when useful.
- Accessible dropdown menus.
- Clear action buttons.
- Confirmation for destructive actions.
- Expandable record details when they improve usability.
- Responsive layouts for smaller screens.
- Keyboard accessibility.
- Server-side filtering and pagination for large datasets.

Avoid loading the entire database into the browser just to filter records locally.

Tables must use real backend data. Do not add nonfunctional buttons simply to decorate the interface.

### Improve the Deals module substantially

Turn the Deals page into a professional sales pipeline.

Implement these views where suitable for the existing application:

1. Pipeline or Kanban view.
2. Table view.
3. Deal detail view.
4. Deal creation and editing dialog or form.
5. Filters and saved-filter capabilities if justified.
6. Stage-based reporting.

Each deal should display the important information needed for sales work, such as deal name, organization, contact, value, stage, expected closing date, owner, and probability.

Allow authorized users to:

- Create deals.
- Edit deal information.
- Update pipeline stages.
- Move deals between stages.
- Search and filter deals.
- Sort and paginate deal lists.
- Open deal details.
- View related contacts, organizations, notes, and activities.
- Record follow-up activities.
- Mark deals as won or lost.
- Record loss reasons where appropriate.
- View stage totals and other useful pipeline summaries.

Use backend persistence for every change.

If users can drag deals between stages, implement real persistence, accessible alternatives, authorization, and suitable error recovery.

Use database transactions when multiple dependent updates must succeed together.

### Improve Leads and Contacts

Provide a clear, consistent experience for:

- Creating and editing records.
- Searching and filtering.
- Opening record details.
- Linking people with organizations.
- Assigning record ownership.
- Updating lead status.
- Recording notes and follow-up actions.
- Viewing relevant activity history.
- Deleting records with appropriate confirmation and authorization.

Remove duplicate UI elements and repeated forms.

## 8. IMPROVE ICONS, BUTTONS, AND INTERACTIONS

Audit every icon, action, button, and navigation element.

- Use one consistent icon family and visual style.
- Reuse an existing icon library if it is appropriate.
- Avoid emoji as replacements for professional navigation icons.
- Keep icon sizes, stroke weights, and alignment consistent.
- Use tooltips for icon-only actions where appropriate.
- Provide accessible labels for icon-only buttons.
- Make disabled, loading, hover, and focus states clear.
- Prevent accidental double submissions.
- Show confirmation when an irreversible action requires it.
- Show meaningful success or error notifications after API responses.
- Do not display success messages before the backend operation succeeds.
- Remove dead buttons and duplicate navigation items.
- Make keyboard interaction and focus behavior consistent.

## 9. EXCEL IMPORT AND EXPORT SYSTEM

Implement actual Excel file import and export for the main CRM modules.

Support `.xlsx` files using a maintained TypeScript-compatible library such as ExcelJS.

Include:

- Leads import and export.
- Contacts import and export.
- Organizations import and export.
- Deals import and export.
- Downloadable import templates.
- Clear column names and example formatting.
- Column mapping or clear rules for expected headers.
- File-size and row-count limits.
- Validation before database writes.
- Duplicate detection.
- Required-field validation.
- A preview of records before import.
- Import summaries.
- Row-by-row error reporting.
- Export filters where applicable.
- Permission checks for imports and exports.

### Safe import workflow

Use the following workflow:

1. User downloads a template or selects an Excel file.
2. The frontend uploads it to an authorized backend endpoint.
3. The backend validates the file and checks its actual content.
4. The backend validates columns, field types, values, relationships, and permissions.
5. The user receives an import preview and error summary.
6. Invalid rows are reported with useful row numbers and field-specific messages.
7. The user confirms the import.
8. Valid changes are written to the database using appropriate transactions and batching.
9. The result reports created, updated, skipped, and failed records.
10. The system records an appropriate audit event.

Do not write unvalidated spreadsheet content directly to the database.

Prevent formula injection when exporting user-controlled values to formats that spreadsheet applications may execute.

Use sensible resource limits, timeouts, and memory-efficient processing for larger files. Introduce asynchronous import jobs only when justified by the expected data volumes.

Do not allow spreadsheet imports to assign administrator roles, bypass permissions, or alter protected internal IDs.

## 10. INSIGHTS, REPORTS, AND DASHBOARD

Connect Insights to actual database-backed data.

Create useful reports where the required data exists, including:

- Total leads and their statuses.
- Contact and organization counts.
- Open deal counts.
- Total pipeline value.
- Deals won and lost.
- Win rate using a clearly defined calculation.
- Sales performance over time.
- Deals by stage.
- Upcoming closing dates.
- Outstanding follow-up activities.

Provide useful date filters and stage filters where appropriate.

Calculate report values on the backend using consistent business rules.

Ensure users see only the data they are authorized to access.

Avoid fake statistics, misleading empty charts, and invented business metrics. When data is unavailable, show a helpful empty state.

## 11. FORMS, ERRORS, AND STATE MANAGEMENT

Implement reliable application state and form behavior.

- Validate data in the frontend for usability.
- Validate all untrusted input again on the backend.
- Use shared typed schemas where practical.
- Display field-specific validation messages.
- Prevent double submissions.
- Preserve user input after recoverable errors.
- Show loading indicators for network operations.
- Handle expired sessions and permission errors.
- Provide useful empty states.
- Handle network failures without crashing the application.
- Prevent stale requests from unnecessarily overwriting newer results.
- Refresh or update views after successful mutations.
- Do not silently swallow errors.

Opening a creation dialog must require the relevant user action. Never automatically open Add dialogs when a page loads.

## 12. ANIMATIONS AND RESPONSIVE DESIGN

Improve the interface with subtle, professional animations.

Include, where appropriate:

- Sidebar expand/collapse.
- Dialog entrance and exit transitions.
- Dropdown transitions.
- Toast notifications.
- Button feedback.
- Expandable detail panels.
- Loading and skeleton states.
- Deal pipeline interactions.

Use existing dependencies where possible. Introduce another animation library only if it materially improves the result.

Respect reduced-motion settings, keyboard navigation, and accessibility.

Test shared layouts at common desktop, laptop, tablet, and mobile widths.

Prevent:

- Overlapping content.
- Inconsistent page scales.
- Broken navigation.
- Unusable tables.
- Unexpected horizontal scrolling.
- Text clipping.
- Layout shifts during loading.
- Conflicting page-specific styles.

Do not force every page to display the same content. Standardize the shared design rules while preserving each module's purpose.

## 13. AUTOMATED TESTING AND QUALITY ASSURANCE

Create meaningful automated tests for the actual implemented behavior.

### Backend tests

Test:

- Registration and login.
- Password hashing.
- Password-reset validation and expiry.
- Authentication requirements.
- Role and ownership authorization.
- Cross-tenant isolation if applicable.
- CRUD operations for CRM entities.
- Input validation.
- Duplicate handling.
- Database relationships and constraints.
- Deal-stage updates.
- Pagination, sorting, search, and filters.
- Excel import validation.
- Excel export permissions.
- Oversized and malformed uploads.
- Rate-limited endpoints.
- Error handling.
- Unauthorized and forbidden requests.
- Audit-event creation.

### Frontend and integration tests

Test:

- Navigation across all existing pages.
- Login and logout flows.
- Main forms and validation.
- Tables and filters.
- Deal creation, editing, and stage changes.
- Dialog open and close behavior.
- Import preview and confirmation.
- Excel download.
- Loading and error states.
- Responsive layouts.
- Keyboard-accessible interactions.
- Correct frontend/backend integration.

### Final checks

Run the existing and newly configured commands where applicable:

- Dependency installation.
- TypeScript strict type-check.
- Production build.
- Lint.
- Unit tests.
- Integration tests.
- End-to-end tests.
- Dependency vulnerability checks.
- Database migrations against a test database.
- Asset and route checks.

Fix all issues introduced by the implementation.

Do not fake test results, skip failed checks silently, disable strict TypeScript settings to hide errors, or report features as tested when they were not tested.

If browser automation is available, run the major application workflows using a real browser.

If a check cannot be run, explain why and provide the exact remaining verification steps.

## 14. CONFIGURATION, DOCUMENTATION, AND STARTUP

Make local development practical on Windows and document production requirements.

Provide:

- `.env.example`.
- `.gitignore` updates.
- Database schema and migrations.
- Safe development seed instructions.
- API documentation.
- Database setup instructions.
- Node.js version requirements.
- Installation instructions.
- Development startup commands.
- Production build and startup commands.
- Test commands.
- Excel import/export documentation.
- Security configuration guidance.
- Backup and recovery instructions.

Use compatible package scripts such as:

- `npm run dev`
- `npm run build`
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run test:e2e` when configured

Only configure commands for tools that actually exist in the project.

If adding a backend and database, clearly explain every required service and environment variable.

Do not place real credentials in source code or documentation.

Do not claim a single development command starts the entire stack unless it actually does so.

## 15. STRICT IMPLEMENTATION RULES

- Do not rebuild the project from scratch.
- Do not discard my existing pages.
- Do not unnecessarily redesign the branding.
- Do not replace real business functionality with fake demonstrations.
- Do not create duplicate layouts for individual pages.
- Do not leave buttons that appear functional but do nothing.
- Do not invent successful API responses.
- Do not hardcode production credentials.
- Do not bypass backend authorization.
- Do not put the entire backend in one file.
- Do not overcomplicate the architecture with unnecessary services.
- Do not introduce dependencies without a clear reason.
- Do not change frameworks without a compelling technical justification.
- Do not delete existing functionality without explaining why.
- Use TypeScript and reusable typed components as the main development approach.
- Keep database access, business logic, authentication, and presentation appropriately separated.
- Preserve backward compatibility where practical.
- Make database migrations safe and reversible when feasible.
- Use transactions where required for data integrity.
- Document any feature that needs external credentials or infrastructure.

If a technical decision is uncertain, inspect the repository and choose the lowest-risk solution that meets the requirements.

## 16. IMPLEMENTATION PHASES

Work in this order:

**Phase 1 — Project audit:** Inspect the entire codebase, dependencies, current routes, and working features.

**Phase 2 — Foundation:** Establish backend architecture, TypeScript configuration, environment configuration, database schema, migrations, and local development setup.

**Phase 3 — Security:** Implement authentication, authorization, secure configuration, validation, rate limits, and audit logging.

**Phase 4 — CRM integration:** Connect Leads, Contacts, Organizations, Activities, Deals, Settings, and Insights to real backend data.

**Phase 5 — UI refinement:** Standardize the shared application shell, tables, navigation, icons, forms, responsive layouts, and interactions.

**Phase 6 — Excel:** Implement safe import, preview, validation, error reporting, and export functionality.

**Phase 7 — Quality assurance:** Run builds, strict type-checking, lint, automated tests, and available browser-based workflow tests.

**Phase 8 — Documentation:** Deliver setup instructions, API documentation, environment configuration, testing instructions, and a summary of changes.

Complete the phases incrementally. Keep the application in a working state, and report any blocker rather than silently skipping it.

## FINAL DELIVERABLE

Deliver the improved project directly in the existing repository, including:

1. A functioning TypeScript backend.
2. A real database schema and migrations.
3. Secure authentication and authorization.
4. Connected existing CRM pages.
5. Improved Leads, Contacts, Organizations, and Deals workflows.
6. A professional shared UI and navigation system.
7. Working Excel import and export.
8. Automated backend, integration, and frontend tests appropriate to the project.
9. Environment configuration and startup instructions.
10. A final report listing implemented features, changed files, test results, unresolved issues, and required deployment configuration.

**Final objective:** Turn the existing ITGlow CRM into a secure, database-driven, maintainable full-stack CRM while preserving the frontend I have already built.

Start by inspecting the repository. Then implement the solution directly. Do not stop at planning, mockups, pseudocode, or example endpoints.

## 11. Strict Rule: Reusable Components — Avoid Hardcoding and Duplication

Act as a Senior TypeScript Architect. Build the CRM using reusable components, centralized configurations, shared design tokens, and data-driven rendering.

**Do not hardcode the same UI, navigation, styles, or functionality separately on every page.** Before implementing anything, inspect the existing project and identify components that should be shared.

### A. One Shared Sidebar System

- Use one shared `PrimarySidebar` component for global navigation.
- Use one shared `SecondarySidebar` component for contextual navigation.
- Store navigation definitions in a centralized, type-safe configuration.
- Render navigation items dynamically from configuration rather than duplicating their markup.
- Automatically determine active modules and submenu items from the current route.
- Keep sidebar dimensions, icons, spacing, colors, typography, and active states consistent across every route.
- Never create a new sidebar implementation for an individual module or page.

### B. One Shared Search Bar

Create or reuse one global search component, such as `GlobalSearch.tsx`.

- Render the same search component through the shared application layout.
- Keep its dimensions, styling, positioning, icon, input behavior, and responsive layout consistent across all modules.
- Do not create separate copies of the global search bar for Contacts, Deals, Leads, Activities, Insights, Settings, or other pages.
- Connect it to the existing search functionality and data sources where available.
- Reuse existing search logic and APIs instead of implementing duplicate search systems.
- If search behavior depends on the selected module, use configuration or parameters rather than duplicating the component.
- Do not display fake search results or pretend that a search feature works when it is not implemented.

### C. One Shared Top Navigation Bar

Create or reuse one shared `Topbar.tsx` component.

It should contain the existing global navigation elements, such as:

- Breadcrumbs or the current module and page title.
- Global search.
- Notifications.
- User profile and account controls.
- Existing global actions, if applicable.

Requirements:

- Render the same topbar through the shared application layout.
- Keep its height, alignment, spacing, background, borders, and typography consistent.
- Update breadcrumbs and page titles dynamically using the current route and existing page metadata.
- Preserve existing buttons, dropdowns, permissions, and event handlers.
- Do not duplicate the topbar inside individual pages.
- Do not create different topbar implementations for different CRM modules.

### D. One Shared Application Layout

Use a single layout component, such as `AppLayout.tsx`, adapted to the project's existing framework.

The intended architecture is:

```text
App
└── AppLayout
    ├── PrimarySidebar
    ├── SecondarySidebar
    ├── Topbar
    │   ├── Breadcrumbs
    │   ├── GlobalSearch
    │   ├── Notifications
    │   └── UserProfile
    └── MainContent
        └── CurrentRoutePage
```

All existing application routes must reuse this shared layout.

Only the active navigation states, contextual submenu, breadcrumbs, page title, and main content should change as appropriate. The global components must retain consistent styling and behavior.

Adapt this structure to the actual framework. Do not introduce React or other dependencies if the existing project uses a different architecture.

### E. Eliminate Hardcoded UI and Navigation Data

Audit the project for repeated hardcoded content and replace duplication with appropriate reusable abstractions.

- Centralize navigation items, route metadata, labels, icons, and submenu definitions.
- Use shared theme variables or design tokens for colors, widths, heights, spacing, typography, borders, and shadows.
- Use reusable components for repeated buttons, inputs, dropdowns, tables, modals, cards, and pagination where appropriate.
- Render repeated data-driven UI from typed arrays or existing API responses.
- Reuse existing API clients, services, data models, and backend integrations.
- Keep business logic separate from presentation components.
- Use TypeScript interfaces or types for component properties and data structures.
- Use configuration for legitimate page-specific differences rather than creating duplicated components.
- Preserve existing user permissions and conditional visibility rules.

Do not replace every literal value blindly. Static labels, accessible text, and appropriate design constants are acceptable. The objective is to eliminate unnecessary duplication and fragile page-specific implementations, not to make the code unnecessarily complicated.

### F. Shared Styling Without CSS Conflicts

- Define shared CSS variables or reuse the existing theme system.
- Scope component styles appropriately.
- Avoid generic selectors that accidentally override unrelated pages.
- Remove duplicate sidebar, topbar, search-bar, and navigation styles.
- Prevent individual page styles from changing shared component dimensions.
- Keep responsive rules centralized where possible.
- Ensure changes to a shared component do not unexpectedly break other modules.

### G. Avoid Overengineering

- Inspect existing components before creating new ones.
- Reuse working code whenever possible.
- Do not install duplicate libraries.
- Do not create multiple components that perform the same job.
- Do not introduce unnecessary state-management libraries or abstractions.
- Keep the architecture understandable, maintainable, and appropriate for the existing project.
- Make incremental changes instead of rewriting the whole application.

### H. Verify Reusability Across All Routes

After implementation, verify that:

1. Every route uses the same primary sidebar.
2. Every route uses the same secondary-sidebar component with appropriate contextual navigation.
3. Every route uses the same global search component.
4. Every route uses the same topbar component.
5. Breadcrumbs and page titles update from route metadata.
6. Shared components maintain consistent dimensions and styling.
7. Navigation, search, dropdowns, and global actions preserve their functionality.
8. No duplicate sidebars, search bars, or topbars appear.
9. No page-specific CSS unexpectedly overrides shared layout styles.
10. Existing backend, database, authentication, and permission integrations continue working.
11. TypeScript checks, tests, and production builds pass where available.

Report which components were reused, which duplicated implementations were removed, and which checks were actually executed.

**Mandatory principle:** Build once, reuse everywhere. Every shared navigation element, global search bar, topbar, and common UI component must have a single source of truth wherever the existing architecture allows it.