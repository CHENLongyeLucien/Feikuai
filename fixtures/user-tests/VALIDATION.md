# Validation performed - 11 October 2026

**20 of 20 offline source checks passed.** This validates fixture structure, extraction and the stated rule scenarios. It is not a live-provider, browser-import, wallet or settlement acceptance run.

| Check | Actual result |
| --- | --- |
| Source counts | Five invoice PDFs, five EML messages, five voice transcripts, five text messages; five additional WAVs match the transcripts. |
| PDF extraction | All five pass the application's bounded PDF.js extractor and fixture invoice-field extraction. Each has one selectable-text page. |
| Invoice facts | Matching invoice, amount mismatch, missing supplier reference and unknown reference produce the intended comparisons against the committed local registry. |
| Security rules | Expected security codes match exactly across all 20 source samples. Links use reserved `.invalid` domains. No link was fetched. |
| Finance projections | All 20 match their documented projected outcome. The clean-invoice projection assumes fresh, matching, unpaid records with no pending execution. |
| PDF structure and visual review | All five rendered with PyMuPDF and were visually inspected. No clipped or overlapping text; no page annotations, attachments or document open action were emitted. |
| Email structure | Five valid single-part, plain-text MIME messages; ASCII content, CRLF endings, unique message IDs and no attachments. |
| Audio structure | Five valid, non-silent mono 22050 Hz PCM16 WAVs, generated from the paired transcripts using stock local speech synthesis. |

Audio lengths: support call 13.6 seconds; urgent transfer 13.3 seconds; claimed executive approval 13.4 seconds; new bank details 14.4 seconds; unclear voicemail 7.9 seconds. Audio transcription accuracy and speaker identity were not tested.

The initial email fixtures included an explicit `Content-Transfer-Encoding: 8bit` header. The raw-text importer classified its word `Transfer` as financial scope. The final fixtures use valid default 7bit encoding and the routine email now clears the offline rule check. The underlying importer limitation is documented in the guide; application code was not changed.

The reproducible validator is `scripts/validate-user-tests.ts`. It reads only the fixture files and committed public local registry, invokes the existing extraction/classification/security/finance functions and compares expected outcomes. It does not read `.env`, open a database, call an API, contact a model provider, or connect to a chain. Rendered previews and raw logs remain under ignored `var/user-tests-qa/` and `var/user-tests-validation.log`.
