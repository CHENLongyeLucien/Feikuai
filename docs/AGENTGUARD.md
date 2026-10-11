# AgentGuard integration

The supplied [French proposal](references/AgentGuard_Solutions_FR.md) is retained unchanged. Its SHA-256 is `addabe44fe883fe3cb4b439bb809e284657a1a3a5d26c530e84a925a793ad0a7`. It describes the intended design; statements in that document are not evidence of deployment, measured performance, regulatory compliance or payment authority. This guide records what was implemented and what remains separate from the running demonstration.

## What users can use now

Select an item in the main workflow. **Payment authority** explains the recorded authority, review outcome and payment observation. Open its details for source provenance, current versus stale checks and evidence coverage. Technical identifiers remain out of the primary view.

For an inbox item with recorded security findings, an authorized reviewer can open **Prepare an incident draft**. Impact facts and reporting dates start unknown. Supply facts established during investigation, then download a readable PDF. The draft combines recorded findings, optional reviewer assertions, deterministic classification support and conditional reporting deadlines. It does not save an assessment, send a notification, submit to a regulator, pause a contract or anchor the PDF. The version check prevents silently attaching a draft to a changed source; refresh and reassess if the source changes.

Review priority supports triage; it never authorizes payment. A completed inbox review is separate from payment permission and verified settlement. Existing historical records do not establish authenticated message authorship or a runtime-attested instruction origin. The interface reports those gaps rather than inventing them.

## Five proposed problems mapped to code

| Proposal | Implemented addition | Activation boundary |
| --- | --- | --- |
| Delegated agents and prompt injection | New standalone `contracts/src/AgentGuard.sol`: owner-rooted onchain grants, derived ancestor chains, narrowing recipient/amount/expiry limits, runtime-attested exact requests and replay protection | Contract tests only; no current vault was replaced and no agent key was authorized |
| Human attention and deterministic decisions | New contract separates hard denial, owner review and execution. Workflow exposes recorded authority, checks and explanatory triage priority | Existing exact human-wallet and registered-obligation routes retain their policies; heuristic priority is not an acceptance rule or automatic queue sorting |
| Incident response | New contract has automatic denial/daily-cap circuits, pause-only monitor and owner-only resume. API provides tenant-scoped observations, DORA decision support and request-only PDF drafts | Inbox hold patterns are application observations, not onchain agent refusals. No live monitor, automatic draft generation or regulatory filing is enabled |
| Independently inspectable evidence | Strict salted decision records, deterministic Merkle batches/proofs, exact report hashing, immutable contract anchor IDs and a pinned online verifier | No background recorder/outbox is wired into current decisions. No AgentGuard batch or PDF anchor was submitted |
| Cumulative and frequency attacks | New contract enforces UTC daily budgets and rolling 60-second frequency limits globally and at every grant ancestor | These limits protect only funds routed through a future AgentGuard deployment; current vaults do not acquire them |

The new contract is additive. See [contract specification and test boundaries](AGENTGUARD_CONTRACT.md). Current PaymentGuard requires an exact eligible human signature. Current AutomationGuard permits exact owner-registered obligations. Neither is an upgradable alias for AgentGuard.

AgentGuard is a generic delegated-transfer vault: nonce replay protection is not invoice uniqueness. Two separately authorized requests with fresh nonces and identical source commitments can both execute within limits. Before using it for invoices, add an explicit contract-enforced obligation identity or preserve the existing invoice-once route. A source hash alone is not a consumed-invoice registry.

The proposal's rule that **every external-document payment needs a human** is enforced in the new contract. It is stricter than the existing registered-obligation demo. This integration does not silently change that existing policy or redirect its funds.

## Authority and evidence trust limits

An agent cannot create an ancestor by supplying a list: grants and parent links are stored onchain. Delegation narrows authority; global and ancestor usage prevent splitting a budget across child grants. Requests commit to chain/contract, agent grant, token, recipient, amount, origin, nonce, validity and source/evidence commitments. Owner review rechecks the current chain and limits before execution. An expired pending request cannot execute; an explicit expiry call records its terminal status.

A runtime signature authenticates an attestor's assertion. It does not prove the true causal origin of an instruction if the runtime or attestor is compromised. Allowlisted recipients and caps remain a final boundary, but payments within those limits can still be harmful. The model must not control the attestor key or origin labels. Compromised monitor authority can cause denial of service; it cannot resume or transfer funds.

Fresh authenticated policy denials are recorded without reverting, so their counters and events persist. Invalid signatures, unauthorized callers and replays cannot manufacture circuit counts. A successful transaction receipt alone therefore does **not** mean payment: consumers must verify the exact execution event and token transfer. Reverted transactions may still have receipts, but their reverted events and state changes do not persist.

The Merkle utility uses domain-separated ordered leaf/parent hashes, unique sorted record IDs and independently trusted root/count inputs. Supply a fresh random 32-byte salt for each decision; do not reuse the same salt in real records. The builder marks batches `NOT_SUBMITTED`. An anchor establishes inclusion of committed bytes by a block timestamp, not business truth, completeness, exact creation time, agent safety or settlement. The online verifier relies on a selected RPC plus a separately trusted chain/address/code/event pin; it is not a trustless consensus proof.

