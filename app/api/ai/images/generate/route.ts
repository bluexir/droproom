import { NextResponse } from "next/server";

import { AiImageGenerationError, generateAiImages } from "@/lib/ai-images";
import { AI_DAILY_JOB_LIMIT, STYLE_CHIPS, type StyleChipId } from "@/lib/constants";

export const runtime = "nodejs";

type ImageRequest = {
  prompt?: unknown;
  styleChipIds?: unknown;
};

const usage = new Map<string, { count: number; resetAt: number }>();

function getClientKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "local";
  return forwardedFor.split(",")[0]?.trim() || "local";
}

function checkLimit(key: string) {
  const now = Date.now();
  const current = usage.get(key);

  if (!current || current.resetAt < now) {
    usage.set(key, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return true;
  }

  if (current.count >= AI_DAILY_JOB_LIMIT) return false;

  current.count += 1;
  usage.set(key, current);
  return true;
}

function stylePrompt(ids: string[]) {
  const allowed = new Set(STYLE_CHIPS.map((chip) => chip.id));
  return ids
    .filter((id): id is StyleChipId => allowed.has(id as StyleChipId))
    .map((id) => STYLE_CHIPS.find((chip) => chip.id === id)?.prompt)
    .filter(Boolean)
    .join(", ");
}

function mockImage(prompt: string, index: number) {
  const colors = [
    ["#31F3E9", "#196DFF", "#050A12"],
    ["#8BF5FF", "#0C5BFF", "#07111F"],
    ["#39E9B8", "#2158FF", "#081322"],
    ["#FFFFFF", "#31F3E9", "#10203A"]
  ][index % 4];

  const svg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="1024" height="1024" rx="88" fill="${colors[2]}"/>
    <circle cx="722" cy="254" r="392" fill="${colors[0]}" opacity=".22"/>
    <circle cx="238" cy="772" r="360" fill="${colors[1]}" opacity=".32"/>
    <path d="M512 162L814 336V686L512 862L210 686V336L512 162Z" stroke="${colors[0]}" stroke-width="24" opacity=".92"/>
    <path d="M512 256L638 470H386L512 256Z" fill="white" opacity=".94"/>
    <path d="M350 652L512 744L674 652" stroke="white" stroke-width="30" stroke-linecap="round" opacity=".9"/>
    <text x="512" y="914" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="34" font-weight="700" letter-spacing="7">${prompt.slice(0, 28).toUpperCase()}</text>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function parseRequest(body: ImageRequest) {
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  const styleChipIds = Array.isArray(body.styleChipIds)
    ? body.styleChipIds.filter((item): item is string => typeof item === "string").slice(0, 4)
    : [];
  const allowed = new Set(STYLE_CHIPS.map((chip) => chip.id));

  if (prompt.length < 3 || prompt.length > 900) {
    return null;
  }

  if (!Array.isArray(body.styleChipIds) || styleChipIds.some((id) => !allowed.has(id as StyleChipId))) {
    return null;
  }

  return { prompt, styleChipIds };
}

export async function POST(request: Request) {
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    return NextResponse.json({ error: "Invalid request." }, { status: 415 });
  }

  const body = (await request.json().catch(() => null)) as ImageRequest | null;
  const parsed = body ? parseRequest(body) : null;

  if (!parsed) {
    return NextResponse.json({ error: "Invalid AI request." }, { status: 400 });
  }

  const clientKey = getClientKey(request);

  if (!checkLimit(clientKey)) {
    return NextResponse.json({ error: "Daily AI limit reached." }, { status: 429 });
  }

  const mockMode = process.env.AI_MOCK_MODE === "true";
  const composedPrompt = [
    parsed.prompt,
    stylePrompt(parsed.styleChipIds),
    "image-only collectible NFT artwork, no text unless explicitly requested, clean social drop presentation"
  ]
    .filter(Boolean)
    .join(", ");

  if (mockMode) {
    return NextResponse.json({
      images: [0, 1, 2, 3].map((index) => mockImage(parsed.prompt, index)),
      mock: true
    });
  }

  try {
    const images = await generateAiImages({ prompt: composedPrompt, count: 4 });
    return NextResponse.json({ images });
  } catch (error) {
    if (error instanceof AiImageGenerationError) {
      console.error("AI image generation failed", {
        status: error.status,
        message: error.message
      });

      return NextResponse.json({ error: error.publicMessage }, { status: error.status });
    }

    console.error("AI image route failed", error);
    return NextResponse.json({ error: "AI image generation failed." }, { status: 500 });
  }
}
