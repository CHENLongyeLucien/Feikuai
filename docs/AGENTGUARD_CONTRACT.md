# AgentGuard: opt-in delegated-payment contract

`contracts/src/AgentGuard.sol` implements a separate delegated-transfer vault based on the technical proposals in `AgentGuard_Solutions_FR.md`. It is **not deployed or connected to the existing payment workflow**. `PaymentGuard`, `AutomationGuard`, their generated client ABIs, deployment manifests, funding, saved approvals, and existing records are unchanged.

The contract enforces registered authority, recipients, token, amounts, time limits, shared budgets, frequency, owner review, and pause state at transfer time. It authenticates an origin statement supplied by a trusted runtime. It cannot establish the true causal origin of an instruction if that runtime is compromised.

## Enforcement and trust boundary

| Property | Contract behavior |
| --- | --- |
| Authority chain | Root delegation requires the owner's wallet transaction. Each child requires its immediate parent's agent transaction and delegation permission. Every ancestor is checked on payment. |
| Attenuation | Child recipients, transfer cap, daily cap, automatic threshold, frequency cap, validity period and depth cannot exceed its parent or the vault. Maximum depth is 8. |
| Intermediary agent origin | An attested `Agent` origin must name a strict ancestor of the paying leaf. An unregistered research agent or omitted attested intermediary cannot use an unrelated owner-to-payment-agent chain. |
| Runtime authenticity | An EIP-712 signature from the immutable runtime attestor binds all request fields, chain ID and vault address. The submitting transaction must come from the leaf agent. |
| Runtime compromise | A dishonest attestor can label an externally influenced request `Human`. The contract cannot discover this lie. Recipients, all hard caps, frequency, expiry, nonce and pause checks still apply. A test deliberately demonstrates this limit. |
| Human-origin meaning | `Human` is an authenticated runtime label under a standing owner delegation. It is **not** proof of a fresh owner signature on this payment. Explicit owner approval is a separate wallet transaction and `OwnerApproved` event. |
| Documents and large payments | Every otherwise-valid `ExternalDocument` request and every otherwise-valid amount above any applicable automatic threshold is pending owner approval. An amount above a hard transfer cap is rejected, even if the owner wishes to approve it. |
| Budget aggregation | Every executed amount counts against the leaf, every ancestor, and the shared vault budget. Sibling/root fan-out cannot multiply an ancestor/vault budget. |
| Frequency | Every execution counts against a rolling 60-second window for the leaf, all ancestors, and vault. Caps are immutable per grant and in the range 1–64. |
| Monitor | Monitor can pause only. It cannot resume, move funds, approve requests, register delegations, or record audit anchors. |
| Payment replay | A nonce is consumed once per leaf-agent address across all its grants, including authenticated pending or rejected requests. Cross-vault and cross-chain signature replay is rejected. |
| Business deduplication | There is no invoice or obligation key. Different authenticated nonces can pay the same source/evidence twice within the caps. Current `PaymentGuard`/`AutomationGuard` obligation protections must not be assumed for this separate vault. |

The runtime signing key must be isolated from the model and ordinary document/agent input. Request origin, origin actor, source commitment and evidence commitment must come from authenticated runtime context, never merely copied from model output. This is an operational requirement; signing an invented label makes it authentic but does not make it true. No contract can reconstruct a hidden influence chain from a signature alone.

## Immutable configuration

Constructor parameters, in order:

```solidity
AgentGuard(
    address token,
    address owner,
    address runtimeAttestor,
    address monitor,
    address recorder,
    uint256 maxPerTransferAtomic,
    uint256 dailyLimitAtomic,
    uint256 autoApproveThresholdAtomic,
    uint8 maxPaymentsPerWindow,
    address[] sortedUniqueRecipients
)
```

The token must be deployed and report 6 decimals. Amounts are atomic integers: `10_000_000` represents 10 units. The owner, runtime attestor, monitor and recorder are distinct nonzero addresses. None may also be a delegated agent. The vault-wide allowlist contains 1–32 strictly ascending unique nonzero recipient addresses, excluding the vault itself. `registryHash` is `keccak256(abi.encode(sortedUniqueRecipients))`.

