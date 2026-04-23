"use client";

import Image from "next/image";
import { useCallback, useEffect, useState, type ReactNode, type TouchEvent } from "react";
import { parseEther } from "viem";

import { MintSuccessModal } from "@/components/MintSuccessModal";
import {
  ACCEPTED_IMAGE_TYPES,
  AI_DAILY_JOB_LIMIT,
  EDITION_MAX,
  MAX_UPLOAD_BYTES,
  PLATFORM_WALLET,
  PLATFORM_FEE_PERCENT,
  STYLE_CHIPS,
  TOKEN_UNLOCK_MIN_EDITION,
  type StyleChipId
} from "@/lib/constants";
import { useDroproomContract } from "@/hooks/useDroproomContract";
import { dataUrlToFile, uploadFileToPinata, uploadJsonToPinata } from "@/lib/client/pinata-upload";
import { getCreatorTokenEligibility } from "@/lib/eligibility";
import { copyToClipboard, shareOnFarcaster, shareOnReddit, shareOnX, type ShareData } from "@/lib/social-share";
import type { Drop, StartMode, StudioDraft } from "@/lib/types";

type View = "explore" | "create" | "dashboard" | "library";
type CreateStep = "start" | "studio" | "review";
type BaseNotificationAdminInput = {
  action: "audience" | "send" | "test";
  message?: string;
  targetPath?: string;
  title?: string;
};
type BaseNotificationAdminResult = {
  appUrl?: string;
  error?: string;
  failedCount?: number;
  notificationEnabledCount?: number;
  sentCount?: number;
  targetedCount?: number;
  users?: string[];
};
type BaseNotificationAdminRequester = (input: BaseNotificationAdminInput) => Promise<BaseNotificationAdminResult>;

const libraryKey = "droproom:library:v1";
const brandIconPrimary = "/brand/droproom-logo-main.png";
const heroFallbackImage = "/brand/droproom-premium-hero.png";
const viewOrder: View[] = ["explore", "create", "dashboard", "library"];

const defaultDraft: StudioDraft = {
  title: "Untitled Drop",
  description: "A limited edition NFT drop created on Droproom.",
  image: "",
  background: "#07111f",
  frame: "clean",
  overlayText: "",
  edition: 99,
  price: 0,
  isFree: true
};

function createBlankArtwork(title = "DROPROOM", background = "#07111f") {
  const svg = `<svg width="1200" height="1200" viewBox="0 0 1200 1200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="1200" height="1200" rx="116" fill="${background}"/>
    <rect x="88" y="88" width="1024" height="1024" rx="86" fill="url(#card)" stroke="rgba(255,255,255,.24)" stroke-width="3"/>
    <circle cx="812" cy="266" r="360" fill="#31F3E9" opacity=".18"/>
    <circle cx="338" cy="914" r="420" fill="#196DFF" opacity=".2"/>
    <path d="M320 410H880C917.555 410 948 440.445 948 478V736C948 773.555 917.555 804 880 804H320C282.445 804 252 773.555 252 736V478C252 440.445 282.445 410 320 410Z" fill="rgba(255,255,255,.065)" stroke="rgba(255,255,255,.24)" stroke-width="3"/>
    <path d="M388 720L524 586L620 676L706 592L838 720" stroke="white" stroke-width="28" stroke-linecap="round" stroke-linejoin="round" opacity=".82"/>
    <circle cx="802" cy="504" r="42" fill="white" opacity=".84"/>
    <path d="M600 208L780 312V520L600 624L420 520V312L600 208Z" stroke="#31F3E9" stroke-width="18" opacity=".8"/>
    <path d="M600 276L674 402H526L600 276Z" fill="white" opacity=".88"/>
    <text x="600" y="930" text-anchor="middle" fill="white" font-family="Verdana, Arial, sans-serif" font-size="46" font-weight="700" letter-spacing="9">${title.slice(0, 18).toUpperCase()}</text>
    <text x="600" y="990" text-anchor="middle" fill="#8BF5FF" font-family="Verdana, Arial, sans-serif" font-size="24" font-weight="700" letter-spacing="8">LIMITED BASE DROP</text>
    <defs>
      <radialGradient id="card" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(770 250) rotate(120) scale(980)">
        <stop stop-color="#26F0E4"/>
        <stop offset=".48" stop-color="#1575FF" stop-opacity=".42"/>
        <stop offset="1" stop-color="#07111F" stop-opacity=".96"/>
      </radialGradient>
    </defs>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function shortAddress(address?: string) {
  if (!address) return "Connect";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function safeNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugify(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 54) || "droproom-drop"
  );
}

function extensionForDataUrl(dataUrl: string) {
  if (dataUrl.startsWith("data:image/gif")) return "gif";
  if (dataUrl.startsWith("data:image/jpeg")) return "jpg";
  if (dataUrl.startsWith("data:image/webp")) return "webp";
  if (dataUrl.startsWith("data:image/svg+xml")) return "svg";
  return "png";
}

function resolveAppOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://baseappdroproom.com";
  const canonical = configured.replace(/\/+$/, "");

  if (typeof window === "undefined") return canonical;

  const currentOrigin = `${window.location.protocol}//${window.location.host}`;
  return /localhost|127\.0\.0\.1/i.test(window.location.host) ? currentOrigin : canonical;
}

function getDropPermalink(dropId?: string) {
  const url = new URL(resolveAppOrigin());
  if (dropId) url.searchParams.set("drop", dropId);
  return url.toString();
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest("button, a, input, textarea, select, label, [role='button'], [data-swipe-lock='true']")
  );
}

function safeStorageSet(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Large uploaded/generated images can exceed localStorage quota. Keep the live
    // in-memory preview working and avoid breaking the app during testing.
    window.localStorage.removeItem(key);
  }
}

function parseLibrary(value: string | null) {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as Record<string, string[]>;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    window.localStorage.removeItem(libraryKey);
    return {};
  }
}

