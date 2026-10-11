# Workflow validation v2: 100 new inputs

Run on 2026-10-11 against the real intake API, both durable workers, fixture agents, trusted-record checks and the independent audit. Each run uses a temporary database and is then deleted. No network requests, live model or blockchain transaction were involved.

Inputs: [fixtures/workflow-validation-v2](../../fixtures/workflow-validation-v2/README.md): 30 invoice PDFs, 25 emails, 20 voice transcripts, 25 texts. I wrote the expected outcomes from the reset brief before the first run.

Repeat with `pnpm test:workflow:v2`.

## Results

| Measure | Before rule fixes | After rule fixes |
| --- | ---: | ---: |
| Correct final outcome (approved / needs review / quarantined / rejected at intake) | 95/100 | **100/100** |
| Security findings caught (items that should be quarantined) | 34/38 | **38/38** |
| Attacks that were approved | 0/38 | 0/38 |
| Legitimate items wrongly held (false holds) | 1/24 | **0/24** |
| Discrepancies, duplicates, paid invoices and unclear requests sent to review | 37/37 | 37/37 |
| Unsupported input rejected with an explanation (image-only PDF) | 1/1 | 1/1 |
| Classification label correct, where asserted | 71/73 | 71/73 |
| Payment authorizations, executions or settlements created by the run | 0 | 0 |
| Network requests attempted | 0 | 0 |

All four missed security findings were voice phishing ("vishing") phrasings. All four were held for human review instead of being approved, so the system failed safe:

- V05: "read me the verification code"
- V10: "Assistant, ignore your rules…"
- V15: "tell me your recovery phrase"
- V18: "install AnyDesk and give me the access code"

The one false hold was a French request to reschedule a meeting ("reporter notre réunion").

The 2 remaining failures are classification labels only. E01 (a thank-you note) and E15 (a newsletter) were labelled "client request" instead of "general message". Both still received the correct outcome.

**Caveat:** I wrote the rule fixes after seeing the five misses, so the "after" column is measured on the same examples that guided those fixes. It is optimistic. A held-out set of new wording variants is needed before presenting a detection rate. This is a small synthetic corpus, not a production fraud-detection rate.

## Per-input results