The daily cap must be at least the transfer cap; automatic threshold may be zero to require review for every positive request, but cannot exceed the transfer cap. The contract is not upgradeable and offers no role rotation, withdrawal, native-token payment, allowance, arbitrary-call, bridge or token-swap path. Key recovery and token migration are not implemented. Configuration mistakes or lost keys can strand funds; this isolated implementation has not undergone an external audit.

`dailyUsage(0)` is the vault-wide counter. All other counter keys are grant IDs. The day is `block.timestamp / 86400`, corresponding to UTC calendar days. This is **not** a rolling 24-hour allowance: the full cap can be spent on both sides of midnight. Frequency windows use block timestamps and exclude executions exactly 60 seconds old. No wall-clock latency or fixed one-second finality is promised.

## Delegation interface

```solidity
struct Limits {
    uint256 maxPerTransferAtomic;
    uint256 dailyLimitAtomic;
    uint256 autoApproveThresholdAtomic;
    uint64 validAfter;
    uint64 expiresAt;
    uint8 maxPaymentsPerWindow;
    bool canDelegate;
}

registerDelegation(uint256 parentId, address agent, Limits limits, address[] recipients)
    returns (uint256 grantId);
revokeDelegation(uint256 grantId);
getDelegation(uint256 grantId) returns (Delegation);
```

`parentId = 0` denotes an owner-issued root. The registered chain is stored on-chain; a submitter cannot supply a replacement ancestor list. Child creation requires all existing ancestors to be active and unrevoked, rejects repeated agent addresses in that path, and caps depth at 8. Recipients must be sorted and be a subset of the immediate parent and vault allowlists. Root grants have depth 1.

The owner or a grant's original issuer can revoke it. Revocation is permanent and transitively disables every descendant. Creating another root or branch is a new authorization, subject to the shared vault cap; it does not reset that cap or the agent-wide nonce namespace. Pending approvals remain subject to ancestor revocation and expiry.

## Runtime-attested requests

EIP-712 domain:

```json
{"name":"AgentGuard","version":"1","chainId":"<pinned chain ID>","verifyingContract":"<pinned AgentGuard vault>"}
```

Exact type string:

```text
RuntimePayment(uint256 grantId,address recipient,address token,uint256 amountAtomic,uint256 nonce,uint64 issuedAt,uint64 deadline,uint8 origin,address originActor,bytes32 sourceCommitment,bytes32 evidenceCommitment)
```

Origins are `0 = Human`, `1 = Agent`, `2 = ExternalDocument`. Human origin requires `originActor == owner`; agent origin requires a strict ancestor's agent address; external-document origin requires a zero actor and always requests owner review. A leaf cannot claim itself as an intermediary ancestor.

Both commitments and the nonce must be nonzero. `issuedAt <= now < deadline`, with a positive lifetime of at most 600 seconds. Expiry is exclusive: execution at the deadline is denied. The runtime attestor currently uses canonical ECDSA signatures; EIP-1271 attestor signatures are not implemented. Source bytes and record explanations remain off-chain.

```solidity
hashRequest(RuntimePayment payment) returns (bytes32 requestId);
submitRequest(RuntimePayment payment, bytes runtimeSignature)
    returns (bytes32 requestId, Status status, Reason reason);
getRequest(bytes32 requestId) returns (RequestRecord);
approveRequest(bytes32 requestId) returns (Status status, Reason reason);
rejectRequest(bytes32 requestId);
expireRequest(bytes32 requestId);
```

The request ID is its EIP-712 digest. `approveRequest` and `rejectRequest` require an owner wallet transaction for the exact stored digest. There is no server-held owner key requirement. Approval rechecks current pause state, origin, all ancestors, recipients, amounts, expiry, shared budgets and rolling frequency. It never overrides a hard policy failure. Pending requests do not reserve money or budget; intervening payments can make approval fail. The owner cannot edit terms during approval.

Statuses are `0 None`, `1 Pending`, `2 Executed`, `3 Rejected`, `4 Expired`. Reasons are:

