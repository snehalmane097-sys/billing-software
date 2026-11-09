# Professional document PDFs

The PDF endpoint uses `server/pdf.mjs` (snapshot and payment presentation model) and `server/documents/render.py` (a reusable ReportLab layout). It embeds TrueType fonts, original uploaded logo bytes, vector text, A4 tables with repeating headers, page numbering, customer/shipping panels, saved tax totals, payment allocations, words, bank details, notes, terms and a signature area. No browser process or external resource is needed.

The former renderer wrote fixed-position Helvetica text, discarded Unicode, wrapped by character count and paginated by a fixed number of lines. It had no real table or document layout system. It has been replaced.

## Runtime setup

Node 22.19+ and the existing npm dependencies are still required. PDF generation additionally requires Python 3.12+ with:

```powershell
python -m pip install -r server/documents/requirements.txt
```

Set `PDF_PYTHON` to the absolute Python executable if needed. This workstation already has the required ReportLab/Pillow runtime; it is detected automatically. Other machines should configure their own Python installation. Windows Arial/Arial Bold are embedded from the installed system fonts. Configure `PDF_FONT_REGULAR`, `PDF_FONT_BOLD`, and optionally `PDF_FONT_INDIC` for another OS or licensed business fonts. Rupee symbols and accented Unicode text are tested. Complex-script shaping is enabled if `uharfbuzz` is installed; Indic shaping has not been visually validated in this environment. No ASCII replacement is performed.

Restart `npm start` after backend changes. The frontend is rebuilt with `npm run build`. Downloads remain authenticated and scoped to the same records as before. Temporary JSON/PDF files use isolated OS temporary directories and are removed after the request. Render jobs are serialized and have a 45-second timeout.

## Authoritative values and historical records

The template does not call the billing calculator. Line taxable values, tax components, adjustments and totals come directly from the frozen issued snapshot. Payment/balance values come from current non-reversed allocations. Tax components and line aggregates are checked for consistency before rendering. Indian currency formatting and amount-in-words do not alter money values.

New calculations also persist gross amount and discount amounts using the same BigInt engine. Existing issued snapshots remain unchanged. A discounted legacy invoice without saved gross/discount amounts explicitly labels those unavailable breakdowns rather than inventing values; its saved taxable values and taxes remain authoritative.

Business Information now accepts optional bank, account, IFSC, UPI, terms and signatory details. These are frozen when a document is issued. Shipping details and document-specific terms are optional editor fields. No shipping override means Ship To uses Bill To. Missing HSN/SAC prints a dash. Later business/customer/logo edits do not rewrite issued documents. Therefore an invoice issued before a logo was configured correctly retains its historical company-name fallback.

The shared template has invoice, quotation, proforma, credit-note, debit-note and delivery-note configurations. Quotations/proformas are labelled as not being tax invoices; delivery notes omit money. Credit/debit/delivery issuance workflows are not enabled by this template change. Reverse-charge and cess calculation workflows remain outside the current billing scope; the renderer can display a saved cess value when supplied by a future validated workflow.

## Verification

`npm test` exercises exact calculations, duplicate submission protection, issuing, payments/reversals, record permissions, quote conversion, persistence and real encrypted backup restoration. PDF tests extract text/coordinates, compare formatted saved amounts, verify A4 geometry and page counters, detect empty/clipped pages, and check table-header repetition. Workflow tests upload PNG/JPEG/WebP logos through the real handler, persist and replace them, and rasterize their resulting invoice/quotation/proforma PDFs to verify visible pixels and aspect ratio.

Additional PDF cases include blank HSN/SAC, single/multiple lines, long descriptions/addresses/terms, CGST/SGST, IGST, inclusive/exclusive discounts, rounding, partial payments and reversal exclusion. The dependency for text QA is `pdfplumber`/`pypdf`; visual QA uses Poppler `pdftoppm` (set `PDFTOPPM` if not available through the installed runtime).

To export and check a real issued invoice without changing records:

```powershell
node --experimental-sqlite scripts/pdf-qa.mjs DOCUMENT_ID
```

This opens the source database read-only, compares every saved line rate/taxable/total and every displayed financial total against PDF text, and writes the PDF under `output/pdf`. It also creates a clearly synthetic multi-page sample with a sample logo. Outputs and real business data are excluded from the source package.

The live browser uses a separate compact editor preview; the downloaded PDF is the print-authoritative layout. Browser rendering/interaction of the new settings fields has not been visually verified. Backend tests and PDF raster checks do not establish full tax compliance or accounting support beyond the documented workflows.


Final validation (4 November 2026): npm run build passed; npm test passed all 14 tests. Read-only export of I2627/000001 matched every displayed saved monetary value and rendered as one A4 page. Synthetic 32-item logo/IGST/discount/partial-payment sample rendered as four pages. Final first/continuation/last-page PNGs were visually inspected. Live localhost session endpoint responded HTTP 200; the existing server process was not restarted or authenticated against for this update. Backend restart remains required before using the new renderer in that process.


Current layout update: standard financial PDFs now show Bill To beside document metadata, with no Ship To duplication. Delivery-note shipping support remains. This supersedes earlier descriptions of paired Bill To / Ship To panels. Protected archived proforma PDFs are available through the document versions list.
