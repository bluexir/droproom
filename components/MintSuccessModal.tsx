// components/MintSuccessModal.tsx
"use client";

import { useEffect } from "react";
import confetti from "canvas-confetti";
import { shareOnTwitter, shareOnFarcaster, shareOnReddit, shareNative, copyToClipboard, type ShareData } from "@/lib/social-share";

interface MintSuccessModalProps {
  drop: {
    id: string;
    title: string;
    image: string;
    edition: number;
    minted: number;
  };
  mintNumber: number;
  onClose: () => void;
  shareUrl: string;
}

export function MintSuccessModal({ drop, mintNumber, onClose, shareUrl }: MintSuccessModalProps) {
  // Konfeti patlatma - modal açıldığında
  useEffect(() => {
    // İlk konfeti patlaması
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#31F3E9', '#196DFF', '#8BF5FF', '#FFFFFF']
    });

    // 0.3 saniye sonra ikinci patlama
    const timeout1 = setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.6 },
        colors: ['#31F3E9', '#196DFF']
      });
    }, 300);

    // 0.6 saniye sonra üçüncü patlama
    const timeout2 = setTimeout(() => {
      confetti({
        particleCount: 50,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.6 },
        colors: ['#8BF5FF', '#FFFFFF']
      });
    }, 600);

    return () => {
      clearTimeout(timeout1);
      clearTimeout(timeout2);
    };
  }, []);

  const shareData: ShareData = {
    title: drop.title,
    url: shareUrl,
    remaining: drop.edition - drop.minted,
    total: drop.edition
  };

  const handleCopyLink = async () => {
    const success = await copyToClipboard(shareUrl);
    if (success) {
      // UI feedback - notice sistemini kullan
      alert('Link copied to clipboard! ✓');
    }
  };

  const handleShare = async () => {
    // Önce native share dene
    const shared = await shareNative(shareData, 'minted');
    if (!shared) {
      // Fallback: X'e yönlendir
      shareOnTwitter(shareData, 'minted');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="mint-success-modal" onClick={(e) => e.stopPropagation()}>
        <div className="success-icon">🎉</div>
        
        <h2>Mint Successful!</h2>
        <p className="success-message">
          You own <strong>#{mintNumber}</strong> of {drop.edition}
        </p>

        <div className="success-nft-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={drop.image} alt={drop.title} />
          <span className="nft-title">{drop.title}</span>
        </div>

        <div className="success-actions">
          <button className="primary-button wide" onClick={handleCopyLink}>
            Copy Link ✓
          </button>
          <button className="secondary-button wide" onClick={handleShare}>
            Share Your Mint
          </button>
        </div>

        <div className="social-share-row">
          <button 
            className="social-button x-button"
            onClick={() => shareOnTwitter(shareData, 'minted')}
            type="button"
          >
            <span>𝕏</span>
          </button>
          <button 
            className="social-button farcaster-button"
            onClick={() => shareOnFarcaster(shareData, 'minted')}
            type="button"
          >
            <span>⬡</span>
          </button>
          <button 
            className="social-button reddit-button"
            onClick={() => shareOnReddit(shareData)}
            type="button"
          >
            <span>▲</span>
          </button>
        </div>

        <button className="close-modal-button" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