export function DroproomApp() {
  const droproom = useDroproomContract();
  const [view, setView] = useState<View>("explore");
  const [createStep, setCreateStep] = useState<CreateStep>("start");
  const [startMode, setStartMode] = useState<StartMode>("upload");
  const [draft, setDraft] = useState<StudioDraft>({
    ...defaultDraft,
    image: ""
  });
  const [drops, setDrops] = useState<Drop[]>([]);
  const [libraryByWallet, setLibraryByWallet] = useState<Record<string, string[]>>({});
  const [selectedDropId, setSelectedDropId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [styleChip, setStyleChip] = useState<StyleChipId>("premium");
  const [aiImages, setAiImages] = useState<string[]>([]);
  const [aiJobsUsed, setAiJobsUsed] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [touchStart, setTouchStart] = useState<{ target: EventTarget | null; x: number; y: number } | null>(null);
  const [publishPending, setPublishPending] = useState(false);
  const [publishedDropId, setPublishedDropId] = useState<string | null>(null);
  const [mintPending, setMintPending] = useState(false);
  const [mintSuccessData, setMintSuccessData] = useState<{
    drop: Drop;
    mintNumber: number;
    shareUrl: string;
  } | null>(null);
  const [dropsLoading, setDropsLoading] = useState(true);
  const hasArtwork = Boolean(draft.image);
  const walletAddress = droproom.account ?? "";

  useEffect(() => {
    const savedLibrary = parseLibrary(window.localStorage.getItem(libraryKey));
    setLibraryByWallet(savedLibrary);
    void loadDrops();
  }, []);

  useEffect(() => {
    safeStorageSet(libraryKey, libraryByWallet);
  }, [libraryByWallet]);

  const selectedDrop = drops.find((drop) => drop.id === selectedDropId) ?? drops[0];
  const publishedDrop = publishedDropId ? drops.find((drop) => drop.id === publishedDropId) ?? null : null;
  const activeLibrary = walletAddress ? libraryByWallet[walletAddress.toLowerCase()] ?? [] : [];
  const creatorDrops = drops.filter((drop) => drop.creatorAddress?.toLowerCase() === walletAddress.toLowerCase());
  const isSelectedDropCreator = Boolean(
    selectedDrop?.creatorAddress && walletAddress && selectedDrop.creatorAddress.toLowerCase() === walletAddress.toLowerCase()
  );
  const soldOutDrops = drops.filter((drop) => drop.status === "sold-out" || drop.minted >= drop.edition).slice(0, 4);
  const soldOutCount = creatorDrops.filter((drop) => drop.status === "sold-out" && drop.edition >= TOKEN_UNLOCK_MIN_EDITION).length;
  const tokenEligibility = getCreatorTokenEligibility(drops, walletAddress);
  const isPlatformAdmin = walletAddress.toLowerCase() === PLATFORM_WALLET.toLowerCase();

  function setActiveView(nextView: View) {
    setView(nextView);
    setWalletMenuOpen(false);
    if (nextView === "create") setCreateStep("start");
  }

  async function loadDrops() {
    try {
      setDropsLoading(true);
      const requestedDropId = new URLSearchParams(window.location.search).get("drop");
      const endpoint = requestedDropId ? `/api/drops?drop=${encodeURIComponent(requestedDropId)}` : "/api/drops";
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = (await response.json()) as { drops?: Drop[]; error?: string };
      const nextDrops = payload.drops ?? [];
      const requestedDrop = requestedDropId ? nextDrops.find((drop) => drop.id === requestedDropId || drop.tokenId === requestedDropId) : null;
      setDrops(nextDrops);
      setSelectedDropId((current) => {
        if (requestedDropId) return requestedDrop?.id ?? null;
        return current ?? nextDrops[0]?.id ?? null;
      });
      if (requestedDropId && !requestedDrop) {
        setNotice("This shared drop is still indexing or unavailable right now.");
      } else if (!response.ok && payload.error) {
        setNotice(payload.error);
      }
    } catch {
      setNotice("Live drops could not be loaded yet.");
    } finally {
      setDropsLoading(false);
    }
  }

  function selectDrop(id: string) {
    setSelectedDropId(id);

    const url = new URL(window.location.href);
    url.searchParams.set("drop", id);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  async function requestBaseNotificationAdmin(input: BaseNotificationAdminInput) {
    if (!walletAddress) {
      throw new Error("Connect the Droproom admin Base Wallet first.");
    }

    const signedMessage = [
      "Droproom admin action",
      `Action: ${input.action}`,
      `Domain: ${window.location.host}`,
      `Issued At: ${new Date().toISOString()}`
    ].join("\n");

    const auth = await droproom.signMessage(signedMessage);
    const response = await fetch("/api/admin/base-notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, auth })
    });
    const payload = (await response.json().catch(() => null)) as BaseNotificationAdminResult | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Base notification request failed.");
    }

    return payload ?? {};
  }

  const hydrateDropsByIds = useCallback(async (tokenIds: string[]) => {
    const missingIds = [...new Set(tokenIds)];

    if (!missingIds.length) return;

    const hydrated = await Promise.all(
      missingIds.map(async (tokenId) => {
        try {
          const response = await fetch(`/api/drops?drop=${encodeURIComponent(tokenId)}`, { cache: "no-store" });
          const payload = (await response.json()) as { drops?: Drop[] };
          return payload.drops?.find((drop) => drop.id === tokenId || drop.tokenId === tokenId) ?? null;
        } catch {
          return null;
        }
      })
    );

    const nextDrops = hydrated.filter((drop): drop is Drop => Boolean(drop));
    if (!nextDrops.length) return;

    setDrops((current) => {
      const knownIds = new Set(
        current.flatMap((drop) => [drop.id, drop.tokenId].filter((value): value is string => Boolean(value)))
      );
      return [...current, ...nextDrops.filter((drop) => !knownIds.has(drop.id) && !knownIds.has(drop.tokenId ?? ""))];
    });
  }, []);

  const loadMintLibrary = useCallback(async (address: string) => {
    try {
      const response = await fetch(`/api/mints?wallet=${encodeURIComponent(address.toLowerCase())}`, { cache: "no-store" });
      const payload = (await response.json()) as { mints?: Array<{ token_id: string }> };
      const tokenIds = payload.mints?.map((mint) => mint.token_id) ?? [];
      setLibraryByWallet((current) => ({
        ...current,
        [address.toLowerCase()]: tokenIds
      }));
      await hydrateDropsByIds(tokenIds);
    } catch {
      // Library is helpful, but mint ownership is still enforced by the chain.
    }
  }, [hydrateDropsByIds]);

  useEffect(() => {
    if (!walletAddress) return;
    void loadMintLibrary(walletAddress);
  }, [loadMintLibrary, walletAddress]);

  async function connectWallet() {
    try {
      setWalletLoading(true);
      const nextWallet = await droproom.connect();
      setNotice(`Connected on Base: ${shortAddress(nextWallet)}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Wallet connection was not completed.");
    } finally {
      setWalletLoading(false);
    }
  }

  async function switchWalletAccount() {
    try {
      setWalletLoading(true);
      const nextWallet = await droproom.switchAccount();
      setWalletMenuOpen(false);
      setNotice(`Base account switched: ${shortAddress(nextWallet)}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Base account switch was not completed.");
    } finally {
      setWalletLoading(false);
    }
  }

  async function disconnectWallet() {
    try {
      await droproom.disconnect();
      setWalletMenuOpen(false);
      setNotice("Base wallet disconnected from this session.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Wallet disconnect was not completed.");
    }
  }

  async function copyWalletAddress() {
    if (!walletAddress) return;
    try {
      await navigator.clipboard?.writeText(walletAddress);
      setNotice("Wallet address copied.");
    } catch {
      setNotice("Wallet address could not be copied here.");
    }
  }

  function buildShareData(drop: Drop): ShareData {
    return {
      creator: drop.creator,
      edition: drop.edition,
      remaining: Math.max(drop.edition - drop.minted, 0),
      title: drop.title,
      url: getDropPermalink(drop.id)
    };
  }

  async function copyDropLink(drop: Drop, successMessage = "Drop link copied.") {
    try {
      const copied = await copyToClipboard(getDropPermalink(drop.id));
      setNotice(copied ? successMessage : "Drop link could not be copied here.");
    } catch {
      setNotice("Drop link could not be copied here.");
    }
  }

  function shareCreatedDrop(drop: Drop, network: "x" | "farcaster" | "reddit") {
    const shareData = buildShareData(drop);

    if (network === "x") {
      shareOnX(shareData, "created");
      return;
    }

    if (network === "farcaster") {
      shareOnFarcaster(shareData, "created");
      return;
    }

    shareOnReddit(shareData, "created");
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    if (isInteractiveTarget(event.target)) return;

    const touch = event.touches[0];
    if (!touch) return;
    setTouchStart({ target: event.target, x: touch.clientX, y: touch.clientY });
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    if (!touchStart || isInteractiveTarget(touchStart.target)) {
      setTouchStart(null);
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      setTouchStart(null);
      return;
    }

    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    setTouchStart(null);

    if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.35) return;

    const currentIndex = viewOrder.indexOf(view);
    const nextIndex = dx < 0 ? Math.min(currentIndex + 1, viewOrder.length - 1) : Math.max(currentIndex - 1, 0);
    const nextView = viewOrder[nextIndex];
    if (nextView && nextView !== view) setActiveView(nextView);
  }

  function beginCreate(mode: StartMode) {
    setStartMode(mode);
    setCreateStep("studio");
    setView("create");
    setAiImages([]);
    setAiPrompt("");
    setNotice("");
    setDraft({
      ...defaultDraft,
      title: mode === "blank" ? "Blank Canvas Drop" : mode === "ai" ? "AI Artwork Drop" : "Uploaded Artwork Drop",
      image: mode === "blank" ? createBlankArtwork("BLANK CANVAS") : ""
    });

    if (mode === "blank") {
      setDraft((current) => ({
        ...current,
        title: "Blank Canvas Drop",
        image: createBlankArtwork("BLANK CANVAS", current.background)
      }));
    }
  }

  function handleUpload(file?: File) {
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setNotice("Only PNG, JPG, WEBP, and GIF files are supported in V1.");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setNotice("Keep artwork under 10 MB. One-second looping GIFs are supported.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setDraft((current) => ({
        ...current,
        title: file.name.replace(/\.[^/.]+$/, "").slice(0, 48) || "Uploaded Artwork",
        image: String(reader.result)
      }));
      setNotice("Artwork uploaded. You can refine the drop before publishing.");
    };
    reader.readAsDataURL(file);
  }

  async function generateWithAi() {
    if (!aiPrompt.trim()) {
      setNotice("Write a prompt before generating artwork.");
      return;
    }

    if (aiJobsUsed >= AI_DAILY_JOB_LIMIT) {
      setNotice("Your AI limit is used for today. Try again later.");
      return;
    }

    setAiLoading(true);
    setNotice("");

    try {
      const response = await fetch("/api/ai/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: aiPrompt, styleChipIds: [styleChip] })
      });
      const payload = (await response.json()) as { images?: string[]; error?: string };

      if (!response.ok || !payload.images?.length) throw new Error(payload.error ?? "AI generation failed.");

      setAiImages(payload.images);
      setAiJobsUsed((current) => current + 1);
      setNotice("AI generated 4 variations.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "AI generation failed.");
    } finally {
      setAiLoading(false);
    }
  }

  function selectAiImage(image: string) {
    setDraft((current) => ({
      ...current,
      title: aiPrompt.slice(0, 42) || "AI Artwork Drop",
      description: "A limited AI-assisted image drop created on Droproom.",
      image
    }));
    setCreateStep("review");
  }

  async function publishDrop() {
    if (publishPending) return;

    try {
      setPublishPending(true);
      setNotice("Preparing your wallet on Base...");
      if (!walletAddress) {
        await droproom.connect();
      } else {
        await droproom.ensureBaseChain();
      }

      setNotice("Uploading artwork to IPFS...");
      const title = draft.title.trim() || "Untitled Drop";
      const description = draft.description.trim() || "A limited edition NFT drop created on Droproom.";
      const edition = Math.min(Math.max(Math.round(draft.edition), 1), EDITION_MAX);
      const price = draft.isFree ? 0 : Math.max(draft.price, 0);
      const priceWei = parseEther(price.toString());
      if (!draft.image) {
        throw new Error("Add artwork before publishing.");
      }
      const artwork = dataUrlToFile(draft.image, `${slugify(title)}.${extensionForDataUrl(draft.image)}`);
      const imageUpload = await uploadFileToPinata(artwork);
      const metadata = {
        name: title,
        description,
        image: imageUpload.ipfsUri,
        attributes: [
          { trait_type: "Platform", value: "Droproom" },
          { trait_type: "Network", value: "Base" },
          { trait_type: "Edition Size", value: edition },
          { trait_type: "Media Type", value: imageUpload.mimeType }
        ]
      };

      setNotice("Uploading NFT metadata to IPFS...");
      const metadataUpload = await uploadJsonToPinata(`${slugify(title)}-metadata.json`, metadata);

      setNotice("Confirm the Base transaction in your wallet. You pay network gas.");
      const result = await droproom.createDrop({
        maxSupply: edition,
        metadataURI: metadataUpload.ipfsUri,
        price: priceWei,
        royaltyBps: 0
      });
      const created = result.events.created[0];

      if (!created) {
        throw new Error("Drop transaction completed, but the created token event was not found.");
      }

      const drop: Drop = {
        basescanUrl: result.basescanUrl,
        collectors: [],
        createdAt: new Date().toISOString(),
        creator: shortAddress(created.creator),
        creatorAddress: created.creator,
        description,
        edition,
        id: created.tokenId.toString(),
        image: imageUpload.gatewayUrl,
        imageIpfsUri: imageUpload.ipfsUri,
        isFree: price === 0,
        mediaType: imageUpload.mimeType,
        metadataUri: metadataUpload.ipfsUri,
        minted: 0,
        price,
        priceWei: priceWei.toString(),
        status: "live",
        title,
        tokenId: created.tokenId.toString(),
        txHash: result.hash
      };

      setDrops((current) => [drop, ...current.filter((item) => item.id !== drop.id)]);
      selectDrop(drop.id);
      setPublishedDropId(drop.id);
      setCreateStep("start");
      setDraft({ ...defaultDraft, image: "" });
      setAiPrompt("");
      setAiImages([]);
      setView("explore");
      setNotice(`Drop is live on Base. Token #${drop.tokenId}. Indexing now...`);

      try {
        const indexedDrop = await saveDrop(drop);
        setDrops((current) => [indexedDrop, ...current.filter((item) => item.id !== indexedDrop.id)]);
        selectDrop(indexedDrop.id);
        setPublishedDropId(indexedDrop.id);
        setNotice(`Drop is live and indexed on Base. Token #${indexedDrop.tokenId}.`);
      } catch (indexError) {
        setNotice(
          indexError instanceof Error
            ? `Onchain success, index needs retry: ${indexError.message}`
            : "Onchain success, but the index needs retry."
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Drop publish failed.");
    } finally {
      setPublishPending(false);
    }
  }

  async function mintSelectedDrop() {
    if (!selectedDrop) return;
    if (!selectedDrop.tokenId) {
      setNotice("This drop is not connected to an onchain token yet.");
      return;
    }
    if (mintPending || selectedDrop.minted >= selectedDrop.edition || activeLibrary.includes(selectedDrop.id)) return;

    try {
      setMintPending(true);
      const mintWallet = walletAddress ?? (await droproom.connect());
      setNotice("Confirm the mint in your wallet. Free mint means price is 0; Base gas is still paid by you.");
      const result = await droproom.mintDrop({ tokenId: selectedDrop.tokenId, quantity: 1 });
      const mintedEvent = result.events.minted[0];
      const paidWei = mintedEvent?.paid?.toString() ?? selectedDrop.priceWei ?? "0";

      const minted = mintedEvent ? Number(mintedEvent.totalMinted) : Math.min(selectedDrop.minted + 1, selectedDrop.edition);
      const updatedDrop: Drop = {
        ...selectedDrop,
        collectors: selectedDrop.collectors.includes(mintWallet)
          ? selectedDrop.collectors
          : [...selectedDrop.collectors, mintWallet],
        minted,
        status: minted >= selectedDrop.edition ? "sold-out" : selectedDrop.status
      };

      setDrops((current) => current.map((drop) => (drop.id === selectedDrop.id ? updatedDrop : drop)));
      setLibraryByWallet((current) => {
        const key = mintWallet.toLowerCase();
        const existing = current[key] ?? [];
        return {
          ...current,
          [key]: [selectedDrop.id, ...existing.filter((id) => id !== selectedDrop.id)]
        };
      });
      setMintSuccessData({
        drop: updatedDrop,
        mintNumber: minted,
        shareUrl: getDropPermalink(updatedDrop.id)
      });
      setNotice(`Collected on Base. ${updatedDrop.title} is now in your library.`);
      try {
        await saveMint({
          basescan_url: result.basescanUrl,
          collector_address: mintWallet,
          paid_wei: paidWei,
          quantity: 1,
          token_id: selectedDrop.tokenId,
          tx_hash: result.hash
        });
      } catch (indexError) {
        setNotice(
          indexError instanceof Error
            ? `Mint is onchain, index needs retry: ${indexError.message}`
            : "Mint is onchain, but the index needs retry."
        );
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Mint failed.");
    } finally {
      setMintPending(false);
    }
  }

  async function saveDrop(drop: Drop) {
    const response = await fetch("/api/drops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(drop)
    });
    const payload = (await response.json().catch(() => null)) as { drop?: Drop; error?: string } | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Drop could not be indexed.");
    }

    return payload?.drop ?? drop;
  }

  async function saveMint(mint: {
    basescan_url: string;
    collector_address: string;
    paid_wei: string;
    quantity: number;
    token_id: string;
    tx_hash: string;
  }) {
    const response = await fetch("/api/mints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mint)
    });
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Mint could not be indexed.");
    }
  }

  return (
    <main className="app-shell" onTouchEnd={handleTouchEnd} onTouchStart={handleTouchStart}>
      <BackgroundGlow />
      <header className="topbar">
        <button className="brand-lockup" onClick={() => setActiveView("explore")} type="button">
          <Image alt="Droproom icon" height={56} priority src={brandIconPrimary} width={56} />
          <span>DROPROOM</span>
        </button>
        <nav className="nav-pills" aria-label="Primary navigation">
          {viewOrder.map((item) => (
            <button
              className={view === item ? "nav-pill active" : "nav-pill"}
              key={item}
              onClick={() => setActiveView(item)}
              type="button"
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="wallet-menu">
          <button
            aria-expanded={walletMenuOpen}
            className={walletAddress ? "wallet-button connected" : "wallet-button"}
            disabled={walletLoading}
            onClick={() => (walletAddress ? setWalletMenuOpen((current) => !current) : void connectWallet())}
            type="button"
          >
            <span>{walletLoading ? "..." : !droproom.isCorrectChain && walletAddress ? "Switch to Base" : "Wallet"}</span>
            <strong>{walletAddress ? shortAddress(walletAddress) : "Connect wallet"}</strong>
          </button>
          {walletAddress && walletMenuOpen ? (
            <div className="wallet-dropdown">
              <span>Connected wallet</span>
              <strong>{shortAddress(walletAddress)}</strong>
              <button onClick={copyWalletAddress} type="button">Copy address</button>
              <button onClick={() => void switchWalletAccount()} type="button">Change account</button>
              {!droproom.isCorrectChain ? <button onClick={() => void droproom.ensureBaseChain()} type="button">Switch to Base</button> : null}
              <a href={`https://basescan.org/address/${walletAddress}`} rel="noreferrer" target="_blank">View on Basescan</a>
              <button className="danger-link" onClick={() => void disconnectWallet()} type="button">Disconnect</button>
            </div>
          ) : null}
        </div>
      </header>

      <BaseReadyStrip />
      <ViewRail activeView={view} onSelect={setActiveView} />

      {notice ? (
        <div className={`notice enter ${/indexed|collected|generated|uploaded/i.test(notice) ? "success" : ""}`}>
          {notice}
        </div>
      ) : null}

      {mintSuccessData ? (
        <MintSuccessModal
          drop={mintSuccessData.drop}
          mintNumber={mintSuccessData.mintNumber}
          onClose={() => setMintSuccessData(null)}
          onOpenLibrary={() => {
            setMintSuccessData(null);
            setActiveView("library");
          }}
          shareUrl={mintSuccessData.shareUrl}
        />
      ) : null}

      {view === "explore" ? (
        <section className="screen enter">
          {publishedDrop ? (
            <PublishSuccessPanel
              drop={publishedDrop}
              onCopyLink={() => void copyDropLink(publishedDrop, "Creator link copied.")}
              onDismiss={() => setPublishedDropId(null)}
              onShareFarcaster={() => shareCreatedDrop(publishedDrop, "farcaster")}
              onShareReddit={() => shareCreatedDrop(publishedDrop, "reddit")}
              onShareX={() => shareCreatedDrop(publishedDrop, "x")}
            />
          ) : null}
          <Hero onCreate={() => setActiveView("create")} />
          <section className="content-grid">
            <div className="drop-grid">
              {dropsLoading ? (
                <div className="empty-state">Loading live Base drops...</div>
            ) : drops.length ? (
                drops.map((drop) => (
                  <DropCard drop={drop} isSelected={drop.id === selectedDrop?.id} key={drop.id} onClick={() => selectDrop(drop.id)} />
                ))
              ) : (
                <GenesisEmptyState onCreate={() => setView("create")} />
              )}
            </div>
            {selectedDrop ? (
              <DropDetail
                canShare={isSelectedDropCreator}
                drop={selectedDrop}
                isMinting={mintPending}
                isOwned={activeLibrary.includes(selectedDrop.id)}
                isWalletConnected={Boolean(walletAddress)}
                onCopyLink={() => void copyDropLink(selectedDrop, "Creator link copied.")}
                onMint={mintSelectedDrop}
                onShareFarcaster={() => shareCreatedDrop(selectedDrop, "farcaster")}
                onShareReddit={() => shareCreatedDrop(selectedDrop, "reddit")}
                onShareX={() => shareCreatedDrop(selectedDrop, "x")}
              />
            ) : null}
          </section>
          {soldOutDrops.length ? <SoldOutShowcase drops={soldOutDrops} onSelect={selectDrop} /> : null}
        </section>
      ) : null}

      {view === "create" ? (
        <section className="screen create-screen enter">
          <CreateFlow
            aiImages={aiImages}
            aiLoading={aiLoading}
            aiPrompt={aiPrompt}
            draft={draft}
            onAiPrompt={setAiPrompt}
            onBegin={beginCreate}
            onGenerate={generateWithAi}
            onPublish={publishDrop}
            publishPending={publishPending}
            onSelectAi={selectAiImage}
            onStartMode={setStartMode}
            onStep={setCreateStep}
            onStyle={setStyleChip}
            onUpdateDraft={setDraft}
            onUpload={handleUpload}
            hasArtwork={hasArtwork}
            startMode={startMode}
            step={createStep}
            styleChip={styleChip}
          />
        </section>
      ) : null}

      {view === "dashboard" ? (
        <section className="screen dashboard enter">
          <Dashboard
            drops={creatorDrops}
            eligibilityReason={tokenEligibility.reason}
            eligibilityStatus={tokenEligibility.status}
            isAdmin={isPlatformAdmin}
            allDrops={drops}
            onBaseNotificationAdmin={requestBaseNotificationAdmin}
            onCopyLink={(drop) => void copyDropLink(drop, "Creator link copied.")}
            onShareFarcaster={(drop) => shareCreatedDrop(drop, "farcaster")}
            onShareReddit={(drop) => shareCreatedDrop(drop, "reddit")}
            onShareX={(drop) => shareCreatedDrop(drop, "x")}
            soldOutCount={soldOutCount}
          />
        </section>
      ) : null}

      {view === "library" ? (
        <section className="screen library-screen enter">
          <LibraryView
            drops={drops.filter((drop) => activeLibrary.includes(drop.id))}
            onOpenDrop={(id) => {
              selectDrop(id);
              setActiveView("explore");
            }}
          />
        </section>
      ) : null}
    </main>
  );
}

function BackgroundGlow() {
  return (
    <div className="background-glow" aria-hidden="true">
      <div />
      <div />
      <div />
    </div>
  );
}

function Hero({ onCreate }: { onCreate: () => void }) {
  return (
    <section className="hero hero-premium">
      <div className="hero-copy">
        <p className="eyebrow">Creator-first NFT drops on Base</p>
        <h1>Create limited Base drops. Get collected.</h1>
        <p>
          Upload artwork, start from a blank canvas, or generate with AI. Publish limited image and looping GIF editions,
          share the drop, and let collectors mint directly on Base.
        </p>
        <div className="hero-actions">
          <button className="primary-button" onClick={onCreate} type="button">
            Launch Drop <span>Base</span>
          </button>
          <span className="microcopy">Free mints stay platform-fee free. Collectors pay their own Base network gas.</span>
        </div>
      </div>
      <div className="hero-art hero-media-shell">
        <div className="hero-product-card" aria-hidden="true">
          <div className="product-media">
            <Image alt="" className="hero-variant-image" height={720} priority src={heroFallbackImage} width={720} />
          </div>
          <div className="product-copy">
            <span>Live media drops</span>
            <strong>Publish image or 1s GIF editions</strong>
            <small>Real drops appear below after onchain publish.</small>
            <div className="product-badges">
              <span>Base mainnet</span>
              <span>IPFS media</span>
              <span>Ready</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BaseReadyStrip() {
  return (
    <aside className="base-ready-strip">
      <div className="base-ready-copy">
        <strong>Save Droproom to stay on top of new drops and alerts.</strong>
      </div>
    </aside>
  );
}

function ViewRail({ activeView, onSelect }: { activeView: View; onSelect: (view: View) => void }) {
  return (
    <div className="view-rail" aria-label="Swipe navigation">
      <span>Swipe</span>
      {viewOrder.map((item) => (
        <button
          aria-label={`Open ${item}`}
          className={activeView === item ? "active" : ""}
          key={item}
          onClick={() => onSelect(item)}
          type="button"
        />
      ))}
    </div>
  );
}

function DropCard({ drop, isSelected, onClick }: { drop: Drop; isSelected: boolean; onClick: () => void }) {
  const soldOut = drop.minted >= drop.edition;
  const progress = Math.min((drop.minted / drop.edition) * 100, 100);

  return (
    <button className={[isSelected ? "drop-card selected" : "drop-card", soldOut ? "is-sold-out" : ""].filter(Boolean).join(" ")} onClick={onClick} type="button">
      <div className="drop-image-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={drop.title} src={drop.image} />
        {isSelected ? <span className="live-dot">Selected</span> : soldOut ? <span className="sold-out">Sold out</span> : <span className="live-dot">Live</span>}
      </div>
      <div className="drop-card-copy">
        <h3>{drop.title}</h3>
        <p>{drop.creator}</p>
        <div className="drop-meta">
          <span>{drop.isFree ? "Free" : `${drop.price} ETH`}</span>
          <span>
            {drop.minted}/{drop.edition}
          </span>
        </div>
        <div className="mini-progress" aria-label={`${Math.round(progress)} percent collected`}>
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    </button>
  );
}

function DropDetail({
  canShare,
  drop,
  isMinting,
  isOwned,
  isWalletConnected,
  onCopyLink,
  onMint,
  onShareFarcaster,
  onShareReddit,
  onShareX
}: {
  canShare: boolean;
  drop: Drop;
  isMinting: boolean;
  isOwned: boolean;
  isWalletConnected: boolean;
  onCopyLink: () => void;
  onMint: () => void;
  onShareFarcaster: () => void;
  onShareReddit: () => void;
  onShareX: () => void;
}) {
  const remaining = Math.max(drop.edition - drop.minted, 0);
  const soldOut = remaining === 0;
  const progress = Math.min((drop.minted / drop.edition) * 100, 100);

  return (
    <aside className="drop-detail">
      <div className="detail-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={drop.title} src={drop.image} />
      </div>
      <div className="detail-copy">
        <p className="eyebrow">{drop.creator}</p>
        <h2>{drop.title}</h2>
        <p>{drop.description}</p>
        <div className="stat-row">
          <span>{drop.isFree ? "Free mint" : `${drop.price} ETH`}</span>
          <span>{remaining} left</span>
          <span>{drop.edition} max</span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
        <button className="primary-button wide" disabled={soldOut || isOwned || isMinting} onClick={onMint} type="button">
          {soldOut ? "Sold out" : isOwned ? "Collected" : isMinting ? "Minting..." : isWalletConnected ? "Mint on Base" : "Connect Base Wallet"} <span>Base</span>
        </button>
        <p className="microcopy">
          Free mint means NFT price is 0. Network gas is paid by your connected Base Account.
          {drop.basescanUrl ? (
            <>
              {" "}
              <a href={drop.basescanUrl} rel="noreferrer" target="_blank">
                View create tx
              </a>
            </>
          ) : null}
        </p>
        {canShare ? (
          <div className="drop-share">
            <div className="drop-share-row">
              <div>
                <strong>Share your live drop</strong>
                <p>Only creators see these share tools for their own drop.</p>
              </div>
              <button className="secondary-button" onClick={onCopyLink} type="button">
                Copy link
              </button>
            </div>
            <div className="social-share-row">
              <button className="social-chip" onClick={onShareX} type="button">
                X
              </button>
              <button className="social-chip" onClick={onShareFarcaster} type="button">
                Farcaster
              </button>
              <button className="social-chip" onClick={onShareReddit} type="button">
                Reddit
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

function PublishSuccessPanel({
  drop,
  onCopyLink,
  onDismiss,
  onShareFarcaster,
  onShareReddit,
  onShareX
}: {
  drop: Drop;
  onCopyLink: () => void;
  onDismiss: () => void;
  onShareFarcaster: () => void;
  onShareReddit: () => void;
  onShareX: () => void;
}) {
  return (
    <section className="publish-success-panel">
      <div>
        <p className="eyebrow">Drop live</p>
        <h2>{drop.title} is live on Base.</h2>
        <p>Your creator share links are ready. Push this drop out wherever your collectors already are.</p>
      </div>
      <div className="publish-success-actions">
        <button className="primary-button" onClick={onCopyLink} type="button">
          Copy link <span>Live</span>
        </button>
        {drop.basescanUrl ? (
          <a className="secondary-button" href={drop.basescanUrl} rel="noreferrer" target="_blank">
            View create tx
          </a>
        ) : null}
        <button className="secondary-button" onClick={onDismiss} type="button">
          Close
        </button>
      </div>
      <div className="social-share-row">
        <button className="social-chip" onClick={onShareX} type="button">
          X
        </button>
        <button className="social-chip" onClick={onShareFarcaster} type="button">
          Farcaster
        </button>
        <button className="social-chip" onClick={onShareReddit} type="button">
          Reddit
        </button>
      </div>
    </section>
  );
}

function GenesisEmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="empty-state genesis-empty">
      <div className="genesis-orb">01</div>
      <div>
        <p className="eyebrow">No live drops yet</p>
        <h3>Be the first creator on Droproom.</h3>
        <p>This space stays empty until a real onchain drop is published. Only verified Base drops appear here.</p>
      </div>
      <button className="secondary-button" onClick={onCreate} type="button">
        Create First Drop
      </button>
    </div>
  );
}

function SoldOutShowcase({ drops, onSelect }: { drops: Drop[]; onSelect: (id: string) => void }) {
  return (
    <section className="sold-out-showcase">
      <div>
        <p className="eyebrow">Sold-out rooms</p>
        <h2>Completed drops keep their spotlight.</h2>
      </div>
      <div className="sold-out-strip">
        {drops.map((drop) => (
          <button key={drop.id} onClick={() => onSelect(drop.id)} type="button">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={drop.title} src={drop.image} />
            <span>{drop.title}</span>
            <small>{drop.edition}/{drop.edition} collected</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function CreateFlow(props: {
  aiImages: string[];
  aiLoading: boolean;
  aiPrompt: string;
  draft: StudioDraft;
  onAiPrompt: (value: string) => void;
  onBegin: (mode: StartMode) => void;
  onGenerate: () => void;
  onPublish: () => void;
  onSelectAi: (image: string) => void;
  onStartMode: (mode: StartMode) => void;
  onStep: (step: CreateStep) => void;
  onStyle: (chip: StyleChipId) => void;
  onUpdateDraft: (draft: StudioDraft | ((current: StudioDraft) => StudioDraft)) => void;
  onUpload: (file?: File) => void;
  hasArtwork: boolean;
  publishPending: boolean;
  startMode: StartMode;
  step: CreateStep;
  styleChip: StyleChipId;
}) {
  if (props.step === "start") {
    return (
      <section className="create-start">
        <div>
          <p className="eyebrow">Create NFT</p>
          <h1>Start from the strongest path for your drop.</h1>
          <p>Keep it simple: image or short looping GIF, limited editions, free or paid minting, and a clean onchain review before publish.</p>
        </div>
        <div className="start-grid">
          <StartCard icon={<i aria-hidden="true" className="mode-glyph upload-glyph" />} label="Upload artwork" onClick={() => props.onBegin("upload")} text="Bring a PNG, JPG, WEBP, or one-second GIF and turn it into a Base drop." />
          <StartCard icon={<i aria-hidden="true" className="mode-glyph canvas-glyph" />} label="Start from blank" onClick={() => props.onBegin("blank")} text="Build a simple card with background, frame, title, and preview." />
          <StartCard icon={<i aria-hidden="true" className="mode-glyph ai-glyph" />} label="Generate with AI" onClick={() => props.onBegin("ai")} text="Prompt + style chips, 4 image variations, 10 AI jobs per day." />
        </div>
      </section>
    );
  }

  if (props.step === "review") {
    return (
      <ReviewStep
        draft={props.draft}
        onBack={() => props.onStep("studio")}
        onPublish={props.onPublish}
        publishPending={props.publishPending}
      />
    );
  }

  return (
    <section className="studio-grid">
      <div className="studio-panel">
        <div className="panel-head">
          <p className="eyebrow">Studio</p>
          <h2>{props.startMode === "ai" ? "Generate and refine" : props.startMode === "upload" ? "Upload and refine" : "Blank canvas"}</h2>
        </div>

        <div className="mode-tabs">
          {(["upload", "blank", "ai"] as const).map((mode) => (
            <button
              className={props.startMode === mode ? "chip active" : "chip"}
              key={mode}
              onClick={() => {
                props.onStartMode(mode);
                if (mode === "blank") props.onUpdateDraft((current) => ({ ...current, image: createBlankArtwork(current.title, current.background) }));
              }}
              type="button"
            >
              {mode}
            </button>
          ))}
        </div>

        {props.startMode === "upload" ? (
          <label className="upload-zone">
            <span className="upload-icon">+</span>
            <span>Choose an image for the room</span>
            <small>PNG, JPG, WEBP, GIF. Max 10 MB.</small>
            <input accept={ACCEPTED_IMAGE_TYPES.join(",")} onChange={(event) => props.onUpload(event.target.files?.[0])} type="file" />
          </label>
        ) : null}

        {props.startMode === "ai" ? (
          <div className="ai-box">
            <textarea onChange={(event) => props.onAiPrompt(event.target.value)} placeholder="Describe the collectible artwork you want..." value={props.aiPrompt} />
            <div className="style-chips">
              {STYLE_CHIPS.map((chip) => (
                <button className={props.styleChip === chip.id ? "chip active" : "chip"} key={chip.id} onClick={() => props.onStyle(chip.id)} type="button">
                  {chip.label}
                </button>
              ))}
            </div>
            <button className="secondary-button" disabled={props.aiLoading} onClick={props.onGenerate} type="button">
              {props.aiLoading ? "Generating..." : "Generate 4 variations"}
            </button>
            {props.aiImages.length ? (
              <div className="variation-grid">
                {props.aiImages.map((image) => (
                  <button key={image.slice(0, 64)} onClick={() => props.onSelectAi(image)} type="button">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="AI variation" src={image} />
                    <span>Use this</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="field">
          <span>Title</span>
          <input onChange={(event) => props.onUpdateDraft((current) => ({ ...current, title: event.target.value }))} value={props.draft.title} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea onChange={(event) => props.onUpdateDraft((current) => ({ ...current, description: event.target.value }))} value={props.draft.description} />
        </label>
        {props.startMode === "blank" ? (
          <>
            <label className="field">
              <span>Background color</span>
              <input
                onChange={(event) =>
                  props.onUpdateDraft((current) => ({
                    ...current,
                    background: event.target.value,
                    image: createBlankArtwork(current.title, event.target.value)
                  }))
                }
                type="color"
                value={props.draft.background}
              />
            </label>
            <label className="field">
              <span>Card label</span>
              <input
                onChange={(event) => props.onUpdateDraft((current) => ({ ...current, overlayText: event.target.value }))}
                placeholder="Optional text on the artwork"
                value={props.draft.overlayText}
              />
            </label>
          </>
        ) : null}
        <div className="field-row">
          <label className="field">
            <span>Edition</span>
            <input
              max={EDITION_MAX}
              min={1}
              onChange={(event) => props.onUpdateDraft((current) => ({ ...current, edition: Math.min(Math.max(safeNumber(event.target.value, 99), 1), EDITION_MAX) }))}
              type="number"
              value={props.draft.edition}
            />
            <small>Maximum {EDITION_MAX}. Smaller editions often feel more collectible.</small>
          </label>
          <label className="field">
            <span>Price</span>
            <input
              disabled={props.draft.isFree}
              min={0}
              onChange={(event) => props.onUpdateDraft((current) => ({ ...current, price: safeNumber(event.target.value, 0) }))}
              step="0.01"
              type="number"
              value={props.draft.price}
            />
            <small>Free drops usually reach more collectors.</small>
          </label>
        </div>
        <button className={props.draft.isFree ? "toggle active" : "toggle"} onClick={() => props.onUpdateDraft((current) => ({ ...current, isFree: !current.isFree, price: current.isFree ? 0.01 : 0 }))} type="button">
          {props.draft.isFree ? "Free mint" : `Paid mint (${PLATFORM_FEE_PERCENT}% fee)`}
        </button>
        <button className="primary-button wide" disabled={!props.hasArtwork} onClick={() => props.onStep("review")} type="button">
          Review drop <span>→</span>
        </button>
        {!props.hasArtwork ? <p className="microcopy">Add artwork, choose a blank canvas, or select an AI variation before review.</p> : null}
      </div>

      <div className="preview-stage">
        <LivePreview draft={props.draft} />
      </div>
    </section>
  );
}

function StartCard({ icon, label, onClick, text }: { icon: ReactNode; label: string; onClick: () => void; text: string }) {
  return (
    <button className="start-card" onClick={onClick} type="button">
      <span>{icon}</span>
      <h3>{label}</h3>
      <p>{text}</p>
      <strong>Open</strong>
    </button>
  );
}

function LivePreview({ draft }: { draft: StudioDraft }) {
  return (
    <div className="live-preview-card">
      <div className={`preview-art ${draft.frame}`}>
        {draft.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt={draft.title} src={draft.image} />
          </>
        ) : (
          <div className="preview-empty">Awaiting artwork</div>
        )}
        {draft.overlayText ? <span>{draft.overlayText}</span> : null}
      </div>
      <div className="preview-copy">
        <p className="eyebrow">Drop preview</p>
        <h2>{draft.title}</h2>
        <p>{draft.description}</p>
        <div className="stat-row">
            <span>{draft.isFree ? "Free" : `${draft.price} ETH`}</span>
            <span>{draft.edition} editions</span>
            <span>{draft.edition >= TOKEN_UNLOCK_MIN_EDITION ? "Unlock eligible" : "Below unlock minimum"}</span>
        </div>
      </div>
    </div>
  );
}

function ReviewStep({
  draft,
  onBack,
  onPublish,
  publishPending
}: {
  draft: StudioDraft;
  onBack: () => void;
  onPublish: () => void;
  publishPending: boolean;
}) {
  return (
    <section className="review-grid">
      <LivePreview draft={draft} />
      <div className="review-panel">
        <p className="eyebrow">Review & publish</p>
        <h1>Confirm the details before it goes live.</h1>
        <ul className="review-list">
          <li>
            <span>Supply</span>
            <strong>{draft.edition} editions</strong>
          </li>
          <li>
            <span>Mint type</span>
            <strong>{draft.isFree ? "Free mint" : "Paid mint"}</strong>
          </li>
          <li>
            <span>Platform fee</span>
            <strong>{draft.isFree ? "0%" : `${PLATFORM_FEE_PERCENT}%`}</strong>
          </li>
          <li>
            <span>Token eligibility</span>
            <strong>{draft.edition >= TOKEN_UNLOCK_MIN_EDITION ? "Can qualify after sold out + review" : `Needs ${TOKEN_UNLOCK_MIN_EDITION}+ editions`}</strong>
          </li>
        </ul>
        <div className="review-actions">
          <button className="secondary-button" disabled={publishPending} onClick={onBack} type="button">
            Back to studio
          </button>
          <button className="primary-button" disabled={publishPending} onClick={onPublish} type="button">
            {publishPending ? "Publishing..." : "Publish on Base"} <span>{publishPending ? "Wait" : "Live"}</span>
          </button>
        </div>
        <p className="microcopy">Publishing uploads the asset to IPFS, creates metadata, then asks your wallet to create the drop on Base. You pay network gas.</p>
      </div>
    </section>
  );
}

function Dashboard({
  allDrops,
  drops,
  eligibilityReason,
  eligibilityStatus,
  isAdmin,
  onBaseNotificationAdmin,
  onCopyLink,
  onShareFarcaster,
  onShareReddit,
  onShareX,
  soldOutCount
}: {
  allDrops: Drop[];
  drops: Drop[];
  eligibilityReason: string;
  eligibilityStatus: "locked" | "review-ready";
  isAdmin: boolean;
  onBaseNotificationAdmin: BaseNotificationAdminRequester;
  onCopyLink: (drop: Drop) => void;
  onShareFarcaster: (drop: Drop) => void;
  onShareReddit: (drop: Drop) => void;
  onShareX: (drop: Drop) => void;
  soldOutCount: number;
}) {
  const canUnlockToken = eligibilityStatus === "review-ready";

  return (
    <section className="dashboard-grid">
      <div className="dash-hero">
        <p className="eyebrow">Creator dashboard</p>
        <h1>{canUnlockToken ? "Token eligibility unlocked for review." : "Publish, sell out, unlock more tools."}</h1>
        <p>{eligibilityReason}</p>
      </div>
      <div className="metric-card">
        <span>Sold</span>
        <span>Sold-out qualifying drops</span>
        <strong>{soldOutCount}</strong>
      </div>
      <div className="metric-card">
        <span>Next</span>
        <span>Future unlock status</span>
        <strong>{canUnlockToken ? "Review ready" : "Locked"}</strong>
      </div>
      <div className="dashboard-list">
        {drops.length ? (
          drops.map((drop) => (
            <div className="dashboard-row" key={drop.id}>
              <div className="dashboard-row-main">
                <div className="dashboard-row-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt={drop.title} src={drop.image} />
                </div>
                <div className="dashboard-row-copy">
                  <strong>{drop.title}</strong>
                  <span>
                    {drop.minted}/{drop.edition} minted
                  </span>
                </div>
              </div>
              <div className="dashboard-row-actions">
                <div className="social-share-row compact">
                  <button className="social-chip" onClick={() => onCopyLink(drop)} type="button">
                    Copy
                  </button>
                  <button className="social-chip" onClick={() => onShareX(drop)} type="button">
                    X
                  </button>
                  <button className="social-chip" onClick={() => onShareFarcaster(drop)} type="button">
                    Farcaster
                  </button>
                  <button className="social-chip" onClick={() => onShareReddit(drop)} type="button">
                    Reddit
                  </button>
                </div>
                <span className="dashboard-row-status">{drop.status}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">Create your first onchain drop to see dashboard metrics.</div>
        )}
      </div>
      {isAdmin ? <BaseNotificationAdminPanel drops={allDrops} onRequest={onBaseNotificationAdmin} /> : null}
    </section>
  );
}

function BaseNotificationAdminPanel({ drops, onRequest }: { drops: Drop[]; onRequest: BaseNotificationAdminRequester }) {
  const [title, setTitle] = useState("New drop live");
  const [message, setMessage] = useState("A new limited Droproom NFT drop is now available on Base.");
  const [targetPath, setTargetPath] = useState("/");
  const [audienceCount, setAudienceCount] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState<"audience" | "send" | "test" | null>(null);
  const titleInvalid = title.trim().length === 0 || title.trim().length > 30;
  const messageInvalid = message.trim().length === 0 || message.trim().length > 200;
  const liveDrops = drops.filter((drop) => drop.tokenId);

  function selectTargetDrop(dropId: string) {
    const selected = liveDrops.find((drop) => drop.id === dropId);
    if (!selected) return;

    setTitle(`${selected.title}`.slice(0, 30));
    setMessage(`A limited Droproom edition is live on Base: ${selected.title}`.slice(0, 200));
    setTargetPath(`/?drop=${selected.id}`);
  }

  async function run(action: "audience" | "send" | "test") {
    try {
      setLoading(action);
      setStatus(action === "audience" ? "Checking Base App notification audience..." : "Sign with the admin wallet to continue.");
      const result = await onRequest({
        action,
        message,
        targetPath,
        title
      });

      if (typeof result.notificationEnabledCount === "number") {
        setAudienceCount(result.notificationEnabledCount);
      }

      if (action === "audience") {
        setStatus(`${result.notificationEnabledCount ?? 0} saved users currently have notifications enabled.`);
      } else {
        setStatus(`${action === "test" ? "Test sent" : "Sent"} ${result.sentCount ?? 0}/${result.targetedCount ?? 0}. Failed: ${result.failedCount ?? 0}.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Base notification action failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="admin-notification-panel">
      <div className="admin-panel-head">
        <div>
          <p className="eyebrow">Admin notifications</p>
          <h2>Send Base App alerts.</h2>
          <p>Only saved Base App users who enabled notifications can receive these messages.</p>
        </div>
        <strong>{audienceCount === null ? "Not checked" : `${audienceCount} enabled`}</strong>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Target drop</span>
          <select defaultValue="" onChange={(event) => selectTargetDrop(event.target.value)}>
            <option value="">Manual target</option>
            {liveDrops.map((drop) => (
              <option key={drop.id} value={drop.id}>
                {drop.title}
              </option>
            ))}
          </select>
          <small>Pick a live drop to generate the notification link.</small>
        </label>
        <label className="field">
          <span>Title</span>
          <input maxLength={30} onChange={(event) => setTitle(event.target.value)} value={title} />
          <small>{title.trim().length}/30</small>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Target path</span>
          <input onChange={(event) => setTargetPath(event.target.value)} placeholder="/?drop=1" value={targetPath} />
          <small>Use / for home or /?drop=TOKEN_ID for a specific drop.</small>
        </label>
      </div>
      <label className="field">
        <span>Message</span>
        <textarea maxLength={200} onChange={(event) => setMessage(event.target.value)} value={message} />
        <small>{message.trim().length}/200</small>
      </label>
      <div className="admin-actions">
        <button className="secondary-button" disabled={loading !== null} onClick={() => void run("audience")} type="button">
          {loading === "audience" ? "Checking..." : "Check audience"}
        </button>
        <button className="secondary-button" disabled={loading !== null || titleInvalid || messageInvalid} onClick={() => void run("test")} type="button">
          {loading === "test" ? "Sending test..." : "Send test to me"}
        </button>
        <button
          className="primary-button"
          disabled={loading !== null || titleInvalid || messageInvalid}
          onClick={() => void run("send")}
          type="button"
        >
          {loading === "send" ? "Sending..." : "Send notification"}
        </button>
      </div>
      {status ? <p className="microcopy admin-status">{status}</p> : null}
    </section>
  );
}

function LibraryView({ drops, onOpenDrop }: { drops: Drop[]; onOpenDrop: (id: string) => void }) {
  return (
    <section className="library-view">
      <p className="eyebrow">Collector library</p>
      <h1>Your collected editions live here.</h1>
      {drops.length ? (
        <div className="drop-grid compact">
          {drops.map((drop) => (
            <DropCard drop={drop} isSelected={false} key={drop.id} onClick={() => onOpenDrop(drop.id)} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span>Base</span>
          Mint a live Base edition from Explore to populate your collection.
        </div>
      )}
    </section>
  );
}


