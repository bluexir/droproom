import { NextResponse } from "next/server";

import { MAX_UPLOAD_BYTES, PINATA_UPLOAD_MIME_TYPES } from "@/lib/constants";

export const runtime = "nodejs";

type SignRequest = {
  filename?: unknown;
  mimeType?: unknown;
};

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

function getPinataAuthHeaders(): Record<string, string> | null {
  const apiKey = process.env.PINATA_API_KEY?.trim();
  const apiSecret = process.env.PINATA_API_SECRET?.trim();

  if (apiKey && apiSecret) {
    return {
      pinata_api_key: apiKey,
      pinata_secret_api_key: apiSecret
    };
  }

  const token = process.env.PINATA_JWT?.trim();
  return token ? { Authorization: `Bearer ${token}` } : null;
}

function readSignedUrl(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;

  const object = payload as Record<string, unknown>;
  const direct = typeof object.url === "string" ? object.url : null;
  const dataString = typeof object.data === "string" ? object.data : null;
  const data = object.data && typeof object.data === "object" ? (object.data as Record<string, unknown>) : null;
  const nested = typeof data?.url === "string" ? data.url : null;

  return direct ?? dataString ?? nested;
}

export async function POST(request: Request) {
  const authHeaders = getPinataAuthHeaders();

  if (!authHeaders) {
    return NextResponse.json({ error: "Pinata is not configured." }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as SignRequest | null;
  const filename = typeof body?.filename === "string" ? body.filename.trim().slice(0, 120) : "";
  const mimeType = typeof body?.mimeType === "string" ? body.mimeType.trim().toLowerCase() : "";

  if (!filename) return badRequest("filename is required.");
  if (!PINATA_UPLOAD_MIME_TYPES.includes(mimeType)) return badRequest("Unsupported upload type.");

  const response = await fetch("https://uploads.pinata.cloud/v3/files/sign", {
    method: "POST",
    headers: {
      ...authHeaders,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      date: Math.floor(Date.now() / 1000),
      expires: 600,
      filename,
      max_file_size: MAX_UPLOAD_BYTES,
      allow_mime_types: PINATA_UPLOAD_MIME_TYPES
    })
  });

  const payload = (await response.json().catch(() => null)) as unknown;
  const signedUrl = readSignedUrl(payload);

  if (!response.ok || !signedUrl) {
    console.error("Pinata signed URL failed", payload);
    return NextResponse.json({ error: "Could not prepare Pinata upload." }, { status: response.status || 502 });
  }

  return NextResponse.json({
    signedUrl,
    maxBytes: MAX_UPLOAD_BYTES,
    gatewayUrl: process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL ?? process.env.PINATA_GATEWAY_URL ?? "https://gateway.pinata.cloud"
  });
}
