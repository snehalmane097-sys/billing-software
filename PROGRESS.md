# Windows continuation - 4 November 2026

The existing Windows project has the invoice management redesign. Remaining all-page summary scope text and 25-invoice payment guard have been applied. Tests now cover database reopen and encrypted restoration of cancellation/archive state. Build passes (37 modules). Final Windows verification: all 32 automated tests passed, zero failures, including actual encrypted restoration of cancellation/archive records.

http://localhost:3001 returns HTTP 200. The served HTML, JavaScript and CSS were SHA-256 compared with dist and all match the current build. Backend restart attempted but failed with EADDRINUSE. Windows denies TCP owner/process lookup (CIM unavailable; TCP owner API returns access denied), so the existing process cannot be safely identified or stopped here. Do not kill arbitrary Node processes or run a second production instance. In the known billing terminal: Ctrl+C, then npm start from C:\billingsoftware. Refresh /#invoices afterwards. The UI detects an older backend missing filtered summary data and asks for restart instead of crashing or fabricating totals.

Native browser helper cannot start: failed to launch codex app-server: program not found. Desktop/mobile visual acceptance remains pending. No real customers/invoices/payments were created or altered. Additive tables are preserved. No public deploy or source push.

# Current checkpoint — 4 November 2026

Completed the simplified product/service masters, optional classification/tax metadata, persistent manager logo upload/replacement/removal, historical logo preservation, proforma document routing, and warm ivory/mocha styling. The final TypeScript build and nine tests pass, including actual Poppler PDF rasterization and encrypted logo restore. Rendered invoice logo placement was visually inspected. Read BUSINESS_UPDATE.md for the current flow. Full interactive browser acceptance remains unverified. Existing business records were not reset.

# Implementation checkpoint — 3 November 2026

Product HSN is now optional in catalogue entry and invoice issuing. A supplied HSN still receives format validation. Service SAC behavior is unchanged. Regression coverage includes saving and issuing a product without HSN.

The workspace was empty. A fresh local React/TypeScript + Node/SQLite application now exists with the initial Teal & Ivory design, superseded by the requested warm ivory/mocha palette. No business identity or financial records have been invented. No public deployment, messages or GitHub push.

## Working code and verified behavior

- Separate manager/staff authentication and server permissions; manager setup, business identity, customers, services, team permission controls.
- Invoice/quote drafts; decimal-safe BigInt calculations; snapshots and atomic numbering at issue; live preview and snapshot PDF.
- Payment allocations and manager reversals; invoice balances; outstanding/overdue filters; quote conversion without duplicate invoices; expenses; operational reports/CSV; audit.
- Optional AES-GCM daily backups and retention; test restore; actual manager recovery with current-state backup and session invalidation.
- Build passes. Nine test cases pass, including a broad connected workflow suite with many assertions. Tests use a temporary database, never business data.

## Not verified or configured

- Browser desktop/mobile acceptance: unavailable due localhost socket restrictions and browser tool failure. No claim of visual or real HTTP end-to-end verification.
- Real business information, actual staff credentials, confirmed SAC/tax applicability.
- Real external backup storage, key custody, off-device replication, persistent service hosting and actual business recovery exercise.
- Credit/debit note issuing/correction resolution, advanced quotation statuses, full accounting/GST filings, attachments, Unicode PDF fonts, receipt/statement export and PWA.

## Next concrete steps

1. Start `npm start` from `C:\billingsoftware` in normal PowerShell and open http://localhost:3001. Create your manager login.
2. Perform desktop/mobile acceptance on the real browser, then fix observed UI/integration issues. Read README limitations before real billing.
3. Implement credit/debit notes and correction approval without altering issued history; implement Unicode PDF fonts and matching invoice document layout.
4. Supply verified business/tax details and set up the two staff logins.
5. Configure encrypted separate-storage backups and verify actual restore on a protected copy before using real records.

Network package installation was blocked by DNS. React/TypeScript were copied from an existing local dependency installation; no other project's files were changed. `npm start` now requires the installed Sharp image dependency, and `dist/` is included.

## Product billing added — 3 November 2026

Products & services now supports product details (name, specifications, SKU, HSN, unit, rate, GST) alongside legacy services. Invoice editor has a searchable catalogue picker and manager quick creation that adds the saved product directly to the bill. Product/unit metadata persists through drafts, issuing and PDFs. Existing financial records remain intact; no schema reset. Eight tests and the TypeScript build pass. Actual browser verification remains blocked. Restart the running server to load backend changes.

## Live catalogue check — 4 November 2026

The obsolete six-digit-SAC error string is absent from the current backend. A real HTTP regression now verifies both a three-field product and the screenshot-style optional fields with blank HSN/SAC, using an isolated temporary database. The frontend explains an outdated server explicitly if that legacy error is returned. Build and nine tests pass. A read-only check confirmed the user's Shell Pipe Ring FDS product exists with empty classification codes; no user product was created or changed during diagnosis. The active Chrome invoice editor was inspected without changing its draft.


## 4 November 2026 — professional document PDF redesign

Replaced the plain text PDF writer with a reusable ReportLab document template and a Node snapshot adapter. Added optional bank/signatory/default terms and document shipping/terms, preserved immutable snapshots and record permissions, and persisted exact gross/discount breakdowns for new invoices. PDF runtime/setup and remaining limitations are in PDF_GENERATION.md. No live database records were modified.


Final validation (4 November 2026): npm run build passed; npm test passed all 14 tests. Read-only export of I2627/000001 matched every displayed saved monetary value and rendered as one A4 page. Synthetic 32-item logo/IGST/discount/partial-payment sample rendered as four pages. Final first/continuation/last-page PNGs were visually inspected. Live localhost session endpoint responded HTTP 200; the existing server process was not restarted or authenticated against for this update. Backend restart remains required before using the new renderer in that process.


## Company accounts and proforma expansion — 4 November 2026

Implemented server-filtered invoice/catalogue pages, manager accounts/ledger/CSV statements, additive version history for manager proforma revisions, validated idempotent conversion with original snapshots retained, grouped navigation and a single Bill To print layout. The revised PDF of I2627/000001 matches saved financial values and retains the real billing address. See FEATURE_EXPANSION.md for scope, validation and remaining modules.


Final verification — 4 November 2026: TypeScript/build passed (32 bundled modules). Full npm test passed 22/22 tests, including actual encrypted restoration of proforma versions and company balances. Required-only product saving and issued proforma revision saving were verified through the browser in a disposable business; company summary/ledger and the editor at 390px were inspected. The saved invoice I2627/000001 was exported read-only, matched every displayed saved financial value, and rendered as one A4 page with Bill To only. Existing localhost:3001 returned HTTP 200; that pre-existing process has not been restarted with this backend update. Restart it once before using the new modules.
