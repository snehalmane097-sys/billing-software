# Windows continuation - 4 November 2026

The existing Windows project has the invoice management redesign. Remaining all-page summary scope text and 25-invoice payment guard have been applied. Tests now cover database reopen and encrypted restoration of cancellation/archive state. Build passes (37 modules). Final Windows verification: all 32 automated tests passed, zero failures, including actual encrypted restoration of cancellation/archive records.

http://localhost:3001 returns HTTP 200. The served HTML, JavaScript and CSS were SHA-256 compared with dist and all match the current build. Backend restart attempted but failed with EADDRINUSE. Windows denies TCP owner/process lookup (CIM unavailable; TCP owner API returns access denied), so the existing process cannot be safely identified or stopped here. Do not kill arbitrary Node processes or run a second production instance. In the known billing terminal: Ctrl+C, then npm start from C:\billingsoftware. Refresh /#invoices afterwards. The UI detects an older backend missing filtered summary data and asks for restart instead of crashing or fabricating totals.

Native browser helper cannot start: failed to launch codex app-server: program not found. Desktop/mobile visual acceptance remains pending. No real customers/invoices/payments were created or altered. Additive tables are preserved. No public deploy or source push.

# Feature expansion — 4 November 2026

Read FEATURE_EXPANSION.md first. Company accounts, separate product/service management, extended invoice search, protected proforma revisions, revalidated duplicate-safe conversion, single Bill To PDFs and grouped navigation are implemented. The real invoice PDF was exported read-only and its values verified. Browser checks used an isolated synthetic business. Backend changes require restarting the existing application process. Preserve data/billing.sqlite. No public deployment or source push.

# PDF redesign checkpoint — 4 November 2026

The fixed-coordinate ASCII PDF has been replaced by server/pdf.mjs + server/documents/render.py (ReportLab 4.4.9, Pillow, embedded Arial). Read PDF_GENERATION.md before older notes. Python dependency is required; no browser process is used. Installed primary runtime is detected locally; other machines set PDF_PYTHON and install requirements. Saved snapshot monetary values are rendered without tax recalculation. New BigInt calculations store gross/discount breakdowns. Existing records remain untouched. Optional bank/signatory/terms settings and shipping/document terms are saved and snapshotted. Credit/debit/delivery headings are reusable templates only, not newly enabled accounting workflows.

Actual issued invoice I2627/000001 exported read-only and every financial value checked against saved data. Synthetic multi-page sample is in output/pdf (excluded from source archive). Final build/test and visual QA results are recorded in PDF_GENERATION.md/PROGRESS.md. New backend code requires restarting the existing server; do not kill unrelated Node processes. No public deploy or source push.

# Latest checkpoint — 4 November 2026

Read BUSINESS_UPDATE.md before older notes. Products and services require only name/unit/rate; HSN, SAC, GST and inventory/reference fields are optional. Blank catalogue GST must be explicitly set on an invoice before issue. Branding is persisted in additive SQLite logos/branding tables; issued snapshots retain their logo ID. server/logo.mjs uses Sharp and stores original bytes plus lossless RGB/alpha PDF data. Sharp and its Windows native dependency must be packaged or installed. Proformas use the shared editor/PDF path. Build and nine tests pass; PDF logos were rasterized with Poppler and visually checked. Current palette is warm ivory/mocha. Browser checks remain pending.

# Resume here

Project: `C:\billingsoftware`. Read README.md and PROGRESS.md first. Approved design is Teal & Ivory; do not restart design exploration.

Commands: `npm run build`, `npm test`, `npm start`. URL: http://localhost:3001. Node 22.19+ required. The frontend is prebuilt; runtime uses only Node built-ins and SQLite. Tests run through the actual HTTP handler without network sockets.

No manager/business records are seeded. Production database is `data/billing.sqlite` and must be preserved. Do not package data, sessions, keys or real backups. Regression tests isolate all data into a fresh temporary directory.

Money logic is in server/money.mjs. Issued document snapshots are authoritative. Never introduce a paid/unpaid toggle or mutate issued records. Staff visibility is own-created records; manager is business-wide. All actions/downloads/exports need server checks.

Main unfinished acceptance: real browser and PDF layout checks; package install and localhost network clients were blocked in the managed environment. Computer-use stopped due URL-confidence enforcement; do not claim browser QA passed. Use normal local PowerShell/browser for the next acceptance session.

Backups are functional and test-covered but not configured for this business. Keep status honest. Next implementation priorities: controlled credit/debit notes and request resolution; quotation lifecycle; Unicode PDF embedding and layout consistency; missing exports; broader security/session UX and migration strategy. See README for detailed scope and external configuration.

Products & services is implemented in src/features/catalogue.tsx using the existing /api/services persistence. Product records have itemType=product, hsn, unit, sku and details; legacy missing itemType means service. server/catalogue.mjs validates both catalogue metadata and invoice snapshots. Product selection and quick creation flow into invoice lines. Eight tests pass. Do not reintroduce SAC-only issuing validation. No stock accounting has been implemented.

## Live catalogue check — 4 November 2026

The obsolete six-digit-SAC error string is absent from the current backend. A real HTTP regression now verifies both a three-field product and the screenshot-style optional fields with blank HSN/SAC, using an isolated temporary database. The frontend explains an outdated server explicitly if that legacy error is returned. Build and nine tests pass. A read-only check confirmed the user's Shell Pipe Ring FDS product exists with empty classification codes; no user product was created or changed during diagnosis. The active Chrome invoice editor was inspected without changing its draft.


Final verification — 4 November 2026: TypeScript/build passed (32 bundled modules). Full npm test passed 22/22 tests, including actual encrypted restoration of proforma versions and company balances. Required-only product saving and issued proforma revision saving were verified through the browser in a disposable business; company summary/ledger and the editor at 390px were inspected. The saved invoice I2627/000001 was exported read-only, matched every displayed saved financial value, and rendered as one A4 page with Bill To only. Existing localhost:3001 returned HTTP 200; that pre-existing process has not been restarted with this backend update. Restart it once before using the new modules.
