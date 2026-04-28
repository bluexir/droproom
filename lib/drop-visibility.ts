import { PLATFORM_WALLET } from "@/lib/constants";
import type { Drop } from "@/lib/types";

export const ADMIN_HIDDEN_DROP_STATUS = "review-pending" satisfies Drop["status"];

export function isAdminHiddenDropStatus(status?: string | null) {
  return status === ADMIN_HIDDEN_DROP_STATUS;
}

export function isAdminHiddenDrop(drop: Pick<Drop, "status">) {
  return isAdminHiddenDropStatus(drop.status);
}

export function isPlatformDrop(drop: Pick<Drop, "creatorAddress">) {
  return Boolean(drop.creatorAddress && drop.creatorAddress.toLowerCase() === PLATFORM_WALLET.toLowerCase());
}

export function compareAdminFeaturedDrops(left: Drop, right: Drop) {
  const platformPriority = Number(isPlatformDrop(right)) - Number(isPlatformDrop(left));
  if (platformPriority) return platformPriority;

  const leftLive = left.tokenId && left.minted < left.edition;
  const rightLive = right.tokenId && right.minted < right.edition;
  const livePriority = Number(rightLive) - Number(leftLive);
  if (livePriority) return livePriority;

  const leftCreated = Date.parse(left.createdAt);
  const rightCreated = Date.parse(right.createdAt);

  return (Number.isFinite(rightCreated) ? rightCreated : 0) - (Number.isFinite(leftCreated) ? leftCreated : 0);
}
