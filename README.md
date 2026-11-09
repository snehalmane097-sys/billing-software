# Invoice management update

Read INVOICE_MANAGEMENT.md and INVOICE_MANAGEMENT_CHECKPOINT.md for the current implementation, verification and backend restart requirement.

# Billing management expansion

See [FEATURE_EXPANSION.md](FEATURE_EXPANSION.md) for current navigation, company accounts, proformas, catalogue management and verification. Restart the server after backend changes.

# PDF update — 4 November 2026

See [PDF_GENERATION.md](PDF_GENERATION.md) for the redesigned PDF system and required Python runtime. Optional bank details, document terms, signatory and shipping fields are implemented. Restart the backend after applying this update. Older setup/history notes below remain for context.

# Billing Workspace — Warm Ivory & Mocha

**Current update:** See [BUSINESS_UPDATE.md](BUSINESS_UPDATE.md) for three-field products/services, optional codes and GST, company logos and the current design.

A local-first **server-hosted** billing application for one manager and two staff members. React + TypeScript frontend; Node.js HTTP server; SQLite database; Sharp image decoding. Local-first describes where the server runs, **not offline billing**. The browser requires the server to be available. No public deployment or GitHub push was performed.

## Run on this Windows computer

Node.js **22.19 or newer** is required (the SQLite API is experimental on Node 22).

```powershell
cd C:\billingsoftware
npm start
```

Open **http://localhost:3001** in Chrome or Edge. Keep the terminal open. If port 3001 is already occupied by this app, use the existing server; stop that terminal with Ctrl+C before starting another copy. To choose another port:

```powershell
$env:PORT = '3002'
npm start
```

The built frontend in `dist/` is included. **Starting the application does not require npm install or an internet connection.** The server uses Node built-ins and the installed Sharp dependency for logo decoding. An optional launcher is `powershell -File .\scripts\start.ps1` if local script policy permits it; do not weaken execution policy to run it.

On first opening, create your own manager account. No default credentials exist. Then:

1. Open Business settings; enter your actual business identity, address, GSTIN and state code. Confirm the details only after verification.
2. Add customers, then use Products & services to save products or services with confirmed HSN / SAC codes, units, selling rates and GST rates.
3. Add two staff accounts in Team & permissions. Each signs in separately. Staff see their own records; manager sees all records. Staff can read the shared service catalogue, but only the manager changes it. Enable staff payment entry only where appropriate.
4. Create and save a draft, review the preview, then Review & issue. Download/print the PDF from the document detail dialog.
5. Record full or partial payments against an issued invoice. Manager reversals retain a reason and history. There is no paid/unpaid switch.

No test customers, invoices or passwords are inserted into the application database. Tests use a disposable temporary database.

## Build and test

The workspace contains a locally available React/TypeScript toolchain copied from the existing DocuLens dependencies **without modifying that project**. Registry installation failed with DNS `ENOTFOUND`. Runtime starts independently of these development dependencies.

```powershell
npm run build
npm test
```

For a clean checkout on a machine with registry access, run `npm install` before building. Installed dependency versions are in package.json; an offline lockfile was generated from the installed packages. The custom build script bundles the small CommonJS dependency graph, transpiles TypeScript and emits a self-contained same-origin frontend. It is not a hot-reload development server; rebuild and refresh after source changes. Development dependencies are not required by `npm start`.

## Implemented workflows

- Teal & Ivory responsive shell, separate sign-ins, manager/staff navigation, empty/loading/error/retry states and keyboard page search (Ctrl+K).
- Business setup, customer directory and account statements, reusable service pricing, customer/service archiving, server permission checks.
- Invoice and quotation drafts, optimistic version conflicts, live server-calculated A4 preview, issuing, PDF downloads, document/payment/overdue states, searches and pagination.
- Atomic financial-year numbering (April–March), database uniqueness, idempotent issue/payment/quote conversion. Save-draft and expense submissions accept idempotency keys.
- Issued snapshots of business, customer and line values. Subsequent master-record edits cannot alter issued PDF content.
- Full/partial payment allocations, manager reversal with reason, outstanding/overdue views, correction requests retained for manager review.
- Expense register, billing/collections/output-tax/expense summaries, date-filtered invoice CSV export, activity history.
- AES-256-GCM encrypted database backups, automatic daily checks while running, retention, restore testing and manager recovery with password, exact filename confirmation, and pre-restore protection.

