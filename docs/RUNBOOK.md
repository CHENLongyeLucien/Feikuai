# Local operation and external prerequisites

This project implements a synthetic demonstration. Preserve the specification in the root README. All addresses, amounts and authorizations concern DEMO, a valueless six-decimal token.

## First startup

Use Node 24.14.0 and pnpm 10.32.1 (`npm exec --yes pnpm@10.32.1 -- <command>` if pnpm is not on PATH). Install Foundry. The wrapper also locates `~/.foundry/bin`.

1. `pnpm install --frozen-lockfile`
2. `cp .env.example .env` and configure only the dedicated relayer key. Never put the approver key on the server.
3. `pnpm contracts:build`, then leave `pnpm chain:local` running. It mines every second so approval timestamps remain current even while the developer is idle. The launcher loads/saves `var/anvil-state.json` and checkpoints every 30 seconds; keep this private snapshot with the database and artifacts.
4. `pnpm contracts:deploy:local` and `pnpm contracts:export-abi`. For isolated local development, `pnpm demo:configure:local` can populate the public-test relayer key and a random session secret without printing either.
5. `pnpm db:migrate` and `pnpm db:seed` (idempotent).
6. `pnpm doctor` and `pnpm demo:prepare`.
7. `pnpm dev`. Main app: http://localhost:5173. Independent approver: http://localhost:5174.

Use the local Anvil test mnemonic only in an isolated development wallet. The deployer is account 0, approver account 1, relayer account 2, suppliers accounts 3/4. These public development identities are forbidden on Fuji. The startup manifest contains addresses; `.env` contains only the relayer secret. A genuine wallet SIWE signature starts a session; a separate EIP-712 signature authorizes payment.

## Approval lifecycle

Select an existing payable, upload its synthetic invoice, and inspect source, extracted facts, registry and checks. Create a request only when ready to review. It starts a maximum ten-minute window from an executed chain timestamp. Export the request, import into the standalone client, inspect every term and covered source, then sign with the pinned approver wallet. Import the exported signature in the workspace and request execution. The wallet may refuse and the case will remain awaiting signature.

A frozen export may have been signed elsewhere. Document revisions do not revoke it. Resolve its cancellation/expiry/actual chain settlement before creating replacement authority. The approval client can cancel an unused nonce even when signing is no longer eligible. Cancellation spends test gas and is pending until a verified event is observed. If execution wins, settlement remains.

## Recovery

- API restart: keep the SQLite database and artifacts together. Restart the single API/worker; expired leases are reclaimed and persisted outbox hashes are reconciled.
- Lost broadcast response: observe the locally computed transaction hash. Never create a new invoice identity or approval because an RPC timed out.
- Unknown or inconsistent outcome: retain uncertainty; use Reconcile. Do not mark unpaid from a missing receipt.
- Prepared payment now held/expired/cancelled: continue observation; do not broadcast new authority. Inspect `pnpm relayer:recover-nonce -- <executionId>`; recovery defaults to dry-run and must use the same account nonce.
- WebGL unavailable: choose Workspace. Rendering and pause controls cannot affect settlement.
- Never reset/reseed a Fuji invoice as unpaid. For another demonstration create a new explicitly synthetic obligation, preserving old evidence.

## Live model configuration

Set server-only `OPENAI_API_KEY`, an account-available `OPENAI_MODEL`, and `AGENT_MODE=live`, then restart. A failed provider request is an actual held/needs-information outcome. Fixture mode is explicitly labelled and does not generate a usage or price claim. `store:false` does not by itself establish zero retention. No price schedule is configured, so usage is shown with cost not calculated.

## Fuji prerequisites

Provide distinct deployment/funding, approver, relayer and supplier addresses. Import the deployer into the named encrypted Foundry keystore `sf-fuji-deployer` using `cast wallet import sf-fuji-deployer --interactive`; do not place that secret in the app. Fund deployer and relayer with test AVAX; fund approver with test AVAX if cancellation will be demonstrated. The deployment funds the vault with 300,000 DEMO from the one-time supply. Supplier addresses do not need approval authority.

