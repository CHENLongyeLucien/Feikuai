# Readable review reports

Open **History & reports**, find a message or invoice, then choose **Download PDF**. **Read review** opens the associated record. Inbox details and payment review also offer **Download PDF report**. No file conversion or technical upload is needed for these reports.

The first page contains the request identity and recorded outcome. Subsequent pages include recorded checks, findings, human decisions, provenance and a reading copy of the source. Reports use the same forest/sage visual system as the application, with embedded fonts, wrapping text and numbered pages.

## What the report represents

A PDF is a reading copy of the application's records at export time. Workflow approval, payment authorization, transaction execution and verified settlement remain distinct. A source revision does not make an older check current. Recorded agent methods and audit timestamps remain historical; report export does not rerun agents or contact the blockchain.

Addresses, long technical hashes and link destinations are replaced with labelled markers in the reading copy. No clickable PDF annotations, scripts or attachments are emitted. The original source and cryptographic records remain available in the restricted technical workflow. Latin, Greek and Cyrillic examples were exercised; glyphs outside the embedded font coverage are shown explicitly as Unicode code points instead of being silently dropped. This is not a claim of full-language typography support.

The advanced verifier still accepts the original technical evidence formats. Its results retain separate integrity, signature, authority and settlement coverage. A PDF is not substituted for a signed approval request or a verifiable evidence bundle.

## Implementation

- `GET /api/v1/inbox/:id/report.pdf`: source, specialist stages, findings, human decisions and linked payment observations.
- `GET /api/v1/cases/:id/report.pdf`: invoice identity, version-aware business checks, recorded agent work, authority and execution/settlement observations.
- Both routes require an authenticated workspace membership and tenant access, snapshot their records before rendering, and return `application/pdf`, `Cache-Control: no-store` and attachment headers.
- PDFKit is a server dependency; its fonts resolve from the existing Inter package in both source and bundled runtime builds. No browser runtime or Python dependency is required in production.
- The report library currently lists up to the latest 100 inbox items and labels that limit when older records exist. Individual source pages retain report downloads.

## Validation

The complete unit/API suite passed **191/191**, including **10 PDF tests** for authentication, cross-tenant isolation, stale revisions, safe source handling, payment-state separation, no network calls, PDF structure and mixed-font pagination. The final focused PDF rerun passed 10/10. TypeScript, ESLint and production builds passed; the existing large-chunk build warning remains.

Browser checks passed **6/6** across Chrome, Firefox and WebKit at desktop (1440px) and phone (390px) widths. They downloaded actual inbox and invoice PDFs, checked individual review downloads, search, filters, error recovery, mobile fit and collapsed advanced verification. These checks used a copy of the saved demo database, with workers and seeding disabled. Only local test sign-in sessions were written to that copy. No financial action was performed.

All 16 rendered pages of the 4-page invoice, 4-page held email and 8-page mixed-alphabet stress samples were inspected. An initial continued-font overlap was corrected with measured line layout and a non-overlap regression assertion. Test files, extracted records, PNGs and raw browser reports remain ignored locally under `var/pdf-qa/` and `var/pdf-report-qa/`.

Run the focused checks against an already-running isolated demo with saved records:

```sh
pnpm exec vitest run tests/api/reports.test.ts
pnpm exec playwright test --config tests/e2e/reports.config.ts
```

`SF_DESIGN_WEB_URL` selects a separate preview URL. The browser suite does not create invoices or initiate payments.
