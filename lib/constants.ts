export const APP_NAME = "Droproom";
export const PLATFORM_FEE_BPS = Number(process.env.NEXT_PUBLIC_PLATFORM_FEE_BPS ?? 1000);
export const PLATFORM_FEE_PERCENT = PLATFORM_FEE_BPS / 100;
export const PLATFORM_WALLET =
  process.env.NEXT_PUBLIC_PLATFORM_WALLET ?? "0x152bB9d22d0a980d915F1052eDEF859A9383b7BF";
export const EDITION_MAX = 999;
export const TOKEN_UNLOCK_MIN_EDITION = 25;
export const AI_DAILY_JOB_LIMIT = 10;

export const STYLE_CHIPS = [
  { id: "minimal", label: "Minimal", prompt: "minimal, clean composition, strong negative space" },
  { id: "cyber", label: "Cyber", prompt: "cyber, luminous cyan accents, futuristic studio lighting" },
  { id: "premium", label: "Premium", prompt: "premium editorial art direction, polished and restrained" },
  { id: "poster", label: "Poster", prompt: "bold poster design, collectible composition, high contrast" },
  { id: "dream", label: "Dream", prompt: "dreamlike atmosphere, soft gradients, cinematic light" },
  { id: "playful", label: "Playful", prompt: "playful collectible card style, expressive shapes, vibrant energy" }
] as const;

export type StyleChipId = (typeof STYLE_CHIPS)[number]["id"];

export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
