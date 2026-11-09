# Search & Manage GST Invoices

The invoice route now has date presets, from/to dates, automatic number/company/GSTIN search, payment/document filters, server pagination and sorting. Checkbox selection persists across pages and clears on record-filter changes. The fixed bottom summary aggregates all matches before pagination; drafts/cancelled records are excluded from financial totals and identified separately. Collected means active allocations on matching invoices, irrespective of receipt date; dates filter invoice dates. Partial payments and overdue conditions remain separate.

Manager CSV export supports 100 selected invoices; PDF printing and reviewed batch payments support 25. PDF batches use saved financial values and snapshots. Payments are atomic and idempotent with server-side permissions and changed-balance checks. Draft archiving/restoration requires reasons and versions; issued records cannot be archived here.

Manager internal cancellation is restricted to current-month issued invoices without active payments, with supply/external-reporting/tax-review attestations and reasons. Original snapshots/numbers remain; ledger credits and cancellation-labelled PDFs reconcile balances. It does not cancel GST portal/IRN/e-way-bill filings. Credit/debit accounting workflows remain pending.

Preserve data, configuration, keys and backups. Build with npm run build, then restart the known billing terminal with Ctrl+C followed by npm start. Open http://localhost:3001/#invoices. Do not start a second production instance or terminate unrelated processes. The frontend explains when a running older backend requires restart.

See INVOICE_MANAGEMENT_CHECKPOINT.md for actual current verification and remaining live/browser limitations. Tests isolate databases and cover calculations, persistence, PDF consistency, all filters, all-page totals, batch permissions/idempotency/rollback, archival/cancellation and actual encrypted recovery. No real records are seeded. Website uses Teal & Ivory; PDFs retain printer-friendly warm ivory/brown branding.
