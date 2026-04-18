# Droproom

Creator-first social NFT drop studio for Base.

## Current V1 Scope

- Image-only drops
- Upload PNG/JPG/WEBP/GIF artwork, start from blank, or generate with AI
- One-second looping GIFs are supported for platform drops and creator uploads
- Free mint is platform-fee free
- Paid mint uses a 10% platform fee
- No sponsored gas or paymaster; creators and collectors pay their own Base network gas
- Edition max is 999
- Future token unlock is hidden and review-gated
- Token eligibility starts after 1 sold-out drop with at least 25 editions
- Launch trust pages live at `/terms`, `/privacy`, and `/support`

## Local Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` for local testing and local contract deployment. Never commit `.env.local`.

## Environment Variables

```bash
AI_PROVIDER=cloudflare
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_AI_MODEL=@cf/black-forest-labs/flux-1-schnell
PINATA_JWT=
PINATA_API_KEY=
PINATA_API_SECRET=
PINATA_GATEWAY_URL=
NEXT_PUBLIC_PINATA_GATEWAY_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
BASE_DASHBOARD_API_KEY=
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-1.5
BASE_RPC_URL=https://mainnet.base.org
DEPLOYER_PRIVATE_KEY=
DEPLOY_CONFIRMATIONS=2
DROPROOM_CONTRACT_URI=
BASESCAN_API_KEY=
NEXT_PUBLIC_APP_NAME=Droproom
NEXT_PUBLIC_APP_URL=https://baseappdroproom.com
NEXT_PUBLIC_BASE_APP_ID=69db83cb2c63bda0567316af
NEXT_PUBLIC_BASE_BUILDER_CODE=bc_n0xmhqgc
NEXT_PUBLIC_SUPPORT_EMAIL=support@baseappdroproom.com
NEXT_PUBLIC_PLATFORM_FEE_BPS=1000
NEXT_PUBLIC_PLATFORM_WALLET=0x152bB9d22d0a980d915F1052eDEF859A9383b7BF
NEXT_PUBLIC_DROP_CONTRACT_ADDRESS=
NEXT_PUBLIC_CHAIN_ID=8453
```

## Production Notes

- Add secrets in Vercel Environment Variables.
- Set `NEXT_PUBLIC_APP_URL` to the canonical production origin, for example `https://baseappdroproom.com`; metadata, robots, sitemap, and Base notifications use this value.
- Set `NEXT_PUBLIC_SUPPORT_EMAIL` to a monitored inbox before launch.
- Run the Supabase migrations in order before relying on live drop indexing and AI usage limits.
- `NEXT_PUBLIC_BASE_BUILDER_CODE=bc_n0xmhqgc` appends Base transaction attribution. It is not a paymaster and does not sponsor gas.
- `BASE_DASHBOARD_API_KEY` enables the admin-only Base App notification audience and send panel.
- `PINATA_API_KEY` and `PINATA_API_SECRET` sign public IPFS uploads. `PINATA_JWT` is optional fallback support. `NEXT_PUBLIC_PINATA_GATEWAY_URL` is used to display uploaded artwork and GIFs.
- `AI_PROVIDER=cloudflare` uses Cloudflare Workers AI. Set `AI_PROVIDER=openai` only if you want to use OpenAI image generation instead.
- Do not expose `CLOUDFLARE_API_TOKEN` or `OPENAI_API_KEY` with any public prefix.
- Do not expose `DEPLOYER_PRIVATE_KEY`; use it only for controlled Base mainnet deployment.
- Create and mint now use the deployed Droproom contract address from `NEXT_PUBLIC_DROP_CONTRACT_ADDRESS`.
- Droproom does not currently sponsor gas or use a paymaster. Users pay Base network gas from their connected wallet.
- `NEXT_PUBLIC_PLATFORM_FEE_BPS=1000` means a 10% platform fee on paid primary mints. Free mints remain platform-fee free.
- AI usage is database-backed when the `ai_usage` migration is applied; it falls back to memory only if Supabase is unavailable.
- Confirm `/terms`, `/privacy`, `/support`, `/robots.txt`, and `/sitemap.xml` resolve on the production domain before launch.
- If sponsored gas is added later, update the app copy, Terms, Support, README, and launch checklist before enabling it.

## Contract

Droproom uses a custom ERC-1155 contract built on OpenZeppelin. Each drop is one token id with:

- Maximum supply capped at 999.
- Free or paid primary mint.
- 10% platform fee only on paid mints.
- Creator payout on primary mint.
- Per-token metadata URI.
- Sold-out checks from total supply.
- Owner pause controls for emergency response.

Useful commands:

```bash
npm run contract:build
npm run contract:test
npm run contract:deploy:base
```

After deployment, set `NEXT_PUBLIC_DROP_CONTRACT_ADDRESS` in Vercel. The current launch posture is no paymaster and no sponsored gas, so creators and collectors should expect to pay their own Base network gas.
