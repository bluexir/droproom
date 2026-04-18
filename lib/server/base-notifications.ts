import { isAddress } from "viem";

const BASE_NOTIFICATIONS_API = "https://dashboard.base.org/api/v1/notifications";
const MAX_TITLE_LENGTH = 30;
const MAX_MESSAGE_LENGTH = 200;
const MAX_TARGET_PATH_LENGTH = 500;
const MAX_BATCH_SIZE = 1000;

export type BaseNotificationUser = {
  address: string;
  notificationsEnabled: boolean;
};

type UsersResponse = {
  nextCursor?: string;
  success?: boolean;
  users?: unknown[];
};

type SendResponse = {
  failedCount?: number;
  failed_count?: number;
  results?: Array<{ failureReason?: string; sent: boolean; walletAddress: string }>;
  sentCount?: number;
  sent_count?: number;
  success?: boolean;
};

export class BaseNotificationError extends Error {
  public readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "BaseNotificationError";
    this.status = status;
  }
}

export function resolveBaseAppUrl(request: Request) {
  const configured = process.env.BASE_APP_URL?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");

  const requestUrl = new URL(request.url);
  return `${requestUrl.protocol}//${requestUrl.host}`;
}

export async function fetchBaseNotificationAudience(appUrl: string) {
  const apiKey = requireBaseDashboardApiKey();
  const users: BaseNotificationUser[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(`${BASE_NOTIFICATIONS_API}/app/users`);
    url.searchParams.set("app_url", appUrl);
    url.searchParams.set("notification_enabled", "true");
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        "x-api-key": apiKey
      }
    });

    const payload = (await response.json().catch(() => null)) as UsersResponse | { error?: string } | null;
    if (!response.ok) {
      throw new BaseNotificationError(readApiError(payload, "Base notification audience could not be loaded."), response.status);
    }

    const pageUsers = Array.isArray((payload as UsersResponse)?.users) ? (payload as UsersResponse).users ?? [] : [];
    users.push(...pageUsers.map(normalizeNotificationUser).filter((user): user is BaseNotificationUser => Boolean(user)));
    cursor = (payload as UsersResponse)?.nextCursor;
  } while (cursor);

  return users;
}

export async function sendBaseNotification(input: {
  appUrl: string;
  message: string;
  targetPath: string;
  title: string;
  walletAddresses: string[];
}) {
  const apiKey = requireBaseDashboardApiKey();
  const title = input.title.trim();
  const message = input.message.trim();
  const targetPath = normalizeTargetPath(input.targetPath);
  const walletAddresses = Array.from(
    new Set(input.walletAddresses.map((address) => address.trim()).filter((address) => isAddress(address)))
  );

  if (!walletAddresses.length) {
    throw new BaseNotificationError("There are no Base App users with notifications enabled yet.", 400);
  }

  if (!title || title.length > MAX_TITLE_LENGTH) {
    throw new BaseNotificationError(`Title must be 1-${MAX_TITLE_LENGTH} characters.`, 400);
  }

  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    throw new BaseNotificationError(`Message must be 1-${MAX_MESSAGE_LENGTH} characters.`, 400);
  }

  if (targetPath.length > MAX_TARGET_PATH_LENGTH) {
    throw new BaseNotificationError(`Target path must be ${MAX_TARGET_PATH_LENGTH} characters or less.`, 400);
  }

  let sentCount = 0;
  let failedCount = 0;
  const results: SendResponse["results"] = [];

  for (let index = 0; index < walletAddresses.length; index += MAX_BATCH_SIZE) {
    const batch = walletAddresses.slice(index, index + MAX_BATCH_SIZE);
    const response = await fetch(`${BASE_NOTIFICATIONS_API}/send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey
      },
      body: JSON.stringify({
        app_url: input.appUrl,
        message,
        target_path: targetPath,
        title,
        wallet_addresses: batch
      })
    });

    const payload = (await response.json().catch(() => null)) as SendResponse | { error?: string } | null;
    if (!response.ok) {
      throw new BaseNotificationError(readApiError(payload, "Base notification could not be sent."), response.status);
    }

    sentCount += (payload as SendResponse)?.sentCount ?? (payload as SendResponse)?.sent_count ?? 0;
    failedCount += (payload as SendResponse)?.failedCount ?? (payload as SendResponse)?.failed_count ?? 0;
    results.push(...((payload as SendResponse)?.results ?? []));
  }

  return {
    failedCount,
    results,
    sentCount,
    targetedCount: walletAddresses.length
  };
}

function requireBaseDashboardApiKey() {
  const apiKey = process.env.BASE_DASHBOARD_API_KEY?.trim();

  if (!apiKey) {
    throw new BaseNotificationError("BASE_DASHBOARD_API_KEY is not configured.", 503);
  }

  return apiKey;
}

function normalizeTargetPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function normalizeNotificationUser(value: unknown): BaseNotificationUser | null {
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  const address = record.address ?? record.walletAddress ?? record.wallet_address;
  const notificationsEnabled = record.notificationsEnabled ?? record.notificationEnabled ?? record.notification_enabled;

  if (typeof address !== "string" || !isAddress(address)) return null;
  if (notificationsEnabled === false) return null;

  return {
    address,
    notificationsEnabled: true
  };
}

function readApiError(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string") {
    return payload.error;
  }

  return fallback;
}
