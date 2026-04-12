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
OPENAI_API_KEY=
OPENAI_IMAGE_MODEL=gpt-image-1.5
AI_MOCK_MODE=true
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_PLATFORM_FEE_BPS=1000
NEXT_PUBLIC_PLATFORM_WALLET=0x152bB9d22d0a980d915F1052eDEF859A9383b7BF
NEXT_PUBLIC_DROP_CONTRACT_ADDRESS=
NEXT_PUBLIC_CHAIN_ID=8453
```

## Production Notes

- Add secrets in Vercel Environment Variables.
- Do not expose `OPENAI_API_KEY` with any public prefix.
- Current mint flow is a contract-ready preview. Real onchain minting needs the drop contract deployment and address.
- AI mock mode is explicit. Set `AI_MOCK_MODE=true` only for local UI testing without an API key.
- Production AI usage should move from in-memory limiting to database-backed usage tracking and asset storage.
