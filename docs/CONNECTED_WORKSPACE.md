# Connected finance workspace

The opening page at `/` shows a geographic Earth with a read-only public Avalanche **C-Chain** activity sample. **Start** moves the camera toward Earth and opens `/workflow`. Reduced motion, paused animation, or unavailable WebGL enters immediately. Escape or Cancel stops the transition.

## Everyday use

1. Press **Start**, then sign in. The isolated local demonstration offers **Explore the demo**; Fuji uses an enrolled wallet for login.
2. Press **Add item**. Choose Invoice, Email, Voice or Text, provide the source and submit it for review. Existing upload limits and security checks apply.
3. Choose an item in **Your items**. On a phone, expand that list first. All items, Needs review and Payments filter this same list.
4. Follow the six stations. Select a station for its recorded status, focus the map, or jump to the matching source, review or payment below. The map only displays recorded state.
5. Review any findings and use the available decision actions. The linked invoice's payment review stays on the same page. Human payment signatures still use the separately pinned approval application when required; a source decision is not payment authorization.
6. Open **Reports** for PDFs, **Alerts** for updates, or **Settings** for display preferences. These panels preserve the selected source and payment component. Close the panel to continue where you left off.

The old left navigation, Agents and Business destinations are absent from the main interface. Legacy inbox, invoice, reports, settings and campus URLs resolve to the appropriate workspace selection or panel. Browser Back and Forward preserve URL selection. Switching between different records deliberately resets record-specific review state.

## Public activity scope

- Reads the official public mainnet C-Chain RPC. It is separate from the configured local/Fuji payment RPC, wallet, token balance and `ENABLE_MAINNET` setting.
- Shows a bounded sample of recent finalized block transactions, not all Avalanche activity, global volume, validator locations or transaction execution success.
- Onchain transactions do not provide sender locations. Globe positions and routes are explicitly illustrative; the activity records and explorer links are real when the feed is fresh.
- A stale or unavailable feed is labelled accordingly. There are no invented fallback transactions. The workspace remains usable when the public RPC is unavailable.
- Public activity requires network access, but no API credential, wallet action or testnet funding. Actual Fuji payments retain their existing funding and authorization requirements.

Official references: [Avalanche primary network and public RPCs](https://build.avax.network/docs/primary-network), [finality semantics](https://build.avax.network/docs/primary-network/exchange-integration). Natural Earth coastline geometry is bundled locally with [asset provenance](../apps/web/src/features/landing/assets/PROVENANCE.md).

## Validation

Use an isolated copied database with financial workers and seeding disabled for these browser checks. They do not start services or generate financial fixtures. Defaults target `http://127.0.0.1:5283`; do not run them against a production workspace.

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright test --config tests/e2e/landing.config.ts
pnpm exec playwright test --config tests/e2e/unified-workspace.config.ts
```

The landing suite uses explicitly synthetic network transport fixtures to test rendering, actual globe camera movement, cancellation, reduced motion, failure states and fallback. These fixture screenshots are marked as UI QA. Actual public RPC observations are recorded separately.

The unified workspace suite uses existing saved source/invoice records on the copied preview and permits authentication only. It blocks source and financial mutations. Historical route-specific suites document earlier interfaces; this UI pass does not claim a new live wallet payment, model run, contract deployment or chain integration result. See [build status](BUILD_STATUS.md) for the current measured results and limitations. Raw screenshots, traces and observed public samples remain in ignored `var/`.
