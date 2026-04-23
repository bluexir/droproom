"use client";

import confetti from "canvas-confetti";
import { useEffect, useMemo, useState } from "react";

import { copyToClipboard, shareOnFarcaster, shareOnReddit, shareOnX, type ShareData } from "@/lib/social-share";

type MintSuccessModalProps = {
  drop: {
    creator?: string;
    edition: number;
    image: string;
    minted: number;
    title: string;
  };
  mintNumber: number;
  onClose: () => void;
  onOpenLibrary: () => void;
  shareUrl: string;
};

export function MintSuccessModal({ drop, mintNumber, onClose, onOpenLibrary, shareUrl }: MintSuccessModalProps) {
  const [feedback, setFeedback] = useState("");

  const shareData = useMemo<ShareData>(
    () => ({
      creator: drop.creator,
      edition: drop.edition,
      remaining: Math.max(drop.edition - drop.minted, 0),
      title: drop.title,
      url: shareUrl
    }),
    [drop.creator, drop.edition, drop.minted, drop.title, shareUrl]
  );

  useEffect(() => {
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
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  async function handleCopy() {
    const copied = await copyToClipboard(shareUrl);
    setFeedback(copied ? "Mint link copied." : "Mint link could not be copied here.");
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <section aria-modal="true" className="mint-success-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="mint-success-burst" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>

        <div className="mint-success-badge">Collected on Base</div>
        <h2>You minted #{mintNumber}.</h2>
        <p className="mint-success-copy">
          <strong>{drop.title}</strong> is now in your collection. Share it while collectors can still open the live drop.
        </p>

        <div className="mint-success-art">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={drop.title} src={drop.image} />
        </div>

        <div className="mint-success-stats">
          <span>{Math.max(drop.edition - drop.minted, 0)} left</span>
          <span>{drop.minted}/{drop.edition} minted</span>
        </div>

        <div className="mint-success-actions">
          <button className="primary-button" onClick={onOpenLibrary} type="button">
            View library <span>Collected</span>
          </button>
          <button className="secondary-button" onClick={handleCopy} type="button">
            Copy link
          </button>
        </div>

        <div className="social-share-row">
          <button className="social-chip" onClick={() => shareOnX(shareData, "minted")} type="button">
            X
          </button>
          <button className="social-chip" onClick={() => shareOnFarcaster(shareData, "minted")} type="button">
            Farcaster
          </button>
          <button className="social-chip" onClick={() => shareOnReddit(shareData, "minted")} type="button">
            Reddit
          </button>
        </div>

        {feedback ? <p className="mint-success-feedback">{feedback}</p> : null}

        <button className="close-modal-button" onClick={onClose} type="button">
          Close
        </button>
      </section>
    </div>
  );
}
