type ImageProvider = "cloudflare" | "openai";

type GenerateAiImagesOptions = {
  prompt: string;
  count: number;
};

type JsonObject = Record<string, unknown>;

export class AiImageGenerationError extends Error {
  public readonly publicMessage: string;
  public readonly status: number;

  constructor(publicMessage: string, status = 502, detail?: unknown) {
    super(formatErrorMessage(publicMessage, detail));
    this.name = "AiImageGenerationError";
    this.publicMessage = publicMessage;
    this.status = status;
  }
}

export async function generateAiImages({ prompt, count }: GenerateAiImagesOptions) {
  const provider = resolveProvider();

  if (provider === "cloudflare") {
    return generateWithCloudflare(prompt, count);
  }

  return generateWithOpenAI(prompt, count);
}

function resolveProvider(): ImageProvider {
  const configured = process.env.AI_PROVIDER?.trim().toLowerCase();

  if (!configured) {
    return process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN ? "cloudflare" : "openai";
  }

  if (configured === "cloudflare" || configured === "openai") return configured;

  throw new AiImageGenerationError("AI provider is not configured correctly.", 503, `Unsupported provider: ${configured}`);
}

async function generateWithCloudflare(prompt: string, count: number) {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  const model = sanitizeCloudflareModel(
    process.env.CLOUDFLARE_AI_MODEL?.trim() || "@cf/bytedance/stable-diffusion-xl-lightning"
  );

  if (!accountId || !token) {
    throw new AiImageGenerationError(
      "AI is not configured. Add Cloudflare account id and API token.",
      503,
      "Missing CLOUDFLARE_ACCOUNT_ID or CLOUDFLARE_API_TOKEN."
    );
  }

  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
    accountId
  )}/ai/run/${model}`;

  const jobs = Array.from({ length: count }, (_, index) => {
    const seed = randomSeed(index);
    return fetchCloudflareImage(endpoint, token, prompt, seed);
  });

  const images = await Promise.all(jobs);
  return images.filter(Boolean);
}

async function fetchCloudflareImage(endpoint: string, token: string, prompt: string, seed: number) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      prompt,
      negative_prompt: "text, watermark, logo, signature, blurry, low quality, distorted anatomy",
      width: 1024,
      height: 1024,
      num_steps: 8,
      guidance: 7.5,
      seed
    })
  });

  if (!response.ok) {
    const detail = await readProviderError(response);
    throw new AiImageGenerationError(publicProviderMessage("Cloudflare", response.status), response.status, detail);
  }

  return parseCloudflareImage(response);
}

async function parseCloudflareImage(response: Response) {
  const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "";

  if (contentType.includes("json")) {
    const payload = (await response.json().catch(() => null)) as unknown;
    const image = extractImageFromJson(payload);

    if (!image) {
      throw new AiImageGenerationError("AI returned an unreadable image response.", 502, payload);
    }

    return image;
  }

  if (!contentType.startsWith("image/") && contentType !== "application/octet-stream") {
    const text = await response.text().catch(() => "");
    throw new AiImageGenerationError("AI returned an unreadable image response.", 502, text || contentType);
  }

  const bytes = await response.arrayBuffer();

  if (!bytes.byteLength) {
    throw new AiImageGenerationError("AI returned an empty image response.", 502);
  }

  const mime = contentType.startsWith("image/") ? contentType : "image/png";
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

async function generateWithOpenAI(prompt: string, count: number) {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (!openaiKey) {
    throw new AiImageGenerationError("AI is not configured. Add an OpenAI API key or switch to Cloudflare.", 503);
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMAGE_MODEL?.trim() || "gpt-image-1.5",
      prompt,
      n: count,
      size: "1024x1024",
      quality: "low",
      output_format: "png"
    })
  });

  const payload = (await response.json().catch(() => null)) as {
    data?: Array<{ b64_json?: string; url?: string }>;
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    const detail = payload?.error?.message || response.statusText;
    throw new AiImageGenerationError(publicProviderMessage("OpenAI", response.status), response.status, detail);
  }

  const images =
    payload?.data
      ?.map((item) => (item.b64_json ? `data:image/png;base64,${item.b64_json}` : item.url))
      .filter((value): value is string => Boolean(value)) ?? [];

  if (!images.length) {
    throw new AiImageGenerationError("AI returned no images.", 502, payload);
  }

  return images;
}

function extractImageFromJson(payload: unknown): string | null {
  if (!isObject(payload)) return null;

  const candidates = [
    payload.image,
    payload.dataURI,
    payload.b64_json,
    payload.result,
    isObject(payload.result) ? payload.result.image : undefined,
    isObject(payload.result) ? payload.result.dataURI : undefined,
    isObject(payload.result) ? payload.result.b64_json : undefined
  ];

  for (const candidate of candidates) {
    const image = normalizeImageValue(candidate);
    if (image) return image;
  }

  const arrays = [payload.images, payload.data, isObject(payload.result) ? payload.result.images : undefined];
  for (const candidate of arrays) {
    if (!Array.isArray(candidate)) continue;

    for (const item of candidate) {
      const image = normalizeImageValue(item) || (isObject(item) ? normalizeImageValue(item.image ?? item.b64_json) : null);
      if (image) return image;
    }
  }

  return null;
}

function normalizeImageValue(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  const image = value.trim();
  if (image.startsWith("data:image/")) return image;
  if (image.startsWith("http://") || image.startsWith("https://")) return image;

  if (looksLikeBase64(image)) {
    return `data:${detectImageMime(image)};base64,${image}`;
  }

  return null;
}

function looksLikeBase64(value: string) {
  return value.length > 100 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function detectImageMime(base64: string) {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

function sanitizeCloudflareModel(model: string) {
  if (!model.startsWith("@cf/") || /\s/.test(model)) {
    throw new AiImageGenerationError("Cloudflare AI model is not configured correctly.", 503, model);
  }

  return model.replace(/^\/+/, "");
}

async function readProviderError(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("json")) {
    const payload = (await response.json().catch(() => null)) as unknown;
    if (isObject(payload)) {
      const errors = payload.errors;
      if (Array.isArray(errors)) {
        return errors
          .map((item) => (isObject(item) && typeof item.message === "string" ? item.message : null))
          .filter(Boolean)
          .join(" | ");
      }

      if (typeof payload.error === "string") return payload.error;
      if (isObject(payload.error) && typeof payload.error.message === "string") return payload.error.message;
      if (typeof payload.message === "string") return payload.message;
    }

    return payload;
  }

  return response.text().catch(() => response.statusText);
}

function publicProviderMessage(provider: string, status: number) {
  if (status === 401 || status === 403) {
    return `${provider} credentials are invalid or missing permissions.`;
  }

  if (status === 402 || status === 429) {
    return `${provider} quota or billing limit has been reached.`;
  }

  if (status >= 400 && status < 500) {
    return `${provider} rejected this image request. Try a simpler prompt.`;
  }

  return `${provider} image generation failed. Please try again.`;
}

function randomSeed(index: number) {
  return Math.floor(Math.random() * 2_000_000_000) + index;
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function formatErrorMessage(publicMessage: string, detail: unknown) {
  if (!detail) return publicMessage;
  if (detail instanceof Error) return `${publicMessage} ${detail.message}`;
  if (typeof detail === "string") return `${publicMessage} ${detail}`;
  return `${publicMessage} ${JSON.stringify(detail)}`;
}
