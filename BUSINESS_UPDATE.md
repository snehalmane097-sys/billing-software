# Product entry and company identity — 4 November 2026

This update supersedes older catalogue and design notes in the project history.

## Simple product and service creation

Open **Products & services**, choose **Add product / service**, then enter the name, unit and selling rate. Physical products default to **NOS**. Those are the only required business fields.

The expandable **Optional details** section holds HSN or SAC, SKU/service code, description, GST rate and category. Products also offer brand, purchase price, opening stock and minimum stock. Blank classification codes and tax rates do not prevent saving. No classification is generated automatically. Supplied codes still receive format validation. Purchase costs are hidden from staff. Stock fields are reference values; an inventory ledger is not implemented.

Search for a saved item in the invoice editor or create one using **New product**. Select it to fill the row, then enter the quantity. An unset catalogue GST rate remains unset; select the applicable invoice GST rate before issuing. An explicit zero rate is supported and distinct from an unspecified rate.

## Company logo

Open **Business information** in the manager administration menu. In **Company logo**, select a PNG, JPG or WebP image of up to **2 MB**, preview it and click **Save logo**. Use **Replace logo** or **Remove logo** as needed.

Original image bytes are stored in SQLite and included in encrypted database backups. The app uses the original image; PDFs embed an aspect-preserving RGB/alpha image derived at up to 1600 × 600 pixels. The application sidebar and A4 preview show the company logo. With no uploaded logo, the app shows its fallback mark and PDFs retain the business name.

Invoices, quotations and proformas share the document renderer. Each issued document saves its logo reference. Replacing/removing the current logo leaves the historical image available to its issued records. Logo actions are manager-only, version checked and audited.

## Design and validation

The current design uses warm ivory `#F5F0E8`, white, sand beige `#D5C4AE`, muted taupe `#A88462`, warm brown `#6B4A2E`, dark mocha `#3A2418` and espresso `#1A120E`, with subtle translucent panels.

Verified on 4 November 2026:

- TypeScript/build passes.
- All nine regression tests pass. The connected test covers saving, retrieving, editing and billing a three-field product and a service without SAC/GST.
- PNG, JPG and WebP uploads, invalid/mismatched types, size limits, manager permissions, replacement conflicts and removal are tested.
- SQLite reopening and encrypted restore retain actual logo bytes.
- Poppler rasterization checks visible logo pixels and aspect ratio in invoice, quotation and proforma PDFs. Rendered invoice pages were visually inspected.
- Historical PDFs retain their original logo after replacement/removal.

Tests use disposable records. Desktop/mobile interactive browser acceptance remains unverified due the execution environment's previous localhost restrictions; do not equate handler tests with a live browser check.

## Run the update

Restart the existing server from its terminal with **Ctrl+C**, then:

```powershell
cd C:\billingsoftware
npm start
```

Refresh **http://localhost:3001/** with **Ctrl+Shift+R**. The server requires Node.js 22.19+ and the installed `sharp` image dependency. The packaged Windows project includes dependencies and the built frontend. A fresh source checkout can use `npm ci` when registry access is available.

For the PDF rasterization regression test, Poppler's `pdftoppm` must be available on PATH, or set `PDFTOPPM` to its full executable path before `npm test`. Other computers may not have the bundled runtime path used during this session.

## Live catalogue check — 4 November 2026

The obsolete six-digit-SAC error string is absent from the current backend. A real HTTP regression now verifies both a three-field product and the screenshot-style optional fields with blank HSN/SAC, using an isolated temporary database. The frontend explains an outdated server explicitly if that legacy error is returned. Build and nine tests pass. A read-only check confirmed the user's Shell Pipe Ring FDS product exists with empty classification codes; no user product was created or changed during diagnosis. The active Chrome invoice editor was inspected without changing its draft.
