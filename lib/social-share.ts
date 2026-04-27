"use client";

export type ShareIntent = "created" | "minted" | "collect";

export type ShareData = {
  creator?: string;
  edition?: number;
  remaining?: number;
  title: string;
  url: string;
};

function getShareText(intent: ShareIntent, data: ShareData) {
  if (intent === "created") {
    const editionLabel = data.edition ? `${data.edition} edition${data.edition === 1 ? "" : "s"}` : "limited editions";
    return `I just launched "${data.title}" on Droproom. ${editionLabel} are now live on Base. @droproombase`;
  }

  if (intent === "minted") {
    const scarcity = typeof data.remaining === "number" ? (data.remaining > 0 ? ` Only ${data.remaining} left.` : " It is now sold out.") : "";
    return `I just successfully minted "${data.title}" on Droproom.${scarcity} @droproombase`;
  }

  return `Collect "${data.title}" on Droproom${data.creator ? ` by ${data.creator}` : ""}. @droproombase`;
}

function getNativeSharePayload(data: ShareData, intent: ShareIntent) {
  return {
    text: getShareText(intent, data),
    title: data.title,
    url: data.url
  };
}

export function canUseNativeShare(data?: ShareData, intent: ShareIntent = "collect") {
  if (typeof navigator === "undefined" || !navigator.share) return false;
  if (!data || typeof navigator.canShare !== "function") return true;

  try {
    return navigator.canShare(getNativeSharePayload(data, intent));
  } catch {
    return true;
  }
}

export function openExternalUrl(url: string) {
  if (typeof window === "undefined") return;

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer external";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export function getXShareUrl(data: ShareData, intent: ShareIntent) {
  const url = new URL("https://x.com/intent/tweet");
  url.searchParams.set("text", getShareText(intent, data));
  url.searchParams.set("url", data.url);
  return url.toString();
}

export function getFarcasterShareUrl(data: ShareData, intent: ShareIntent) {
  const url = new URL("https://warpcast.com/~/compose");
  url.searchParams.set("text", getShareText(intent, data));
  url.searchParams.append("embeds[]", data.url);
  return url.toString();
}

export function getRedditShareUrl(data: ShareData, intent: ShareIntent) {
  const url = new URL("https://www.reddit.com/submit");
  url.searchParams.set("url", data.url);
  url.searchParams.set("title", getShareText(intent, data));
  return url.toString();
}

export function shareOnX(data: ShareData, intent: ShareIntent) {
  openExternalUrl(getXShareUrl(data, intent));
}

export function shareOnFarcaster(data: ShareData, intent: ShareIntent) {
  openExternalUrl(getFarcasterShareUrl(data, intent));
}

export function shareOnReddit(data: ShareData, intent: ShareIntent) {
  openExternalUrl(getRedditShareUrl(data, intent));
}

export async function shareNative(data: ShareData, intent: ShareIntent) {
  if (!canUseNativeShare(data, intent)) return false;

  try {
    await navigator.share(getNativeSharePayload(data, intent));
    return true;
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string) {
  if (typeof navigator === "undefined" || typeof document === "undefined") return false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fall through to the textarea copy path for browsers without Clipboard API
    // access, including some embedded mobile webviews.
  }

  try {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    document.body.appendChild(textArea);
    textArea.select();

    try {
      document.execCommand("copy");
      textArea.remove();
      return true;
    } catch {
      textArea.remove();
      return false;
    }
  } catch {
    return false;
  }
}
