# 100-input workflow validation corpus

Exactly 25 Invoice PDFs, 25 Email .eml files, 25 Voice transcripts, and 25 Text messages. Every file has distinct source content and an authored expected result. These are synthetic inputs; all URL hosts use the reserved example.invalid domain. Attack examples are inert source text, not active PDF payloads.

Run from the project root:

```sh
pnpm test:workflow
# Or: npm run test:workflow
```

The runner authenticates a synthetic test member and submits all 100 files/transcripts through the actual intake API. It creates a temporary SQLite database, trusted payable records, deployment manifest and artifact directory; runs both durable inbox and payment-analysis workers; reads outcomes back through the API; and then removes its temporary state. Nothing is submitted to an existing service, live model or blockchain. It writes a results report under ignored var/workflow-validation/.

Approved means workflow clearance only. Every registered payable here is 10 DEMO and still requires separate wallet authorization. The runner verifies zero authorizations, execution requests, settlements and automatic-payment records. Voice files are manual transcripts; this does not measure speech transcription or speaker authenticity. Email sender identity and links remain unverified.

The fixture registry is created only inside the isolated runner. Uploading these samples into a normal workspace without matching trusted records correctly produces invoice review holds. Use the ordinary Invoice/Email/Voice/Text buttons to inspect messages manually; do not copy the test registry into a funded environment.

The test driver uses reserved documentation IP addresses in groups of ten to exercise 100 authenticated inputs without changing the production intake rate limit. It does not benchmark rate limiting. Waiting-job clocks are advanced in the temporary database; no production scheduling state changes.

Regenerate reproducibly with `pnpm fixtures:workflow` (or `npm run fixtures:workflow`). The same 100 scenarios and one global safety assertion also run in `tests/api/workflow-validation.test.ts`. See [recorded validation results](../../docs/workflow-validation/README.md). The JSON manifest is for the automated test driver; users can use this index and the PDF/EML/TXT inputs directly. Expectations are authored in the corpus, never copied from observed implementation output.

