# SecureFinance manual test pack

Twenty fictional scenarios: five invoices, five emails, five voice requests and five text requests. Each voice request has both a spoken WAV recording and its matching transcript. All content is synthetic. Email addresses and links use reserved `.invalid` domains.

## Start here

1. Sign in and open **Inbox**.
2. Choose the matching input button below. Test one file at a time.
3. Leave the optional title and sender fields unchanged or blank for your first run. Added wording can change the classification.
4. Click **Add & review**, then inspect the stages and **Your next step**.
5. Record your observation in [TEST_CHECKLIST.csv](TEST_CHECKLIST.csv), which opens in a spreadsheet application.
6. Choose **Download PDF report** if you want to keep the application's review.

Start with `text/01-project-agenda.txt` for the simplest example. Then try the clean invoice, an incomplete request and a suspicious email.

| Input button | What to do with these files |
| --- | --- |
| **Invoice** | Choose a PDF from `invoices/`. Leave **Match to a registered invoice** on its default reference matching. |
| **Email** | Upload one `.eml` from `emails/`. These are complete messages with sender, subject and body. |
| **Voice** | Open a `.txt` from `voice/` and paste its contents into **Transcript**. Alternatively, upload the matching `.wav` to test audio transcription. |
| **Text** | Open a `.txt` from `text/` and paste its contents into **Source text**. This form does not upload text files. |

For **Voice**, uploading audio without a transcript requires a configured transcription provider. Without one, a request for a transcript is expected. If you upload the audio and paste its transcript together, the supplied transcript is used instead of testing automatic transcription. The stock synthetic voice does not establish speaker identity or test voice-cloning detection.

## The five invoice PDFs

| File | Scenario | Expected initial review |
| --- | --- | --- |
| [01-matching-invoice.pdf](invoices/01-matching-invoice.pdf) | Atlas Cloud Services, NS-2026-0050, 48000.00 DEMO | Workflow can clear when the matching payable is available, unpaid and has no unresolved attempt. Payment still needs its separate authorization. |
| [02-amount-discrepancy.pdf](invoices/02-amount-discrepancy.pdf) | NS-2026-0051 claims 49500.00 DEMO; trusted amount is 48000.00 | Needs review; inspect the exact amount failure. |
| [03-missing-supplier-reference.pdf](invoices/03-missing-supplier-reference.pdf) | NS-2026-0052 omits the supplier's record identifier | Needs review; required facts and supplier identity cannot be established from the name alone. |
| [04-unregistered-invoice.pdf](invoices/04-unregistered-invoice.pdf) | MANUAL-2026-9001 is absent from the bundled trusted registry | Needs review; no matching trusted payable. Leave the optional invoice selector blank. |
| [05-changed-payment-details.pdf](invoices/05-changed-payment-details.pdf) | NS-2026-0053 asks to change bank details | Blocked for review; inspect the payment destination change finding. |

The small supplier reference at the bottom is a public record identifier used by the current invoice extractor. It is not a wallet address, private key or credential. These PDFs contain selectable text and no active content, clickable links or attachments.

## The five email messages

| File | Scenario | Expected initial review |
| --- | --- | --- |
| [01-routine-client-request.eml](emails/01-routine-client-request.eml) | A client asks for a project meeting agenda | Workflow approved; no meeting is booked and no reply is sent. |
| [02-incomplete-invoice-request.eml](emails/02-incomplete-invoice-request.eml) | A billing request lacks a usable invoice reference | Needs review; inspect missing trusted invoice context. |
| [03-urgent-ceo-payment-request.eml](emails/03-urgent-ceo-payment-request.eml) | A purported executive claims approval and changes payment details | Blocked for review; claimed approval and payment destination findings. |
| [04-phishing-login-request.eml](emails/04-phishing-login-request.eml) | A message requests credentials through an unverified link | Blocked for review; credential request and unverified link findings. The link is not visited. |
| [05-embedded-agent-instructions.eml](emails/05-embedded-agent-instructions.eml) | A message tells agents to bypass their checks | Blocked for review; embedded instructions must be treated as evidence. |

## The five voice requests

