# Implementation decisions

- Preserve README as specification. No existing repository code was present.
- Local application in the requested workspace; no hosted publishing or bank/mainnet rail.
- Exact available Node 24.14.0. Compatible stable package versions are resolved from registries, then saved exactly and locked.
- One immutable DEMO route; separate deployer (Anvil account 0), approver (1), relayer (2), suppliers (3/4). Known local keys never permitted on Fuji.
- Application does not hold approver secrets. Automated local tests alone may inject isolated public Anvil credentials.
- Missing model key is an explicit live-mode blocker, not implicit fixture fallback. Fixture provenance remains visible.
- Site references guide appearance only. Copied available movie to docs/references/warehouse-motion.mov (ignored large reference asset).
- Evidence uses RFC 8785 canonicalization library and SHA-256; deployment and policy use EVM Keccak/ABI encoding.
- P0 organizational independence limit: approval build pins public config but same build administrator could replace both apps.
