import { getAddress, isAddress, verifyMessage, type Address, type Hex } from "viem";

const ADMIN_SIGNATURE_TTL_MS = 5 * 60 * 1000;

export type AdminAuthPayload = {
  address?: unknown;
  message?: unknown;
  signature?: unknown;
};

export class AdminAuthError extends Error {
  public readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AdminAuthError";
    this.status = status;
  }
}

export async function verifyDroproomAdminRequest(
  request: Request,
  auth: AdminAuthPayload | undefined,
  expectedAction: string
) {
  const adminWallet = resolveAdminWallet();

  if (typeof auth?.address !== "string" || typeof auth.message !== "string" || typeof auth.signature !== "string") {
    throw new AdminAuthError("Missing admin wallet signature.");
  }

  const signer = getAddress(auth.address);
  if (signer !== adminWallet) {
    throw new AdminAuthError("Connected wallet is not the Droproom admin wallet.");
  }

  const action = readSignedField(auth.message, "Action");
  if (action !== expectedAction) {
    throw new AdminAuthError("Admin signature action does not match this request.");
  }

  const signedHost = readSignedField(auth.message, "Domain");
  const requestHost = new URL(request.url).host;
  if (signedHost !== requestHost) {
    throw new AdminAuthError("Admin signature domain does not match this app.");
  }

  const issuedAt = Date.parse(readSignedField(auth.message, "Issued At"));
  if (!Number.isFinite(issuedAt) || Math.abs(Date.now() - issuedAt) > ADMIN_SIGNATURE_TTL_MS) {
    throw new AdminAuthError("Admin signature expired. Please sign again.");
  }

  const valid = await verifyMessage({
    address: adminWallet,
    message: auth.message,
    signature: auth.signature as Hex
  });

  if (!valid) {
    throw new AdminAuthError("Admin wallet signature could not be verified.");
  }

  return adminWallet;
}

function resolveAdminWallet(): Address {
  const value = process.env.NEXT_PUBLIC_PLATFORM_WALLET?.trim() || "0x152bB9d22d0a980d915F1052eDEF859A9383b7BF";

  if (!isAddress(value)) {
    throw new AdminAuthError("Droproom admin wallet is not configured correctly.", 500);
  }

  return getAddress(value);
}

function readSignedField(message: string, label: string) {
  const prefix = `${label}:`;
  const line = message
    .split("\n")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  if (!line) return "";
  return line.slice(prefix.length).trim();
}