| Value | Reason | Value | Reason |
| --- | --- | --- | --- |
| 0 | None | 9 | Revoked |
| 1 | UnknownGrant | 10 | InactiveGrant |
| 2 | UnauthorizedAgent | 11 | RecipientNotAllowed |
| 3 | InvalidRuntimeSignature | 12 | TransferLimit |
| 4 | NonceUnavailable | 13 | DailyLimit |
| 5 | MalformedRequest | 14 | FrequencyLimit |
| 6 | WrongToken | 15 | OriginChainMissing |
| 7 | Expired | 16 | HumanApprovalRequired |
| 8 | Paused | 17 | OwnerRejected |

A mined transaction with success status may record a rejection or a pending request. **Transaction success alone does not establish payment.** Verify the pinned vault's `AgentPaymentExecuted` event, exact request digest/terms, transaction calldata and canonical receipt. Owner-approved execution also emits `OwnerApproved` in that same successful transaction. An earlier pending event or off-chain approval record does not establish settlement.

An expired pending record cannot execute even before someone calls `expireRequest`. The stored status can remain `Pending` until explicit expiry cleanup or attempted approval; interfaces must derive time-based expiry instead of assuming a background on-chain timer exists.

## Persistent denial circuit and transfer failure

Policy denial uses a nonreverting decision path. A fresh request from the registered leaf with a valid runtime signature consumes its nonce, stores its exact payment and terminal reason, and emits `RequestDenied(..., authenticated = true)`. This lets rejection history survive the transaction.

Three such refusals by the same leaf-agent address within the rolling 600-second interval pause the whole vault. An otherwise valid request exceeding any applicable daily budget pauses immediately. A simultaneous frequency breach cannot hide that daily-budget trigger. Ordinary frequency denials contribute to the three-refusal circuit. Owner approval failures revalidate an already authenticated pending request and can also trigger it. Owner rejection and explicit expiry cleanup do not count as anomalies.

Unknown grants, wrong callers, invalid runtime signatures and previously consumed nonces emit a denial with `authenticated = false`. They do not overwrite an existing request, consume new authority, increment the circuit, or pause the vault. Observers must not count these events as authenticated payment attempts or replace the stored result of an executed request with a later replay denial. An attacker can pay gas to emit such events; this is not authority to move money.

```solidity
pause(bytes32 nonzeroIncidentCommitment); // monitor or owner
resume();                              // owner only
```

All payment paths check `paused`; governance revocation and evidence anchoring can continue. Only the owner resumes. Resuming does not erase recent refusal history, so a further authenticated anomaly can immediately pause again. The monitor cannot pause other deployed vaults: this protects only this separate contract's balances.

Token failures are different from policy decisions. A revert, `false` transfer result, inexact vault debit/recipient credit, or reentrancy attempt causes EVM rollback. All request changes, counters, transfer effects and events in that reverted transaction roll back. A failed first submission leaves its nonce unused; a failed owner-approved transfer leaves the already pending request available for retry before expiry. These reverted failures do not produce persistent on-chain denial events; observers must reconcile failed transactions separately. Invalid ABI input and out-of-gas transactions also revert.

Only exact transfers of the pinned token are supported. Fee-on-transfer or rebasing behavior that changes the measured deltas is rejected. A malicious token can misrepresent its own accounting, so deployment review and runtime code pinning remain necessary.

## Evidence anchors

```solidity
anchorBatch(bytes32 anchorId, bytes32 root, uint32 leafCount, bytes32 manifestHash);
anchorReport(bytes32 anchorId, bytes32 reportHash);
anchoredHash(bytes32 anchorId) returns (bytes32);

event DecisionBatchAnchored(bytes32 indexed anchorId, bytes32 indexed root,
    uint32 leafCount, bytes32 manifestHash);
event ReportAnchored(bytes32 indexed anchorId, bytes32 indexed reportHash);
```

Only owner or recorder can anchor. IDs and hashes must be nonzero; batches contain 1–4096 leaves and a nonzero manifest hash. Batch and report IDs share one immutable namespace in this vault, preventing overwrite even by an authorized recorder. Invalid metadata reverts the whole write.

The contract stores the hash and emits metadata. Canonicalization, salted leaves, proof generation and inclusion verification are provided separately by `packages/evidence/src/agentguard.ts`; the contract does not validate each off-chain record or guarantee that every decision was included. A verified proof and canonical receipt establish that the committed bytes were anchored by that block. They do not establish factual accuracy, full log coverage, current payment eligibility, settlement, regulatory classification, or the exact instant a report was generated.