The local builder and verifier accept up to 1,024 records per batch, while the contract accepts up to 4,096 leaves. Keep batches within the local 1,024-record limit when using these tools.

Only commitments belong in public anchors. Addresses and hashes can still be personal or linkable data. Data minimization, retention, access controls and legal assessment remain necessary; hashing does not itself establish GDPR compliance. This project does not assign legal liability, certify an insurer's acceptance or substantiate competitor capability claims from the proposal.

## DORA decision support

The classifier implements the single-incident criteria in [Delegated Regulation (EU) 2024/1772, Articles 6, 8 and 9](https://eur-lex.europa.eu/eli/reg_del/2024/1772/oj/eng). It preserves unknown values, counts clients/counterparties/transactions as one criterion, includes transaction value and relevant-client impact, and requires actual impact facts. The special successful malicious unauthorized-access criterion concerns access that **may result** in data loss; actual proven data loss is not a prerequisite for that branch. A suspicious email or blocked payment alone establishes none of these facts.

The deadline helper follows the baseline in [Delegated Regulation (EU) 2025/301, Article 5](https://eur-lex.europa.eu/eli/reg_del/2025/301/oj/eng): initial reporting uses actual awareness and classification times, with the late-classification exception; intermediate reporting runs from actual initial submission; final reporting runs one calendar month from the latest intermediate submission. The tool does not substitute upload or PDF-generation times for legal awareness. National calendars, entity-specific exceptions, recurring-incident aggregation, recovery updates, required submission forms and competent-authority delivery need a qualified reviewer and further integration.

No production false-positive rate or one-second settlement/pause SLA is claimed. Authored contract scenarios demonstrate encoded policy behavior, not representative fraud detection or network latency.

## Implementation and local checks

- API: `apps/api/src/agentguard/` — authenticated tenant-scoped projections; reviewer/origin/CSRF-gated draft generation; no stored payment-state mutations.
- Workflow: `apps/web/src/features/workflow/AuthoritySummary.tsx` and `IncidentDraft.tsx` — compact disclosure and PDF flow, without another navigation section.
- Classification: `packages/shared/src/agentguard-dora.ts` — versioned facts, thresholds and timeline validation.
- Evidence: `packages/evidence/src/agentguard.ts` and `agentguard-online.ts` — pure batch/proof utilities and read-only online verification.
- Contract: `contracts/src/AgentGuard.sol` — isolated optional payment route.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm test:contracts
# In another terminal, start an isolated preview (API requests are test fixtures):
WEB_PORT=5283 pnpm exec vite --config apps/web/vite.config.ts
# Run against that preview:
pnpm exec playwright test --config tests/e2e/authority.config.ts
```

The technical verifier is for auditors/integration developers; normal users download PDFs:

```sh
pnpm exec tsx scripts/agentguard-evidence.ts proof.json --root <independently-trusted-root> --count <leaf-count>
pnpm exec tsx scripts/agentguard-evidence.ts proof.json --pin trusted-anchor.json
```

The trusted pin contains `chainId`, `vault`, `runtimeCodeHash`, `anchorId`, `transactionHash` and a read-only `rpcUrl`. Obtain it independently of the evidence being checked. Do not put credentials in that file. Offline success establishes inclusion only; the online path additionally checks chain identity, receipt/contract identity, finalized canonical block, runtime code hash and the exact anchor event.

## Before activating AgentGuard on Fuji

1. Review the new contract and operational policies. Add a deployment procedure and independently pinned ABI/address/code manifest; existing deployment scripts still deploy the established guards.
2. Create separately controlled owner, runtime-attestor, delegated-agent, pause-monitor and recorder identities. Keep signing material in private wallet/key storage. The owner must sign registration/revocation, approval and resume transactions as appropriate. Do not reuse the current relayer as every privileged role.
3. Fund the chosen deployer/transaction signers with Fuji test AVAX for gas and the new vault with valueless test tokens. Existing DEMO balances remain in their current vaults; no migration or funding was performed here.
4. Implement the authenticated origin boundary and persistent request/nonce lifecycle, then connect the new route to executor and reconciler code. Isolate model output from signing. Test retries, uncertain receipts, expired requests, revocation, multi-tenant policy and key compromise.
5. Add a durable onchain monitor, decision recorder/anchor outbox, recovery/reconciliation and incident ownership. Current inbox observations are not substitutes. Test loss/retry and prove denial/report anchor completeness within a stated observation window.
6. Run an isolated end-to-end Fuji acceptance exercise and record real receipts, token deltas and latency. Only then label those protections active in the UI. No new API/model credential is needed for the local additions; optional model/scanner integrations remain separately configured.

See [build status](BUILD_STATUS.md) for actual commands, outcomes and remaining limitations. Environment files and saved demonstration data are preserved locally and excluded from Git.
