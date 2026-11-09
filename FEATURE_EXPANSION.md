# Billing management expansion — 4 November 2026

This update extends the existing React/TypeScript, Node and SQLite application. It does not replace the project or seed real business records.

## Navigation and daily work

Navigation groups are Dashboard, Sales, Masters, Financials, Reports and Administration. Sales contains GST invoices, quotations and proformas; Masters contains customers, products and services. Groups collapse to reduce clutter. Unsupported sales orders, purchases, inventory and statutory correction-document modules are not exposed as empty buttons.

Invoice lists now support number/company/GSTIN search, document/payment status, overdue/outstanding, dates, sorting and SQL pagination. URL parameters preserve filters when a record is opened or edited. Details provide download, preview/print, share, payments/reversals, correction requests and scoped audit history. Sharing uses the browser's file share sheet when supported; otherwise it downloads the protected PDF for the user to attach. It never creates a public link or sends a customer message automatically.

The editor has a searchable customer selector, reusable product/service selection, a sticky action bar and collapsed optional item metadata. Drafts can be edited; issued GST invoices remain immutable. Existing correction requests are retained for manager review. Credit/debit note issuance and cancellation accounting are still separate unfinished modules, and no financial correction is silently applied by this update.

## Proformas

Proformas retain their own P-series identity and financial-year sequence. Drafts support customer, dates/validity, products/services, quantities, units, rates, discounts, GST, notes, terms, preview, PDF and print. An issued proforma can be revised by the manager with a reason until it is converted. The previous body, snapshot and version are stored in the additive `document_revisions` table, accessible through the versions list and protected historical PDFs. Staff cannot revise issued proformas. Regular version-conflict protection applies.

Conversion is transactional and idempotent. It revalidates and recalculates the original issued snapshot's items using the billing engine, preserves the source proforma and links a new GST draft. Repeated conversions open that same draft. The new invoice date defaults to today; an expired due date moves to today. Source customer details are retained on the resulting issued GST snapshot. GST numbering is assigned only through Review & Issue. Proformas and converted drafts do not appear in billed sales, receivables, account totals or GST reports. An expired proforma is not an overdue receivable.

## Products and services

Separate product and service management pages use the existing persisted catalogue table. Name, unit and selling rate are sufficient to save either type. HSN/SAC, GST, SKU, descriptions, category and other reference data remain optional. Search, sorting, pagination, details, before/after history, edit and activate/deactivate are connected to the database. Inactive items disappear from new invoice selection. Existing issued snapshots are unchanged by catalogue edits or activation changes.

Manager-only modifications, inactive-record access and sensitive purchase-price visibility are enforced in the backend. Staff may read active catalogue items and use them in permitted documents.

## Company accounts

Managers can search company name, GSTIN or contact name. Each account is anchored to the existing customer record ID; records are not merged merely because their names or GSTINs match. Archived customer records remain available for historical accounts.

Four account figures are derived from actual issued GST invoice and non-reversed payment rows: all-time invoiced, payments received, outstanding and overdue. These remain all-time figures while table filters change the selected invoices. The invoice view includes all/paid/unpaid/partially paid/overdue filters, dates, number search, sort, pagination, record details and PDFs.

Payment history retains reversal reasons. The dated ledger contains invoice debits, receipt credits and separate reversal debits, with opening/running/closing balances. Ledger date filters apply to event dates, not just invoice dates. A UTF-8 CSV account statement downloads the actual ledger and balances. The existing scoped customer statement remains available. Company-wide accounts, ledgers and exports are manager-only on the server.

## PDF layout

Standard financial documents show a single Bill To panel beside invoice metadata. There is no repeated Ship To section; the customer's real billing address, contact, GSTIN and state remain. Historical shipping data is retained in storage for future delivery-document use. The reusable delivery-note template can still show shipping information.

Warm ivory, white, sand and brown accents, embedded fonts, A4 geometry, original logo aspect ratio, repeating item headers and page numbers remain. The PDF uses saved financial values rather than a second tax calculation. The real invoice export script opens the production database read-only and verifies every displayed financial value. See PDF_GENERATION.md for Python/font requirements and script limitations.

## Setup and verification

```powershell
cd C:\billingsoftware
npm run build
npm test
npm start
```

Restart an existing server after backend updates, then reload http://localhost:3001/. Do not start independent application instances against a shared database. The schema additions are idempotent and preserve existing rows. SQLite backups cover the revision table as part of the database.

Automated management checks use disposable databases and cover required-only catalogue saves, editing and history, activation, staff restrictions, persisted pagination, exact company/ledger totals, all payment filters, partial payments and reversals, proforma editing/revision/history PDFs, duplicate conversion, separate numbering, report exclusion and an actual encrypted restore of archived versions. The existing calculation/security/backup/PDF regression suite remains in place.

Browser QA used a separate synthetic business and did not write to the user's business records. It verified the company-account summary and ledger, proforma list/detail/revision save, product management and required-only product creation. The editor was visually checked at desktop and 390px mobile width. OS share-sheet completion, physical printer output and every page at every responsive breakpoint are not claimed as tested.


Final verification — 4 November 2026: TypeScript/build passed (32 bundled modules). Full npm test passed 22/22 tests, including actual encrypted restoration of proforma versions and company balances. Required-only product saving and issued proforma revision saving were verified through the browser in a disposable business; company summary/ledger and the editor at 390px were inspected. The saved invoice I2627/000001 was exported read-only, matched every displayed saved financial value, and rendered as one A4 page with Bill To only. Existing localhost:3001 returned HTTP 200; that pre-existing process has not been restarted with this backend update. Restart it once before using the new modules.
