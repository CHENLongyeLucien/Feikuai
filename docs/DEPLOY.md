# Deploying Feikuai online (Vercel + Render)

| Part | Host | Why |
| --- | --- | --- |
| Workspace (`apps/web`) | Vercel, static site | Fast global hosting. `/api/*` is forwarded to the API, so cookies stay on one origin |
| Approval app (`apps/approver`) | Vercel, separate static site | Must be its own origin. It pins the Fuji payment policy and registry at build time |
| API (`apps/api`) | Render, Docker web service with a 1 GB disk | Needs a long-running process: SQLite on disk, background workers for checks and payments, and the relayer key |

Vercel functions cannot run the API: their disk is temporary and they allow no background workers.

Network: Avalanche Fuji (testnet). The DEMO token is valueless. Every payment still needs the approver's wallet signature.

## 1. API on Render

1. Render dashboard → **New → Blueprint** → choose this GitHub repository. Render reads `render.yaml`.
2. Enter the one secret it asks for, **`RELAYER_PRIVATE_KEY`**: the dedicated Fuji relayer key, the same value as in your local `.env.fuji`. Never commit it. `SESSION_SECRET` is generated automatically.
3. Check `WEB_ORIGIN` and `APPROVER_ORIGIN`. They must be the exact Vercel URLs from step 2 below. Defaults: `https://feikuai-web.vercel.app` and `https://feikuai-approve.vercel.app`.
4. Deploy. Wait until `https://<service>.onrender.com/health` returns `{"status":"ok"}`.

On first start the database is seeded from `deployments/fuji.json` and `fixtures/trusted-registry.fuji.json`: the three Fuji wallets (approver, relayer, deployer) and the 34 test invoices.

Invoices already paid on Fuji are found by the chain scan and held. The contract would refuse a second payment anyway.

Plan: `starter`, because a persistent disk needs a paid plan. A free instance has no disk, loses data on every restart, and sleeps when idle, which also pauses the payment workers.

## 2. Web apps on Vercel

Create a token at vercel.com → Account Settings → Tokens. Put it in `.env.vercel`, which git ignores:

```sh
echo 'VERCEL_TOKEN=xxxxxxxx' > .env.vercel
FEIKUAI_API_URL=https://feikuai-api.onrender.com pnpm deploy:vercel
```

The script builds both apps locally and uploads **only the built files**: no `.env`, database or `var/` folder. It creates or links the Vercel projects `feikuai-web` and `feikuai-approve`, deploys them to production, and prints their URLs.

| Option | Use when |
| --- | --- |
| `--web-project` / `--approver-project` | You want other project names |
| `VERCEL_SCOPE=<team>` | You deploy to a team |
| `--dry-run` | You want to build and inspect `var/vercel/` without deploying |

If Vercel gives a project another URL (for example when the name is taken), set:
- `FEIKUAI_WEB_URL`, so the approval app trusts the right origin;
- `FEIKUAI_APPROVER_URL`;
- the same two values as `WEB_ORIGIN` and `APPROVER_ORIGIN` on Render.

Then redeploy both.

## 3. Check

1. Open the workspace URL → **Start** → **Sign in** with the approver wallet (MetaMask on Avalanche Fuji).
2. Drop a few files from `fixtures/manual-tests`, then pay `A1-clean-invoice-0017.pdf` with **Approve & pay**.
3. The approval window opens on the approver URL. Sign there, and the payment is shown as Paid after its Fuji receipt is verified.

## Limits

- The workspace forwards live updates through Vercel. If a long-lived event stream is cut, the page falls back to its regular refresh.
- The API runs scripted (fixture) agents. Set `AGENT_MODE=live` with `OPENAI_API_KEY` and `OPENAI_MODEL` on Render to use a live model.
