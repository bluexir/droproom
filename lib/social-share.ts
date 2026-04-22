// lib/social-share.ts
// Sosyal medya paylaşım utilities

export interface ShareData {
  title: string;
  url: string;
  creator?: string;
  description?: string;
  remaining?: number;
  total?: number;
}

export type ShareType = 'minted' | 'created' | 'milestone' | 'collect';

/**
 * Paylaşım metni template'leri
 * Kullanıcı deneyimi için hazır, doğal metinler
 */
export const getShareText = (type: ShareType, data: ShareData): string => {
  const templates: Record<ShareType, string> = {
    minted: `Just minted "${data.title}" on @droproom_base 🎨\n\n${
      data.remaining && data.total 
        ? `Only ${data.remaining}/${data.total} left!` 
        : 'Limited edition!'
    }\n\n${data.url}`,
    
    created: `Dropped my new work "${data.title}" on Base ⚡️\n\n${
      data.total ? `${data.total} editions` : 'Limited'
    } • Free to collect\n\n${data.url}`,
    
    milestone: data.remaining && data.total && data.remaining < 10
      ? `🔥 Almost sold out! "${data.title}" - only ${data.remaining} left\n\n${data.url}`
      : `🔥 "${data.title}" is going fast on Base\n\n${data.url}`,
    
    collect: `Collect "${data.title}" on Droproom${data.creator ? ` by ${data.creator}` : ''}\n\n${data.url}`
  };
  
  return templates[type];
};

/**
 * X (Twitter) Paylaşımı
 * WEB STANDARD - Hem desktop hem mobile çalışır
 */
export const shareOnTwitter = (data: ShareData, type: ShareType = 'collect'): void => {
  const text = getShareText(type, data);
  
  // Twitter web intent - her platformda çalışır
  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
  
  // Popup pencere aç (Twitter'ın önerdiği boyut)
  const width = 550;
  const height = 420;
  const left = window.innerWidth / 2 - width / 2;
  const top = window.innerHeight / 2 - height / 2;
  
  window.open(
    twitterUrl,
    'twitter-share',
    `width=${width},height=${height},left=${left},top=${top},toolbar=0,status=0,resizable=1`
  );
};

/**
 * Farcaster (Warpcast) Paylaşımı
 */
export const shareOnFarcaster = (data: ShareData, type: ShareType = 'collect'): void => {
  const text = getShareText(type, data);
  
  const warpcastUrl = `https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`;
  
  window.open(warpcastUrl, '_blank', 'noopener,noreferrer');
};

/**
 * Reddit Paylaşımı
 */
export const shareOnReddit = (data: ShareData): void => {
  const redditUrl = new URL('https://www.reddit.com/submit');
  redditUrl.searchParams.set('url', data.url);
  redditUrl.searchParams.set('title', data.title);
  
  window.open(redditUrl.toString(), '_blank', 'noopener,noreferrer');
};

/**
 * Native Share API (Mobile)
 * Eğer destekleniyorsa native share sheet'i kullan
 */
export const shareNative = async (data: ShareData, type: ShareType = 'collect'): Promise<boolean> => {
  if (!navigator.share) {
    return false;
  }
  
  try {
    await navigator.share({
      title: data.title,
      text: getShareText(type, data),
      url: data.url
    });
    return true;
  } catch (error) {
    // User cancelled or share failed
    if (error instanceof Error && error.name === 'AbortError') {
      // Kullanıcı iptal etti - bu bir hata değil
      return false;
    }
    console.error('Share failed:', error);
    return false;
  }
};

/**
 * Copy link to clipboard
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback: eski yöntem
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      document.body.removeChild(textArea);
      return true;
    } catch {
      document.body.removeChild(textArea);
      return false;
    }
  }
};

/**
 * Base App detection
 * Base App içinde miyiz kontrol et
 */
export const isBaseApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return /BaseApp|Base\/[0-9]/i.test(navigator.userAgent);
};
