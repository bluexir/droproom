const DEFAULT_HIDDEN_DROP_IDS = "2";

function getHiddenDropIdSet() {
  const configured =
    process.env.NEXT_PUBLIC_HIDDEN_DROP_IDS ??
    process.env.DROPROOM_HIDDEN_DROP_IDS ??
    DEFAULT_HIDDEN_DROP_IDS;

  return new Set(
    configured
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
  );
}

export function isHiddenDropId(tokenId?: string | null) {
  return Boolean(tokenId && getHiddenDropIdSet().has(tokenId));
}

export function isVisibleDropId(tokenId?: string | null) {
  return !isHiddenDropId(tokenId);
}