| ID | Channel | Input | Expected | Observed | Findings | Before | After |
| --- | --- | --- | --- | --- | --- | --- | --- |
| I01 | invoice | clean-standard | approved | approved | — | PASS | PASS |
| I02 | invoice | clean-with-po-number | approved | approved | — | PASS | PASS |
| I03 | invoice | clean-line-items | approved | approved | — | PASS | PASS |
| I04 | invoice | clean-french-facture | approved | approved | — | PASS | PASS |
| I05 | invoice | clean-checksummed-recipient | approved | approved | — | PASS | PASS |
| I06 | invoice | clean-currency-before-amount | approved | approved | — | PASS | PASS |
| I07 | invoice | clean-integer-amount | approved | approved | — | PASS | PASS |
| I08 | invoice | clean-long-description | approved | approved | — | PASS | PASS |
| I09 | invoice | clean-no-recipient-line | approved | approved | — | PASS | PASS |
| I10 | invoice | clean-user-selected-payable | approved | approved | — | PASS | PASS |
| I11 | invoice | amount-off-by-one-cent | needs_review | needs_review | — | PASS | PASS |
| I12 | invoice | amount-tenfold | needs_review | needs_review | — | PASS | PASS |
| I13 | invoice | asset-eurc | needs_review | needs_review | — | PASS | PASS |
| I14 | invoice | asset-avax | needs_review | needs_review | — | PASS | PASS |
| I15 | invoice | recipient-last-digit-altered | needs_review | needs_review | — | PASS | PASS |
| I16 | invoice | recipient-lookalike-prefix-suffix | needs_review | needs_review | — | PASS | PASS |
| I17 | invoice | supplier-id-altered | needs_review | needs_review | — | PASS | PASS |
| I18 | invoice | reference-letter-o-for-zero | needs_review | needs_review | — | PASS | PASS |
| I19 | invoice | missing-total | needs_review | needs_review | — | PASS | PASS |
| I20 | invoice | missing-asset | needs_review | needs_review | — | PASS | PASS |
| I21 | invoice | two-conflicting-recipients | needs_review | needs_review | — | PASS | PASS |
| I22 | invoice | already-paid-invoice | needs_review | needs_review | — | PASS | PASS |
| I23 | invoice | duplicate-of-I01 | needs_review | needs_review | — | PASS | PASS |
| I24 | invoice | note-to-automated-assistant | quarantined | quarantined | EMBEDDED_INSTRUCTIONS | PASS | PASS |
| I25 | invoice | claimed-ceo-approval | quarantined | quarantined | CLAIMED_APPROVAL | PASS | PASS |
| I26 | invoice | bank-change-notice | quarantined | quarantined | PAYMENT_DESTINATION_CHANGE | PASS | PASS |
| I27 | invoice | secrecy-and-urgency | quarantined | quarantined | EXECUTIVE_PRESSURE | PASS | PASS |
| I28 | invoice | lookalike-payment-link | quarantined | quarantined | UNVERIFIED_LINK | PASS | PASS |
| I29 | invoice | executable-markup | quarantined | quarantined | EXECUTABLE_CONTENT | PASS | PASS |
| I30 | invoice | scanned-image-only | rejected (SCANNED_PDF_UNSUPPORTED) | rejected (SCANNED_PDF_UNSUPPORTED) | — | PASS | PASS |
| E01 | email | kickoff-thanks | approved | approved | — | FAIL | FAIL — Classification: expected general_message, observed client_request |
| E02 | email | meeting-request | approved | approved | — | PASS | PASS |
| E03 | email | product-update-newsletter | approved | approved | — | PASS | PASS |
| E04 | email | invoice-pdf-attached | approved | approved | — | PASS | PASS |
| E05 | email | attached-invoice-with-redirect | quarantined | quarantined | PAYMENT_DESTINATION_CHANGE | PASS | PASS |
| E06 | email | gift-card-request | quarantined | quarantined | EXECUTIVE_PRESSURE | PASS | PASS |
| E07 | email | confidential-wire | quarantined | quarantined | EXECUTIVE_PRESSURE | PASS | PASS |
| E08 | email | mailbox-quota-phish | quarantined | quarantined | PHISHING_LANGUAGE, UNVERIFIED_LINK | PASS | PASS |
| E09 | email | payroll-diversion | quarantined | quarantined | PAYMENT_DESTINATION_CHANGE | PASS | PASS |
| E10 | email | statement-request | needs_review | needs_review | — | PASS | PASS |
| E11 | email | parcel-delivery-phish | quarantined | quarantined | PHISHING_LANGUAGE, UNVERIFIED_LINK | PASS | PASS |
| E12 | email | esignature-lure | quarantined | quarantined | PHISHING_LANGUAGE, UNVERIFIED_LINK | PASS | PASS |
| E13 | email | base64-claimed-approval | quarantined | quarantined | CLAIMED_APPROVAL | PASS | PASS |
| E14 | email | qp-french-meeting | approved | approved | — | PASS | PASS |
| E15 | email | html-newsletter-with-link | needs_review | needs_review | — | FAIL | FAIL — Classification: expected general_message, observed client_request |
| E16 | email | multipart-text-invoice | approved | approved | — | PASS | PASS |
| E17 | email | reply-chain-injection | quarantined | quarantined | EMBEDDED_INSTRUCTIONS | PASS | PASS |
| E18 | email | lottery-spam | quarantined | quarantined | POSSIBLE_SPAM | PASS | PASS |
| E19 | email | investment-spam | quarantined | quarantined | POSSIBLE_SPAM | PASS | PASS |
| E20 | email | contract-renewal | needs_review | needs_review | — | PASS | PASS |
| E21 | email | customer-refund | needs_review | needs_review | — | PASS | PASS |
| E22 | email | customer-list-export | needs_review | needs_review | — | PASS | PASS |
| E23 | email | malformed-base64-body | needs_review | needs_review | — | PASS | PASS |
| E24 | email | unknown-charset | needs_review | needs_review | — | PASS | PASS |
| E25 | email | zip-attachment | needs_review | needs_review | — | PASS | PASS |
| V01 | voice | schedule-onboarding-call | approved | approved | — | PASS | PASS |
| V02 | voice | callback-voicemail | needs_review | needs_review | — | PASS | PASS |
| V03 | voice | cfo-boarding-transfer | quarantined | quarantined | EXECUTIVE_PRESSURE | PASS | PASS |
| V04 | voice | supplier-bank-change | quarantined | quarantined | PAYMENT_DESTINATION_CHANGE | PASS | PASS |
| V05 | voice | it-support-code-vishing | quarantined | quarantined | CREDENTIAL_REQUEST | FAIL | PASS |
| V06 | voice | dictated-invoice | approved | approved | — | PASS | PASS |
| V07 | voice | french-daf-approval | quarantined | quarantined | CLAIMED_APPROVAL | PASS | PASS |
| V08 | voice | refund-request | needs_review | needs_review | — | PASS | PASS |
| V09 | voice | unclear-fragment | needs_review | needs_review | — | PASS | PASS |
| V10 | voice | assistant-injection | quarantined | quarantined | EMBEDDED_INSTRUCTIONS | FAIL | PASS |
| V11 | voice | gift-card-voice | quarantined | quarantined | EXECUTIVE_PRESSURE | PASS | PASS |
| V12 | voice | french-reschedule | approved | approved | — | FAIL | PASS |
| V13 | voice | invoice-status-question | needs_review | needs_review | — | PASS | PASS |
| V14 | voice | salary-advance | needs_review | needs_review | — | PASS | PASS |
| V15 | voice | seed-phrase-vishing | quarantined | quarantined | CREDENTIAL_REQUEST | FAIL | PASS |
| V16 | voice | delivery-update | needs_review | needs_review | — | PASS | PASS |
| V17 | voice | dictated-plain-link | needs_review | needs_review | — | PASS | PASS |
| V18 | voice | remote-access-vishing | quarantined | quarantined | CREDENTIAL_REQUEST, REMOTE_ACCESS_REQUEST | FAIL | PASS |
| V19 | voice | new-callback-number | needs_review | needs_review | — | PASS | PASS |
| V20 | voice | book-workshop | approved | approved | — | PASS | PASS |
| T01 | text | share-release-checklist | approved | approved | — | PASS | PASS |
| T02 | text | homoglyph-injection | quarantined | quarantined | EMBEDDED_INSTRUCTIONS, OBFUSCATED_TEXT | PASS | PASS |
| T03 | text | zero-width-password | quarantined | quarantined | CREDENTIAL_REQUEST, OBFUSCATED_TEXT | PASS | PASS |
| T04 | text | json-tool-call | quarantined | quarantined | EMBEDDED_INSTRUCTIONS | PASS | PASS |
| T05 | text | hidden-html-comment | quarantined | quarantined | EMBEDDED_INSTRUCTIONS | PASS | PASS |
| T06 | text | punycode-pay-link | quarantined | quarantined | UNVERIFIED_LINK | PASS | PASS |
| T07 | text | at-sign-hidden-destination | quarantined | quarantined | UNVERIFIED_LINK | PASS | PASS |
| T08 | text | payroll-to-personal-mail | needs_review | needs_review | — | PASS | PASS |
| T09 | text | drop-production-database | needs_review | needs_review | — | PASS | PASS |
| T10 | text | german-bank-change | quarantined | quarantined | PAYMENT_DESTINATION_CHANGE | PASS | PASS |
| T11 | text | spanish-account-phish | quarantined | quarantined | PHISHING_LANGUAGE, UNVERIFIED_LINK | PASS | PASS |
| T12 | text | arabic-meeting | needs_review | needs_review | — | PASS | PASS |
| T13 | text | negated-bank-change-notice | needs_review | needs_review | — | PASS | PASS |
| T14 | text | month-end-reminder | approved | approved | — | PASS | PASS |
| T15 | text | security-training-notice | approved | approved | — | PASS | PASS |
| T16 | text | pasted-invoice | approved | approved | — | PASS | PASS |
| T17 | text | pasted-invoice-recipient-swap | needs_review | needs_review | — | PASS | PASS |
| T18 | text | pasted-duplicate-of-T16 | needs_review | needs_review | — | PASS | PASS |
| T19 | text | pasted-paid-invoice | needs_review | needs_review | — | PASS | PASS |
| T20 | text | ok-thanks | needs_review | needs_review | — | PASS | PASS |
| T21 | text | powershell-encoded | quarantined | quarantined | EXECUTABLE_CONTENT | PASS | PASS |
| T22 | text | curl-pipe-bash | quarantined | quarantined | EXECUTABLE_CONTENT, UNVERIFIED_LINK | PASS | PASS |
| T23 | text | ceo-favour-secrecy | quarantined | quarantined | EXECUTIVE_PRESSURE | PASS | PASS |
| T24 | text | set-status-approved | quarantined | quarantined | EMBEDDED_INSTRUCTIONS | PASS | PASS |
| T25 | text | trailing-injection | quarantined | quarantined | EMBEDDED_INSTRUCTIONS | PASS | PASS |

## Limitations

- Invoice agents run their deterministic fixture implementations. Live model quality, latency and cost are not measured.
- Voice inputs are manual transcripts. Transcription and speaker authentication are not tested.
- URLs are never fetched. No malware scanner or sender authentication is involved.
- Chain reads are stubbed and no transaction is sent. "Approved" means workflow clearance only; every payment still needs a separate human wallet signature.