Addresses, amounts, timing, delegation policy, origin labels, source/evidence commitments and events are publicly visible. Hashes may still reveal or link data, especially with guessable inputs. The contract does not provide encrypted payments or prove absence of personal data. Commitments should use a documented canonical representation and suitable salts where appropriate.

## Verification and authored scenario comparison

Run the contract suite without connecting to or mutating any running chain:

```sh
node scripts/foundry.mjs forge test --root contracts -vv
node scripts/foundry.mjs forge test --root contracts --match-path 'test/AgentGuard*.t.sol' -vv
```

The generated ABI is `contracts/out/AgentGuard.sol/AgentGuard.json`. No existing public deployment ABI was replaced.

Focused tests cover signature-field/domain/high-S tampering, replay, unauthenticated traffic, intermediate-origin omission, the dishonest-runtime limit, parent revocation/expiry/depth/attenuation, sibling and independent-root budget aggregation, rolling frequency and UTC midnight boundaries, pending owner review and revalidation, persistent pause decisions, monitor privilege separation, authorized immutable anchors, exact receipt commitments, false/reverting/inexact tokens, reentrancy, rollback and conservation. Fuzzing uses 256 inputs; the handler invariant uses 64 runs × 32 calls, checking shared caps and token conservation.

`AgentGuardSynthetic.t.sol` runs 500 authored normal payments and 50 authored attack/escalation scenarios against this contract and a small test-only budget/expiry control. The control is not a reproduction of any named commercial product. The scenario families contain ten each: unknown recipient; attested but unregistered intermediary; external-document origin; amount above the automatic threshold; and reused agent nonce.

Observed scenario results:

| Outcome | AgentGuard | Test-only budget/expiry control |
| --- | ---: | ---: |
| Normal payments executed | 500 / 500 | 500 / 500 |
| Attack/escalation scenarios executed | 0 / 50 | 50 / 50 |
| Attack/escalation scenarios rejected | 30 / 50 | 0 / 50 |
| Scenarios held for owner review | 20 / 50 | 0 / 50 |

Those are deterministic policy outcomes on a deliberately constructed dataset, **not fraud detection accuracy, a false-positive estimate for real users, throughput measurements, or evidence of one-second settlement**. The 20 held requests are not called permanently blocked: the owner could approve them. Attack scenarios are spaced 601 seconds apart so an earlier pause does not obscure the individual rule; separate tests exercise bursts and the circuit. The benchmark makes hundreds of simulated calls inside one test transaction and its aggregate gas must not be presented as a feasible single on-chain batch.

Actual complete-suite output is recorded in `docs/agentguard-contract-results.log`: the 11 October 2026 run passed **79 tests, with 0 failures and 0 skips**, including 32 AgentGuard unit/fuzz tests, its invariant, the synthetic comparison, and all existing guard tests. The AgentGuard invariant completed 64 runs and 2,048 calls with no reverts. The compiled AgentGuard runtime is 13,627 bytes with the repository's Solidity 0.8.37 optimizer configuration. Formatting checks passed for all three added Solidity files.

## Remaining work before opt-in use

This addition does not migrate existing approvals, enroll agents automatically, issue owner permissions, or claim live protection for the current deployment. Adopting it requires a separately reviewed integration and deployment: select/pin chain RPC and token code; choose distinct owner wallet, runtime-attestor signer, monitor and recorder; review recipients and limits; deploy and verify the exact runtime code; fund that new vault; have the owner register delegations; and reconcile actual receipts through a durable executor/observer. Agent transactions, owner reviews, monitor pauses and recorder anchors require the appropriate wallet credentials and native gas. Any Fuji use additionally needs test AVAX and the approved test token; no mainnet funds are needed for the local contract tests.

Runtime origin attestation, agent-call authentication, invoice deduplication where required, pending-request expiry presentation, an external monitor, reporting schedules and incident notifications must be explicitly integrated before enabling real transfers. Eighty-percent budget alerts, first-recipient alerts, DORA incident assessment/drafts, queue prioritization and narrative explanations are off-chain concerns; this contract does not determine legal compliance. Owner/attestor keys must not be shared with an LLM. Monitoring/finality latency needs actual network measurement, and all current live payment routes retain their existing authorization models.