## Calculations and scope

`server/money.mjs` uses **BigInt** intermediate arithmetic and integer paise. Quantities support 3 decimals, prices/percentage inputs 2 decimals. Discounts reduce the line value first; inclusive prices then back out GST. Any paise difference from individually rounded tax components is included in the explicit round-off adjustment, preserving the quoted inclusive amount. Each taxable line and each tax component round half up. CGST and SGST round separately; their sum can differ by a paise from rounding one combined GST amount. Optional final rounding uses nearest rupee, half up. The server repeats validation on save and issue; PDFs use saved values. Display formatting does not recalculate financial totals.

The current invoice flow supports **basic domestic forward-charge products and services**. Supplier state versus the user-confirmed place-of-supply state chooses CGST/SGST or IGST. The app does not infer the legal place of supply from a customer's address. Customer selection supplies an editable starting value only.

Official sources checked on **3 November 2026**:

- [CBIC CGST Rule 46 — invoice particulars, number length and financial-year uniqueness](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000136/1000001)
- [CBIC CGST section 34 — credit and debit notes](https://taxinformation.cbic.gov.in/content-page/explore-act/1000304/1000001)
- [CBIC Rule 53 — particulars of credit/debit notes](https://taxinformation.cbic.gov.in/content-page/explore-rules/1000144/1000001)

**This is an initial implementation, not a claim of GST compliance.** Actual business registration, service classifications, rate applicability, place-of-supply rules, signature and applicable e-invoicing obligations require review before real issuing. GSTIN validation checks syntax/state, not government registration or checksum. Number format is `I2627/000001` (quotes use `Q`), allocated only at issue and unique in SQLite.

## Data and authentication

`data/billing.sqlite` contains all application records, issued snapshots, configuration, password hashes, sessions and audit history. WAL files may be present while running. Do not copy only the live SQLite main file as a backup; use the built-in snapshot backup flow. There is no localStorage database. Documents are generated reproducibly from SQLite snapshots; separate uploaded attachments are not supported yet.

Passwords use salted scrypt. Sessions use random HttpOnly, SameSite=Strict cookies, an eight-hour expiry, server-side hashed tokens and CSRF validation. Login is rate limited. Permissions cover API reads, writes, statements, reports, exports and PDFs. Staff permission changes invalidate that staff member's sessions. Recovery invalidates all sessions. Audit is append-only through the app, but a filesystem administrator can edit the underlying database.

The default listener is loopback-only. This keeps initial account setup local. For shared access from other computers, configure a trusted host, HTTPS/reverse proxy, `APP_HOST`, `COOKIE_SECURE=1`, service hosting, firewall rules and database/backup filesystem access before changing `HOST`. Do not publicly expose this development setup. SQLite supports this small single-server deployment; do not place its database on a network share or launch independent application replicas against it.

## Encrypted backup configuration

Automatic backups are **not configured by default**. A success is shown only after a real snapshot has been encrypted and written. Keep the encryption key separate from the backup destination and source repository.

In the same PowerShell session that starts the server:

```powershell
$env:BACKUP_DIR = 'E:\BillingBackups'
# Load a 64-character hexadecimal AES key from your secure secret source:
$env:BACKUP_KEY = '<your securely generated 64-character hexadecimal key>'
npm start
```

Use an actual protected separate drive or mounted storage location; the app rejects the database directory and its children but cannot prove the destination is off-device. A key can be generated using `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`; keep it securely and never commit it. No key is saved in this project or backup payload. Environment variables must be supplied on every start or through a managed service configuration. The current build does not load `.env` automatically.

The server checks at startup and every minute whether the last successful backup is older than 24 hours. It retains all backups from the last 30 days plus a copy from each of the most recent 12 available months; pre-restore safety copies are retained separately until manually reviewed. **The server must be running.** Off-device replication, protected filesystem permissions, alert delivery and OS-level service scheduling are external configuration. A local same-drive folder is not disaster recovery.

In Backups & recovery, run Back up now and Test restore. Testing actually decrypts and restores a temporary SQLite database, verifies integrity/foreign keys and counts key records. Recovery requires the manager password and `RESTORE <exact filename>`, repeats the test, saves the current state first and signs all users out. Target recovery loss is up to 24 hours of work, longer after downtime or backup failures. The test suite verifies actual replacement and pre-restore protection using **disposable data only**; this does not mean your business backup destination is configured or tested.

## Validation and remaining work

`npm run build` passes TypeScript checking and produces the browser bundle. `npm test` covers intra/inter-state GST, inclusive pricing, discounts, fractional quantities, half-up rounding, malformed input, duplicate drafts/issues/payments, numbering, version conflicts, partial/full payments and reversals, staff restrictions, quotation conversion, snapshot persistence, PDF totals, reopening SQLite, encrypted backup creation, actual restore, session invalidation and corruption rejection.

The workflow suite invokes the real HTTP request handler in-process because the managed Windows environment denies localhost client sockets. The server can bind, but live HTTP/browser access could not be confirmed here. The in-app browser timed out; native computer-use verification stopped because its browser URL could not be confidently established. **Desktop/mobile browser checks, end-to-end network and browser tests remain unverified; PDF logo output has been rasterized and visually inspected.** Start from your own PowerShell and open the URL above for manual acceptance.

Still pending: credit/debit note issuance and correction resolution, advanced quotation acceptance/rejection, printable receipt and statement exports, uploaded attachments, formal schema migrations, account password change/recovery UX, production security review, e-invoicing/tax filings, PWA installation and Windows packaging. The PDF renderer uses embedded fonts and a ReportLab print layout; see PDF_GENERATION.md for runtime setup, supported scripts and QA. Company logos persist in SQLite and are included in database backups. The invoice preview and PDF share authoritative saved amounts but currently use different layouts. Daily backup configuration and a verified restore on your chosen real storage are still required.

## Source layout

```text
src/lib/            API and financial display helpers
src/components/     Shared accessible UI and document preview
src/features/       Auth, dashboard, billing, records, money and administration
server/db.mjs       SQLite schema and transactions
server/index.mjs    HTTP routing, authentication, permissions and workflows
server/money.mjs    Integer billing arithmetic
server/pdf.mjs      Snapshot-based PDF model / Python renderer bridge
server/backup.mjs   Encrypted backups, retention, testing and recovery
tests/              Calculation and connected request-handler regression tests
dist/               Built frontend; no CDN or external font dependency
```

## Product catalogue and invoice entry

Managers can open **Products & services → Add product / service**, select Product / goods, and save the name, specifications, SKU, HSN, unit, selling rate and GST rate. Staff can select saved items for their invoices; catalogue editing remains manager-only. Existing service records are preserved and continue to use SAC codes. No database reset or schema replacement is needed.

In **New invoice → Products & services**, use the search box or Browse to select a saved item. Its details populate an invoice row; enter the quantity and adjust the rate/discount if needed. You can mix products and services. The manager-only **New product** button creates and saves an item without leaving the editor, then adds it directly to the current invoice. Prices follow the invoice's inclusive/exclusive setting. Product metadata is saved into issued snapshots and included in preview/PDF. This is a billing catalogue, not an inventory or stock ledger.

Product workflow validation: build and eight tests pass, including mixed product/service issuing, metadata persistence, invalid HSN/type/unit rejection, staff catalogue restrictions, product edits not changing issued invoices and product PDF content. Browser interaction remains unverified in the restricted execution environment. Restart the running Node server after updating backend files, then refresh the browser.

Product HSN is optional in both catalogue entry and invoice issuing. If supplied, its format is validated; service SAC is also optional when saving or issuing.