| ID | Input | Expected classification | Expected outcome | Reason |
| --- | --- | --- | --- | --- |
| I01 | [exact-match](invoices/01-exact-match.pdf) | invoice | approved | Unambiguous invoice facts match the independently seeded 10-DEMO payable. Workflow clearance only; a separate wallet signature is still required. |
| I02 | [invoice-number-label](invoices/02-invoice-number-label.pdf) | invoice | approved | Unambiguous invoice facts match the independently seeded 10-DEMO payable. Workflow clearance only; a separate wallet signature is still required. |
| I03 | [invoice-no-label](invoices/03-invoice-no-label.pdf) | invoice | approved | Unambiguous invoice facts match the independently seeded 10-DEMO payable. Workflow clearance only; a separate wallet signature is still required. |
| I04 | [french-field-labels](invoices/04-french-field-labels.pdf) | invoice | approved | Unambiguous invoice facts match the independently seeded 10-DEMO payable. Workflow clearance only; a separate wallet signature is still required. |
| I05 | [extra-whitespace](invoices/05-extra-whitespace.pdf) | invoice | approved | Unambiguous invoice facts match the independently seeded 10-DEMO payable. Workflow clearance only; a separate wallet signature is still required. |
| I06 | [six-decimal-amount](invoices/06-six-decimal-amount.pdf) | invoice | approved | Unambiguous invoice facts match the independently seeded 10-DEMO payable. Workflow clearance only; a separate wallet signature is still required. |
| I07 | [optional-recipient-omitted](invoices/07-optional-recipient-omitted.pdf) | invoice | approved | Unambiguous invoice facts match the independently seeded 10-DEMO payable. Workflow clearance only; a separate wallet signature is still required. |
| I08 | [missing-amount](invoices/08-missing-amount.pdf) | invoice | needs_review | The amount is absent; request a corrected invoice. |
| I09 | [missing-supplier-reference](invoices/09-missing-supplier-reference.pdf) | invoice | needs_review | The trusted supplier identity cannot be established. |
| I10 | [missing-invoice-reference](invoices/10-missing-invoice-reference.pdf) | invoice | needs_review | An explicitly selected payable does not excuse an absent source invoice identity. |
| I11 | [amount-mismatch](invoices/11-amount-mismatch.pdf) | invoice | needs_review | The source amount differs from the registered 10 DEMO. |
| I12 | [wrong-asset](invoices/12-wrong-asset.pdf) | invoice | needs_review | USD cannot authorize a DEMO payable. |
| I13 | [recipient-mismatch](invoices/13-recipient-mismatch.pdf) | invoice | needs_review | The source recipient differs from the trusted supplier. |
| I14 | [supplier-mismatch](invoices/14-supplier-mismatch.pdf) | invoice | needs_review | The source supplier key differs from the registered supplier. |
| I15 | [unregistered-reference](invoices/15-unregistered-reference.pdf) | invoice | needs_review | No trusted payable has this reference. |
| I16 | [zero-amount](invoices/16-zero-amount.pdf) | invoice | needs_review | A zero amount cannot satisfy the registered payable. |
| I17 | [negative-amount](invoices/17-negative-amount.pdf) | invoice | needs_review | A negative amount is not an eligible payment. |
| I18 | [ambiguous-amount-prose](invoices/18-ambiguous-amount-prose.pdf) | invoice | needs_review | Ambiguous amount prose requires clarification. |
| I19 | [conflicting-amount-lines](invoices/19-conflicting-amount-lines.pdf) | invoice | needs_review | Conflicting amount claims cannot be reduced to the first match. |
| I20 | [conflicting-invoice-references](invoices/20-conflicting-invoice-references.pdf) | invoice | needs_review | Two different invoice references require review. |
| I21 | [workflow-instruction](invoices/21-workflow-instruction.pdf) | invoice | quarantined | Document instructions cannot change payment authority. |
| I22 | [forged-executive-approval](invoices/22-forged-executive-approval.pdf) | invoice | quarantined | Source prose is not an authenticated approval. |
| I23 | [bank-detail-change](invoices/23-bank-detail-change.pdf) | invoice | quarantined | Account changes need independent verification. |
| I24 | [unverified-link](invoices/24-unverified-link.pdf) | invoice | needs_review | A link must not be declared safe without an isolated scanner, so a person reviews it; a plain link is not a security hold by itself. |
| I25 | [active-markup](invoices/25-active-markup.pdf) | invoice | quarantined | Active source content is quarantined, never executed. |
| E01 | [support-meeting](emails/01-support-meeting.eml) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| E02 | [delivery-question](emails/02-delivery-question.eml) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| E03 | [project-agenda](emails/03-project-agenda.eml) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| E04 | [documentation-request](emails/04-documentation-request.eml) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| E05 | [reschedule-workshop](emails/05-reschedule-workshop.eml) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| E06 | [status-announcement](emails/06-status-announcement.eml) | general_message | needs_review | Insufficient context requires a human decision; no purpose or missing fact may be invented. |
| E07 | [incomplete-message](emails/07-incomplete-message.eml) | general_message | needs_review | Insufficient context requires a human decision; no purpose or missing fact may be invented. |
| E08 | [refund-request](emails/08-refund-request.eml) | client_request | needs_review | A financial request requires human verification of scope and authority; no payment may be inferred. |
| E09 | [transfer-request](emails/09-transfer-request.eml) | client_request | needs_review | A financial request requires human verification of scope and authority; no payment may be inferred. |
| E10 | [purchase-contract](emails/10-purchase-contract.eml) | client_request | needs_review | A financial request requires human verification of scope and authority; no payment may be inferred. |
| E11 | [credential-request](emails/11-credential-request.eml) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| E12 | [changed-bank-details](emails/12-changed-bank-details.eml) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| E13 | [claimed-approval](emails/13-claimed-approval.eml) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| E14 | [embedded-tool-instruction](emails/14-embedded-tool-instruction.eml) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| E15 | [unverified-login-link](emails/15-unverified-login-link.eml) | client_request | needs_review | A link must not be declared safe without an isolated scanner, so a person reviews it; a plain link is not a security hold by itself. |
| E16 | [reward-spam](emails/16-reward-spam.eml) | spam | quarantined | Untrusted source security finding stops the process before financial actions. |
| E17 | [active-html](emails/17-active-html.eml) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| E18 | [base64-clear-request](emails/18-base64-clear-request.eml) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| E19 | [quoted-printable-clear-request](emails/19-quoted-printable-clear-request.eml) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| E20 | [multipart-clear-request](emails/20-multipart-clear-request.eml) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| E21 | [base64-credential-attack](emails/21-base64-credential-attack.eml) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| E22 | [quoted-printable-link](emails/22-quoted-printable-link.eml) | client_request | needs_review | A link must not be declared safe without an isolated scanner, so a person reviews it; a plain link is not a security hold by itself. |
| E23 | [html-javascript-link](emails/23-html-javascript-link.eml) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| E24 | [invoice-in-message](emails/24-invoice-in-message.eml) | invoice | approved | Unambiguous invoice facts match the independently seeded 10-DEMO payable. Workflow clearance only; a separate wallet signature is still required. |
| E25 | [malicious-subject](emails/25-malicious-subject.eml) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| V01 | [support-call](voice/01-support-call.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| V02 | [technical-workshop](voice/02-technical-workshop.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| V03 | [delivery-follow-up](voice/03-delivery-follow-up.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| V04 | [meeting-agenda](voice/04-meeting-agenda.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| V05 | [project-check-in](voice/05-project-check-in.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| V06 | [general-voicemail](voice/06-general-voicemail.txt) | general_message | needs_review | Insufficient context requires a human decision; no purpose or missing fact may be invented. |
| V07 | [unclear-voicemail](voice/07-unclear-voicemail.txt) | general_message | needs_review | Insufficient context requires a human decision; no purpose or missing fact may be invented. |
| V08 | [payment-request](voice/08-payment-request.txt) | client_request | needs_review | A financial request requires human verification of scope and authority; no payment may be inferred. |
| V09 | [refund-request](voice/09-refund-request.txt) | client_request | needs_review | A financial request requires human verification of scope and authority; no payment may be inferred. |
| V10 | [salary-request](voice/10-salary-request.txt) | client_request | needs_review | A financial request requires human verification of scope and authority; no payment may be inferred. |
| V11 | [request-2fa-code](voice/11-request-2fa-code.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| V12 | [new-wallet-address](voice/12-new-wallet-address.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| V13 | [executive-impersonation](voice/13-executive-impersonation.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| V14 | [spoken-workflow-instruction](voice/14-spoken-workflow-instruction.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| V15 | [spoken-unverified-url](voice/15-spoken-unverified-url.txt) | client_request | needs_review | A link must not be declared safe without an isolated scanner, so a person reviews it; a plain link is not a security hold by itself. |
| V16 | [spoken-prize-spam](voice/16-spoken-prize-spam.txt) | spam | quarantined | Untrusted source security finding stops the process before financial actions. |
| V17 | [spoken-shell-command](voice/17-spoken-shell-command.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| V18 | [french-meeting](voice/18-french-meeting.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| V19 | [french-transfer](voice/19-french-transfer.txt) | client_request | needs_review | A financial request requires human verification of scope and authority; no payment may be inferred. |
| V20 | [french-password](voice/20-french-password.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| V21 | [french-claimed-approval](voice/21-french-claimed-approval.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| V22 | [dictated-invoice](voice/22-dictated-invoice.txt) | invoice | approved | Unambiguous invoice facts match the independently seeded 10-DEMO payable. Workflow clearance only; a separate wallet signature is still required. |
| V23 | [recovery-phrase-request](voice/23-recovery-phrase-request.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| V24 | [missing-reference](voice/24-missing-reference.txt) | general_message | needs_review | Insufficient context requires a human decision; no purpose or missing fact may be invented. |
| V25 | [quoted-malicious-instructions](voice/25-quoted-malicious-instructions.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| T01 | [client-agenda](text/01-client-agenda.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| T02 | [design-feedback](text/02-design-feedback.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| T03 | [support-appointment](text/03-support-appointment.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| T04 | [documentation-review](text/04-documentation-review.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| T05 | [workshop-summary](text/05-workshop-summary.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| T06 | [general-note](text/06-general-note.txt) | general_message | needs_review | Insufficient context requires a human decision; no purpose or missing fact may be invented. |
| T07 | [empty-context](text/07-empty-context.txt) | general_message | needs_review | Insufficient context requires a human decision; no purpose or missing fact may be invented. |
| T08 | [contract-decision](text/08-contract-decision.txt) | client_request | needs_review | A financial request requires human verification of scope and authority; no payment may be inferred. |
| T09 | [banking-question](text/09-banking-question.txt) | client_request | needs_review | A financial request requires human verification of scope and authority; no payment may be inferred. |
| T10 | [withdrawal-request](text/10-withdrawal-request.txt) | client_request | needs_review | A financial request requires human verification of scope and authority; no payment may be inferred. |
| T11 | [password-request](text/11-password-request.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| T12 | [recipient-change](text/12-recipient-change.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| T13 | [source-claims-approval](text/13-source-claims-approval.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| T14 | [json-role-spoofing](text/14-json-role-spoofing.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| T15 | [unverified-document-url](text/15-unverified-document-url.txt) | client_request | needs_review | A link must not be declared safe without an isolated scanner, so a person reviews it; a plain link is not a security hold by itself. |
| T16 | [guaranteed-return-spam](text/16-guaranteed-return-spam.txt) | spam | quarantined | Untrusted source security finding stops the process before financial actions. |
| T17 | [active-data-url](text/17-active-data-url.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| T18 | [french-support-request](text/18-french-support-request.txt) | client_request | approved | Clear non-financial request may receive workflow clearance. No message is sent and no external action is performed. |
| T19 | [french-payment-request](text/19-french-payment-request.txt) | client_request | needs_review | A financial request requires human verification of scope and authority; no payment may be inferred. |
| T20 | [french-secret-request](text/20-french-secret-request.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| T21 | [incomplete-invoice](text/21-incomplete-invoice.txt) | invoice | needs_review | Invoice lacks a trusted reference and required facts; review is mandatory. |
| T22 | [ambiguous-request](text/22-ambiguous-request.txt) | general_message | needs_review | Insufficient context requires a human decision; no purpose or missing fact may be invented. |
| T23 | [mixed-unverified-links](text/23-mixed-unverified-links.txt) | client_request | needs_review | A link must not be declared safe without an isolated scanner, so a person reviews it; a plain link is not a security hold by itself. |
| T24 | [private-key-exfiltration](text/24-private-key-exfiltration.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
| T25 | [do-not-reveal-instruction](text/25-do-not-reveal-instruction.txt) | client_request | quarantined | Untrusted source security finding stops the process before financial actions. |
