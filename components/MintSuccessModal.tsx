"use client";

import confetti from "canvas-confetti";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  canUseNativeShare,
  copyToClipboard,
  shareNative,
  shareOnFarcaster,
  shareOnReddit,
  shareOnX,
  type ShareData
} from "@/lib/social-share";

type MintSuccessModalProps = {
  drop: {
    creator?: string;
    edition: number;
    image: string;
    minted: number;
    tokenId?: string;
    title: string;
  };
  mintNumber: number;
  onClose: () => void;
  onOpenLibrary: () => void;
  shareUrl: string;
  tokenId?: string;
};

export function MintSuccessModal({ drop, mintNumber, onClose, onOpenLibrary, shareUrl, tokenId }: MintSuccessModalProps) {
  const [feedback, setFeedback] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const resolvedTokenId = tokenId ?? drop.tokenId;
  const remainingCount = Math.max(drop.edition - drop.minted, 0);

  const shareData = useMemo<ShareData>(
    () => ({
      creator: drop.creator,
      edition: drop.edition,
      remaining: remainingCount,
      title: drop.title,
      url: shareUrl
    }),
    [drop.creator, drop.edition, drop.title, remainingCount, shareUrl]
  );

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    void confetti({
      colors: ["#31f3e9", "#196dff", "#ffd76a", "#ffffff"],
      disableForReducedMotion: true,
      origin: { y: 0.68 },
      particleCount: 120,
      scalar: 0.9,
      spread: 78,
      ticks: 180
    });
    window.setTimeout(() => {
      void confetti({
        colors: ["#31f3e9", "#ffd76a", "#ffffff"],
        disableForReducedMotion: true,
        origin: { y: 0.72 },
        particleCount: 70,
        scalar: 0.75,
        spread: 56,
        ticks: 150
      });
    }, 280);
  }, []);

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const originalBodyOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    dialogRef.current?.focus();

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      previousActiveElement?.focus();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => !element.hasAttribute("disabled") && element.getAttribute("aria-hidden") !== "true");

      if (focusableElements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleNativeShare() {
    setFeedback("");

    if (canUseNativeShare(shareData, "minted")) {
      const shared = await shareNative(shareData, "minted");
      setFeedback(shared ? "Share sheet opened." : "Share was not completed.");
      return;
    }

    const copied = await copyToClipboard(shareUrl);
    setFeedback(copied ? "Native sharing is not available here, so the link was copied." : "Native sharing is not available here.");
  }

  async function handleCopy() {
    const copied = await copyToClipboard(shareUrl);
    setFeedback(copied ? "Mint link copied." : "Mint link could not be copied here.");
  }

  return (
    <div className="modal-overlay mint-success-overlay" onClick={onClose}>
      <section
        aria-describedby={descriptionId}
        aria-labelledby={headingId}
        aria-modal="true"
        className="mint-success-modal"
        onClick={(event) => event.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="mint-success-burst" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <button aria-label="Close mint success dialog" className="close-modal-button" onClick={onClose} type="button">
          Close
        </button>

        <div className="mint-success-header">
          <div className="mint-success-badge">Minted on Base</div>
          <h2 id={headingId}>Successfully minted</h2>
          <p className="mint-success-copy" id={descriptionId}>
            <strong>{drop.title}</strong> is now in your collection. Share the live drop while collectors can still mint.
          </p>
        </div>

        <div className="mint-success-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img aria-hidden="true" alt="" className="artwork-backdrop" src={drop.image} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={drop.title} className="artwork-main" src={drop.image} />
        </div>

        <dl className={`mint-success-token-grid${resolvedTokenId ? "" : " single"}`} aria-label="Mint details">
          {resolvedTokenId ? (
            <div className="mint-success-token-stat">
              <dt>Token ID</dt>
              <dd>#{resolvedTokenId}</dd>
            </div>
          ) : null}
          <div className="mint-success-token-stat">
            <dt>Mint number</dt>
            <dd>#{mintNumber}</dd>
          </div>
        </dl>

        <div className="mint-success-stats">
          <span>{remainingCount} left</span>
          <span>{drop.minted}/{drop.edition} minted</span>
        </div>

        <div className="mint-success-actions">
          <button className="primary-button mint-success-native-share" onClick={() => void handleNativeShare()} type="button">
            Share
          </button>
          <button className="secondary-button" onClick={handleCopy} type="button">
            Copy link
          </button>
          <button className="secondary-button" onClick={onOpenLibrary} type="button">
            View library
          </button>
        </div>

        <div className="mint-success-share-row" aria-label="Social sharing options" role="group">
          <button aria-label="Share minted drop on X" className="mint-success-share-button" onClick={() => shareOnX(shareData, "minted")} type="button">
            X
          </button>
          <button
            aria-label="Share minted drop on Farcaster"
            className="mint-success-share-button"
            onClick={() => shareOnFarcaster(shareData, "minted")}
            type="button"
          >
            Farcaster
          </button>
          <button
            aria-label="Share minted drop on Reddit"
            className="mint-success-share-button reddit"
            onClick={() => shareOnReddit(shareData, "minted")}
            type="button"
          >
            Reddit
          </button>
        </div>

        <p aria-live="polite" className="mint-success-feedback">
          {feedback}
        </p>
      </section>
    </div>
  );
}
