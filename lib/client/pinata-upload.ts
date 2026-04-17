"use client";

import { MAX_UPLOAD_BYTES } from "@/lib/constants";
import { ipfsUriToGatewayUrl, toIpfsUri } from "@/lib/ipfs";

export type UploadedAsset = {
  cid: string;
  gatewayUrl: string;
  ipfsUri: string;
  mimeType: string;
};

type SignedUploadResponse = {
  error?: string;
  gatewayUrl?: string;
  maxBytes?: number;
  signedUrl?: string;
};

export function dataUrlToFile(dataUrl: string, filename: string) {
  const match = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(dataUrl);

  if (!match) {
    throw new Error("Artwork must be an uploaded, generated, or blank image before publishing.");
  }

  const mimeType = match[1];
  const isBase64 = Boolean(match[2]);
  const body = match[3] ?? "";
  const bytes = isBase64 ? base64ToBytes(body) : new TextEncoder().encode(decodeURIComponent(body));

  return new File([bytes], filename, { type: mimeType });
}

export async function uploadFileToPinata(file: File): Promise<UploadedAsset> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Artwork is too large. Keep GIFs and images under 10 MB for V1.");
  }

  const signedResponse = await fetch("/api/uploads/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename: file.name, mimeType: file.type })
  });
  const signed = (await signedResponse.json().catch(() => null)) as SignedUploadResponse | null;

  if (!signedResponse.ok || !signed?.signedUrl) {
    throw new Error(signed?.error ?? "Could not prepare upload.");
  }

  const form = new FormData();
  form.append("file", file);
  form.append("network", "public");

  const uploadResponse = await fetch(signed.signedUrl, {
    method: "POST",
    body: form
  });
  const payload = (await uploadResponse.json().catch(() => null)) as unknown;
  const cid = readCid(payload);

  if (!uploadResponse.ok || !cid) {
    throw new Error("Pinata upload failed.");
  }

  const ipfsUri = toIpfsUri(cid);
  return {
    cid,
    gatewayUrl: ipfsUriToGatewayUrl(ipfsUri, signed.gatewayUrl),
    ipfsUri,
    mimeType: file.type
  };
}

export async function uploadJsonToPinata(filename: string, value: unknown) {
  const file = new File([JSON.stringify(value, null, 2)], filename, { type: "application/json" });
  return uploadFileToPinata(file);
}

function readCid(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const object = payload as Record<string, unknown>;
  const data = object.data && typeof object.data === "object" ? (object.data as Record<string, unknown>) : null;
  const candidates = [
    object.cid,
    object.IpfsHash,
    object.ipfsHash,
    object.hash,
    data?.cid,
    data?.IpfsHash,
    data?.ipfsHash,
    data?.hash
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }

  return null;
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
