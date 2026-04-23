"use client";

export type ShareIntent = "created" | "minted" | "collect";

export type ShareData = {
  creator?: string;
  edition?: number;
  remaining?: number;
  title: string;
  url: string;
};

const MOBILE_APP_FALLBACK_DELAY = 900;

function getShareText(intent: ShareIntent, data: ShareData) {
  if (intent === "created") {
    const editionLabel = data.edition ? `${data.edition} edition${data.edition === 1 ? "" : "s"}` : "limited editions";
    return `I just launched "${data.title}" on Droproom. ${editionLabel} are now live on Base.`;
  }

  if (intent === "minted") {
    const scarcity = typeof data.remaining === "number" ? (data.remaining > 0 ? ` Only ${data.remaining} left.` : " It is now sold out.") : "";
    return `I just collected "${data.title}" on Droproom.${scarcity}`;
  }

  return `Collect "${data.title}" on Droproom${data.creator ? ` by ${data.creator}` : ""}.`;
}

export function openExternalUrl(url: string) {
  if (typeof window === "undefined") return;

  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (popup) {
    popup.opener = null;
    return;
  }

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.target = "_blank";
  anchor.rel = "noopener noreferrer external";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function isLikelyMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent);
}

function openNativeAppUrl(appUrl: string, webUrl: string) {
  if (typeof window === "undefined") return;

  if (!isLikelyMobileDevice()) {
    openExternalUrl(webUrl);
    return;
  }

  const fallbackTimer = window.setTimeout(() => {
    openExternalUrl(webUrl);
  }, MOBILE_APP_FALLBACK_DELAY);

  const clearFallback = () => {
    window.clearTimeout(fallbackTimer);
    document.removeEventListener("visibilitychange", clearFallback);
    window.removeEventListener("pagehide", clearFallback);
  };

  document.addEventListener("visibilitychange", clearFallback, { once: true });
  window.addEventListener("pagehide", clearFallback, { once: true });
  window.location.href = appUrl;
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
  const text = `${getShareText(intent, data)} ${data.url}`.trim();
  const nativeUrl = `twitter://post?message=${encodeURIComponent(text)}`;
  openNativeAppUrl(nativeUrl, getXShareUrl(data, intent));
}

export function shareOnFarcaster(data: ShareData, intent: ShareIntent) {
  const text = getShareText(intent, data);
  const nativeUrl = `warpcast://compose?text=${encodeURIComponent(text)}&embeds[]=${encodeURIComponent(data.url)}`;
  openNativeAppUrl(nativeUrl, getFarcasterShareUrl(data, intent));
}

export function shareOnReddit(data: ShareData, intent: ShareIntent) {
  const nativeUrl = `reddit://submit?url=${encodeURIComponent(data.url)}&title=${encodeURIComponent(getShareText(intent, data))}`;
  openNativeAppUrl(nativeUrl, getRedditShareUrl(data, intent));
}

export async function shareNative(data: ShareData, intent: ShareIntent) {
  if (!navigator.share) return false;

  try {
    await navigator.share({
      text: getShareText(intent, data),
      title: data.title,
      url: data.url
    });
    return true;
  } catch {
    return false;
  }
}

export async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
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
  }
}