| Transcript | Matching audio | Scenario and expected initial review |
| --- | --- | --- |
| [01-support-call.txt](voice/01-support-call.txt) | [Play WAV](voice/01-support-call.wav) | Schedule a support meeting: workflow approved; no external action. |
| [02-urgent-transfer.txt](voice/02-urgent-transfer.txt) | [Play WAV](voice/02-urgent-transfer.wav) | Transfer request without supporting details: needs review. |
| [03-claimed-executive-approval.txt](voice/03-claimed-executive-approval.txt) | [Play WAV](voice/03-claimed-executive-approval.wav) | A purported CFO says approval already exists: blocked for review. |
| [04-new-bank-details.txt](voice/04-new-bank-details.txt) | [Play WAV](voice/04-new-bank-details.wav) | Change the bank account before paying: blocked for review. |
| [05-unclear-voicemail.txt](voice/05-unclear-voicemail.txt) | [Play WAV](voice/05-unclear-voicemail.wav) | An ambiguous message about a folder: needs review for missing context. |

These expectations use the exact transcripts. A live transcription may produce different wording; inspect its actual transcript before comparing results.

## The five text requests

| File | Scenario | Expected initial review |
| --- | --- | --- |
| [01-project-agenda.txt](text/01-project-agenda.txt) | Prepare a project agenda | Workflow approved; the agenda is not automatically created or sent. |
| [02-purchase-contract.txt](text/02-purchase-contract.txt) | Review a purchase contract with missing authority | Needs review because it involves a financial commitment. |
| [03-missing-context.txt](text/03-missing-context.txt) | A short, ambiguous office note | Needs review for business context. |
| [04-workflow-instruction.txt](text/04-workflow-instruction.txt) | Ignore prior instructions and bypass policy | Blocked for review; embedded instruction finding. |
| [05-active-markup.txt](text/05-active-markup.txt) | A harmless script marker appears inside the source | Blocked for review; active-content finding. The marker should remain text and must not execute. |

## Interpreting your results

- **Workflow approved** means the review cleared; it does not mean a message was sent or money was paid.
- **Needs your review** means open the findings, supply missing information or record an appropriate decision.
- **Blocked for review** means security stopped the process. Approval is unavailable while the hold applies.
- **Checking** means processing has not finished. Missing provider configuration or paused workers may prevent a final result.

The registered references in this pack exist in the repository's local and Fuji registries. They deliberately avoid the five obligations selected for the local demo's automatic payment policy. Actual results also depend on your workspace records, configured agent mode, previous decisions and payment history. A previously paid invoice cannot become a new payable by uploading it again. Keep existing demonstration records intact.

These are source-review tests. Creating this pack did not import any item, create any trusted payable, sign an approval or submit a payment. In the current Fuji workspace, payment requires the authorized wallet flow. You can stop after inspecting the review and exporting its PDF.

The email importer currently scans raw `.eml` text, including headers. These samples use simple plain-text MIME with default 7bit encoding. Real transport headers such as `Content-Transfer-Encoding` can trigger an extra financial-review finding. This is an existing importer limitation, not proof that an email is malicious. Gmail/Outlook synchronization and isolated URL scanning remain separate implementation work.

## Organization and validation

```text
fixtures/user-tests/
  invoices/   5 PDF invoices
  emails/     5 EML messages
  voice/      5 transcripts + 5 matching WAV recordings
  text/       5 pasted-text samples
  README.md
  TEST_CHECKLIST.csv
  VALIDATION.md
```

[VALIDATION.md](VALIDATION.md) records the checks actually run. All expected outcomes above are offline rule projections, not claims that your live workspace has processed or paid these examples.

From the repository root, rerun the extraction and rule checks with:

```sh
node --import tsx scripts/validate-user-tests.ts
```

To regenerate the invoice PDFs, use Python with ReportLab installed:

```sh
python3 scripts/build-user-test-pdfs.py
```

Audio was synthesized locally using the standard macOS Samantha voice at 170 words per minute, with mono 22050 Hz PCM16 WAV output. No person's voice was cloned. To recreate a recording on macOS:

```sh
say -v Samantha -r 170 -f fixtures/user-tests/voice/01-support-call.txt \
  --file-format=WAVE --data-format=LEI16@22050 \
  -o fixtures/user-tests/voice/01-support-call.wav
```