Set chain 43113, environment fuji, official RPC, `ENABLE_DEMO_ROUTES=false`, a Fuji-specific manifest and registry, and the dedicated relayer key. Mainnet 43114 is rejected. Run the documented deployment dry-run, review role addresses, and explicitly broadcast. Rebuild the approver with that exact public manifest and registry. Real human signing and wallet display inspection remain required. Never reuse Anvil's known mnemonic or private keys on a public network.

## Hosting and backups

Docker Compose defines one API worker with one private persistent volume and separate static main/approval apps. After completing local deployment, registry seeding and private `.env` configuration above, run `docker compose up --build`. The Docker image build requires the generated ABI and the reviewed public deployment/registry files so the approver embeds exactly the same identities. Image dependencies install with the committed frozen pnpm lockfile; Linux native build prerequisites are included for SQLite.

The local Compose defaults are main app **http://localhost:8080** and approver **http://localhost:8081**. Main-app `/api` requests pass through its nginx origin; `WEB_ORIGIN` is explicitly set to `http://localhost:8080`, matching the browser Origin and SIWE domain. The API is not published as a host port. Its health check gates main-app startup. `SEED_ON_START=true` runs idempotent migrations/registry seeding in the initially empty private volume, preserving existing obligations and keys on restart. The container never erases an existing database.

Compose overrides the API's RPC endpoint to `http://host.docker.internal:8545`, since container loopback is not host loopback. Anvil stays on the host; the standalone browser approver retains the build-pinned host RPC. Docker Desktop provides host forwarding; other Docker hosts may need an explicitly reachable, access-restricted Anvil endpoint via `DOCKER_RPC_URL`. Do not expose an unrestricted development node publicly.

The Compose HTTP defaults are an explicit loopback-only development mode. To host Fuji behind your HTTPS terminator, configure `DOCKER_NODE_ENV=production`, `DOCKER_WEB_ORIGIN=https://<main-host>`, `DOCKER_APPROVER_ORIGIN=https://<approval-host>`, and `DOCKER_RPC_URL=<trusted-Fuji-RPC>`, in addition to the Fuji `.env` settings. Forward those separate origins to the static services. Production configuration rejects HTTP origins; a deployment should also restrict ingress to the intended TLS proxy. The separate approval origin does not receive the API session cookie.

The supplied proxy never serves the artifact directory. Build the approver again whenever approved public configuration changes. Limit its CSP `connect-src` to the selected RPC if using another provider. `docker compose config --quiet` checks interpolation without printing secrets. Docker build/start remains unverified until run on the target host; inclusion of these files is not evidence of a successful container deployment.

Protect database backups: they contain usable signed authorizations and raw transaction bytes. Stop the single process for a consistent filesystem backup, or use SQLite's backup API while coordinating artifact copying. Do not publish operational databases, signature files or outbox contents. No production withdrawal/recovery/admin route is provided by the frozen demonstration vault.

## Local chain continuity

`pnpm chain:snapshot` saves the running loopback chain 31337 state and receipt history without resetting any invoice. `pnpm chain:local` restores that snapshot automatically. Before stopping an older Anvil process started without `--state`, stop the API, take this snapshot, then stop Anvil. Do not restart an empty chain against an existing settlement database. Preserve the snapshot, database and artifacts together; to create a separate demonstration use a new explicitly isolated database/registry/deployment set. The snapshot is private operational data, not a public evidence package.

## Handoff state in this workspace

The local application and chain processes were stopped after verification. Existing `.env`, database, reviewed registry, artifacts and `var/anvil-state.json` are retained privately. To resume the demonstrated state, run `pnpm chain:local` in one terminal and `pnpm dev` in another; no reset or redeployment is needed. The saved vault holds 263,999 valueless DEMO. The snapshot was actually restored on a second node and its three browser-settlement receipts verified.

`pnpm test:acceptance` expects the chain and both apps/API to be running. Browser tests consume unused synthetic payables and valueless DEMO; they never reset settled keys. Repeated runs can exhaust this finite fixture corpus. Use a separate explicit fixture/deployment/database set for a new campaign.
