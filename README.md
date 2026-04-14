# Droproom

Creator-first social NFT drop studio for Base.

## Current V1 Scope

- Image-only drops
- Upload artwork, start from blank, or generate with AI
- Free mint is platform-fee free
- Paid mint uses a 10% platform fee
- Edition max is 999
- Future token unlock is hidden and review-gated
- Token eligibility starts after 1 sold-out drop with at least 25 editions

## Local Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` for local testing. Never commit `.env.local`.

## Environment Variables

```bash
AI_PROVIDER=cloudflare
AI_MOCK_MODE=false
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_API_TOKEN=
CLOUDFLARE_AI_MODEL=@cf/bytedance/stable-diffusion-xl-lightning
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-1.5
BASE_RPC_URL=https://mainnet.base.org
DEPLOYER_PRIVATE_KEY=
DEPLOY_CONFIRMATIONS=2
DROPROOM_CONTRACT_URI=
BASESCAN_API_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PLATFORM_FEE_BPS=1000
NEXT_PUBLIC_PLATFORM_WALLET=0x152bB9d22d0a980d915F1052eDEF859A9383b7BF
NEXT_PUBLIC_DROP_CONTRACT_ADDRESS=
NEXT_PUBLIC_CHAIN_ID=8453
```

## Production Notes

- Add secrets in Vercel Environment Variables.
- `AI_PROVIDER=cloudflare` uses Cloudflare Workers AI. Set `AI_PROVIDER=openai` only if you want to use OpenAI image generation instead.
- Do not expose `CLOUDFLARE_API_TOKEN` or `OPENAI_API_KEY` with any public prefix.
- Do not expose `DEPLOYER_PRIVATE_KEY`; use it only for controlled Base mainnet deployment.
- Current mint flow is a contract-ready preview. Real onchain minting needs the drop contract deployment and address.
- AI mock mode is explicit. Set `AI_MOCK_MODE=true` only for local UI testing without a real provider.
- Production AI usage should move from in-memory limiting to database-backed usage tracking and asset storage.

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

After deployment, set `NEXT_PUBLIC_DROP_CONTRACT_ADDRESS` in Vercel and add the contract to CDP Paymaster allowlist. The first sponsored function should be the mint function, not admin functions.
