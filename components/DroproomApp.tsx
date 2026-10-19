"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState, type ReactNode, type TouchEvent } from "react";
import { parseEther } from "viem";

import { MintSuccessModal } from "@/components/MintSuccessModal";
import { CreatorGateNotice } from "@/components/CreatorGateNotice";
import { DropDialog, RoomDock, RoomHero, RoomIcon } from "@/components/RoomExperience";
import { compareGenesisFirst, isGenesisDrop } from "@/lib/genesis";
import { CARD_TEMPLATES, createCardArtwork } from "@/lib/card-artwork";
import { assertCreatorCanPublish } from "@/lib/contract/creator-gate";
import { discoverDrops, isPresentationReady, type DiscoveryFilter, type DiscoverySort } from "@/lib/discovery";
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
import { compareAdminFeaturedDrops, isAdminHiddenDrop } from "@/lib/drop-visibility";
import { getDropPath, getDropPermalink } from "@/lib/drop-links";
import { getCreatorTokenEligibility } from "@/lib/eligibility";
import { isVisibleDropId } from "@/lib/hidden-drops";
import { copyToClipboard, shareOnFarcaster, shareOnReddit, shareOnX, type ShareData } from "@/lib/social-share";
import type { Drop, StartMode, StudioDraft } from "@/lib/types";
import type { WalletProviderOption } from "@/lib/wallet/provider";

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
type DropModerationAdminInput = {
  action: "list" | "hide" | "show";
  tokenId?: string;
};
type DropModerationAdminResult = {
  drop?: Drop;
  drops?: Drop[];
  error?: string;
};
type DropModerationAdminRequester = (input: DropModerationAdminInput) => Promise<DropModerationAdminResult>;

const libraryKey = "droproom:library:v1";
const savedKey = "droproom:saved:v1";
const brandIconPrimary = "/brand/logo.png";
const droproomXHandle = "@droproombase";
const droproomXUrl = "https://x.com/droproombase";

const defaultDraft: StudioDraft = {
  title: "",
  description: "",
  image: "",
  background: "#153be8",
  frame: "orbit",
  overlayText: "",
  edition: 10,
  price: 0,
  isFree: true
};

const createBlankArtwork = createCardArtwork;

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

function resolveDropPermalink(drop: Drop) {
  return getDropPermalink(resolveAppOrigin(), drop);
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

export function DroproomApp({ initialDropId }: { initialDropId?: string } = {}) {
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
  const [savedDrops, setSavedDrops] = useState<string[]>([]);
  const [aiPrompt, setAiPrompt] = useState("");
  const [styleChip, setStyleChip] = useState<StyleChipId>("premium");
  const [aiImages, setAiImages] = useState<string[]>([]);
  const [aiJobsUsed, setAiJobsUsed] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [viewHistory, setViewHistory] = useState<View[]>([]);
  const [publishPending, setPublishPending] = useState(false);
  const [publishedDropId, setPublishedDropId] = useState<string | null>(null);
  const [mintPending, setMintPending] = useState(false);
  const [mintSuccessData, setMintSuccessData] = useState<{
    drop: Drop;
    mintNumber: number;
    shareUrl: string;
  } | null>(null);
  const [dropsLoading, setDropsLoading] = useState(true);
  const [dropsError, setDropsError] = useState(false);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const hasArtwork = Boolean(draft.image);
  const walletAddress = droproom.account ?? "";

  useEffect(() => {
    const savedLibrary = parseLibrary(window.localStorage.getItem(libraryKey));
    setLibraryByWallet(savedLibrary);
    try {
      const saved = JSON.parse(window.localStorage.getItem(savedKey) ?? "[]");
      if (Array.isArray(saved)) setSavedDrops(saved.filter((id): id is string => typeof id === "string"));
    } catch { /* Saving is optional; browsing still works if storage is unavailable. */ }
    void loadDrops();
    // loadDrops is intentionally kept as the page bootstrap routine; initialDropId is the only route input it needs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialDropId]);

  useEffect(() => {
    safeStorageSet(libraryKey, libraryByWallet);
  }, [libraryByWallet]);

  const selectedDrop = drops.find((drop) => drop.id === selectedDropId);
  const publishedDrop = publishedDropId ? drops.find((drop) => drop.id === publishedDropId) ?? null : null;
  const activeLibrary = walletAddress ? libraryByWallet[walletAddress.toLowerCase()] ?? [] : [];
  const creatorDrops = drops.filter((drop) => drop.creatorAddress?.toLowerCase() === walletAddress.toLowerCase());
  const prioritizedDrops = [...drops].sort(compareAdminFeaturedDrops);
  const soldOutCount = creatorDrops.filter((drop) => drop.status === "sold-out" && drop.edition >= TOKEN_UNLOCK_MIN_EDITION).length;
  const tokenEligibility = getCreatorTokenEligibility(drops, walletAddress);
  const isPlatformAdmin = walletAddress.toLowerCase() === PLATFORM_WALLET.toLowerCase();
  const genesisDrop = prioritizedDrops.find(isGenesisDrop);
  const collectionDrops = [...prioritizedDrops]
    .filter((drop) => drop.tokenId && (isGenesisDrop(drop) || isPresentationReady(drop)))
    .sort((left, right) => compareGenesisFirst(left, right) || right.minted - left.minted)
    .slice(0, 4);

  function toggleSavedDrop(id: string) {
    const next = savedDrops.includes(id) ? savedDrops.filter((item) => item !== id) : [...savedDrops, id];
    setSavedDrops(next);
    try { window.localStorage.setItem(savedKey, JSON.stringify(next)); } catch { setNotice("Saved for this visit. Browser storage is unavailable."); }
  }

  function closeDrop() {
    setSelectedDropId(null);
    window.history.replaceState({}, "", "/");
  }

  function setActiveView(nextView: View, options: { replace?: boolean } = {}) {
    if (nextView !== "explore") closeDrop();
    if (nextView !== view && !options.replace) {
      setViewHistory((current) => [...current, view].slice(-8));
    }
    setView(nextView);
    setWalletMenuOpen(false);
    setMobileMenuOpen(false);
    if (nextView === "create") setCreateStep("start");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function goBackInApp() {
    if (mobileMenuOpen) {
      setMobileMenuOpen(false);
      return;
    }

    if (walletMenuOpen) {
      setWalletMenuOpen(false);
      return;
    }

    if (view === "explore") {
      if (selectedDropId) { closeDrop(); return; }
      const url = new URL(window.location.href);
      if (url.searchParams.has("drop")) {
        url.searchParams.delete("drop");
        window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
        setSelectedDropId(null);
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
      return;
    }

    const previousView = viewHistory[viewHistory.length - 1] ?? "explore";
    setView(previousView);
    setViewHistory((current) => current.slice(0, -1));
    setWalletMenuOpen(false);
    setMobileMenuOpen(false);
  }

  function isSwipeTargetIgnored(target: EventTarget | null) {
    return target instanceof Element && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
  }

  function handleTouchStart(event: TouchEvent<HTMLElement>) {
    if (event.touches.length !== 1 || isSwipeTargetIgnored(event.target)) {
      swipeStartRef.current = null;
      return;
    }

    const touch = event.touches[0];
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleTouchEnd(event: TouchEvent<HTMLElement>) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!start || event.changedTouches.length !== 1) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (dx > 76 && Math.abs(dx) > Math.abs(dy) * 1.45) {
      goBackInApp();
    }
  }

  function scrollToLandingSection(sectionId: string) {
    setActiveView("explore");
    window.setTimeout(() => {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  }

  async function loadDrops() {
    try {
      setDropsLoading(true);
      setDropsError(false);
      const requestedDropId = initialDropId ?? new URLSearchParams(window.location.search).get("drop");
      const endpoint = requestedDropId ? `/api/drops?drop=${encodeURIComponent(requestedDropId)}` : "/api/drops";
      const response = await fetch(endpoint, { cache: "no-store" });
      const payload = (await response.json()) as { drops?: Drop[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Live drops are temporarily unavailable.");
      const nextDrops = (payload.drops ?? [])
        .filter((drop) => isVisibleDropId(drop.tokenId ?? drop.id) && !isAdminHiddenDrop(drop))
        .sort(compareAdminFeaturedDrops);
      const requestedDrop = requestedDropId ? nextDrops.find((drop) => drop.id === requestedDropId || drop.tokenId === requestedDropId) : null;
      setDrops(nextDrops);
      setSelectedDropId((current) => {
        if (requestedDropId) return requestedDrop?.id ?? null;
        return current;
      });
      if (requestedDrop) {
        window.history.replaceState({}, "", getDropPath(requestedDrop));
      }
      if (requestedDropId && !requestedDrop) {
        setNotice("This shared drop is still indexing or unavailable right now.");
      } else if (!response.ok && payload.error) {
        setNotice(payload.error);
      }
    } catch {
      setDropsError(true);
      setNotice("Live drops could not be loaded yet.");
    } finally {
      setDropsLoading(false);
    }
  }

  function selectDrop(id: string) {
    setSelectedDropId(id);

    const drop = drops.find((item) => item.id === id || item.tokenId === id);
    if (drop) {
      window.history.replaceState({}, "", getDropPath(drop));
      return;
    }

    const fallbackUrl = new URL(window.location.href);
    fallbackUrl.searchParams.set("drop", id);
    window.history.replaceState({}, "", `${fallbackUrl.pathname}${fallbackUrl.search}${fallbackUrl.hash}`);
  }

  async function signAdminAction(action: string) {
    if (!walletAddress) {
      throw new Error("Connect the Droproom admin Base Wallet first.");
    }

    const signedMessage = [
      "Droproom admin action",
      `Action: ${action}`,
      `Domain: ${window.location.host}`,
      `Issued At: ${new Date().toISOString()}`
    ].join("\n");

    return droproom.signMessage(signedMessage);
  }

  async function requestBaseNotificationAdmin(input: BaseNotificationAdminInput) {
    const auth = await signAdminAction(input.action);
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

  async function requestDropModerationAdmin(input: DropModerationAdminInput) {
    const auth = await signAdminAction("drop-content");
    const response = await fetch("/api/admin/drops", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...input, auth })
    });
    const payload = (await response.json().catch(() => null)) as DropModerationAdminResult | null;

    if (!response.ok) {
      throw new Error(payload?.error ?? "Drop moderation request failed.");
    }

    const moderatedDrop = payload?.drop;
    if (moderatedDrop) {
      setDrops((current) => {
        if (isAdminHiddenDrop(moderatedDrop)) {
          return current.filter((drop) => drop.id !== moderatedDrop.id);
        }

        return [moderatedDrop, ...current.filter((drop) => drop.id !== moderatedDrop.id)].sort(compareAdminFeaturedDrops);
      });
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
      const tokenIds = payload.mints?.map((mint) => mint.token_id).filter(isVisibleDropId) ?? [];
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

  async function connectWallet(providerOption?: WalletProviderOption) {
    try {
      setWalletLoading(true);
      const nextWallet = await droproom.connect(providerOption);
      setWalletMenuOpen(false);
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
      const previousWallet = walletAddress;
      const nextWallet = await droproom.switchAccount();
      setWalletMenuOpen(false);
      setNotice(
        previousWallet && previousWallet.toLowerCase() === nextWallet.toLowerCase()
          ? `Wallet kept the same account: ${shortAddress(nextWallet)}. Choose another account in the wallet popup and retry.`
          : `Base account switched: ${shortAddress(nextWallet)}`
      );
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
      url: resolveDropPermalink(drop)
    };
  }

  async function copyDropLink(drop: Drop, successMessage = "Drop link copied.") {
    try {
      const copied = await copyToClipboard(resolveDropPermalink(drop));
      setNotice(copied ? successMessage : "Drop link could not be copied here.");
    } catch {
      setNotice("Drop link could not be copied here.");
    }
  }

  function shareCreatedDrop(drop: Drop, network: "x" | "farcaster" | "reddit") {
    const shareData = buildShareData(drop);
    const intent = walletAddress && drop.creatorAddress?.toLowerCase() === walletAddress.toLowerCase() ? "created" : "collect";

    if (network === "x") {
      shareOnX(shareData, intent);
      return;
    }

    if (network === "farcaster") {
      shareOnFarcaster(shareData, intent);
      return;
    }

    shareOnReddit(shareData, intent);
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
      title: "",
      image: mode === "blank" ? createBlankArtwork() : ""
    });

    if (mode === "blank") {
      setDraft((current) => ({
        ...current,
        title: "",
        image: createBlankArtwork("", current.background, current.frame)
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
    setCreateStep("studio");
  }

  async function publishDrop() {
    if (publishPending) return;

    try {
      setPublishPending(true);
      if (draft.title.trim().length < 3 || /^untitled(?: drop)?$/i.test(draft.title.trim())) {
        throw new Error("Give your drop a name of at least 3 characters before publishing.");
      }
      if (draft.description.trim().length < 10) {
        throw new Error("Add a short description of at least 10 characters so collectors know what they’re minting.");
      }
      setNotice("Preparing your wallet on Base...");
      const publisher = await droproom.connect();
      setNotice("Checking your existing drops on Base...");
      await assertCreatorCanPublish(publisher);

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

  async function mintSelectedDrop(targetDrop = selectedDrop) {
    if (!targetDrop) return;
    selectDrop(targetDrop.id);
    if (!targetDrop.tokenId) {
      setNotice("This drop is not connected to an onchain token yet.");
      return;
    }
    if (mintPending || targetDrop.status !== "live" || targetDrop.minted >= targetDrop.edition || activeLibrary.includes(targetDrop.id)) return;

    try {
      setMintPending(true);
      setNotice("Confirm the mint in your wallet. Free mint means price is 0; Base gas is still paid by you.");
      const result = await droproom.mintDrop({ tokenId: targetDrop.tokenId, quantity: 1 });
      const mintedEvent = result.events.minted[0];
      if (!mintedEvent) throw new Error("The mint event could not be confirmed. Check your transaction before trying again.");
      const mintWallet = mintedEvent.collector;
      const paidWei = mintedEvent?.paid?.toString() ?? targetDrop.priceWei ?? "0";

      const minted = mintedEvent ? Number(mintedEvent.totalMinted) : Math.min(targetDrop.minted + 1, targetDrop.edition);
      const updatedDrop: Drop = {
        ...targetDrop,
        collectors: targetDrop.collectors.includes(mintWallet)
          ? targetDrop.collectors
          : [...targetDrop.collectors, mintWallet],
        minted,
        status: minted >= targetDrop.edition ? "sold-out" : targetDrop.status
      };

      setDrops((current) => current.map((drop) => (drop.id === targetDrop.id ? updatedDrop : drop)));
      setLibraryByWallet((current) => {
        const key = mintWallet.toLowerCase();
        const existing = current[key] ?? [];
        return {
          ...current,
          [key]: [targetDrop.id, ...existing.filter((id) => id !== targetDrop.id)]
        };
      });
      setMintSuccessData({
        drop: updatedDrop,
        mintNumber: minted,
        shareUrl: resolveDropPermalink(updatedDrop)
      });
      closeDrop();
      setNotice(`Successfully minted on Base. ${updatedDrop.title} is now in your library.`);
      try {
        await saveMint({
          basescan_url: result.basescanUrl,
          collector_address: mintWallet,
          paid_wei: paidWei,
          quantity: 1,
          token_id: targetDrop.tokenId,
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
    <main className="app-shell marketplace-shell" onTouchEnd={handleTouchEnd} onTouchStart={handleTouchStart}>
      <MarketplaceNav
        isCorrectChain={droproom.isCorrectChain}
        mobileMenuOpen={mobileMenuOpen}
        onCloseMobileMenu={() => setMobileMenuOpen(false)}
        onConnectWallet={connectWallet}
        onCopyWalletAddress={copyWalletAddress}
        onDashboard={() => setActiveView("dashboard")}
        onDisconnectWallet={disconnectWallet}
        onLibrary={() => setActiveView("library")}
        onOpenCreate={() => setActiveView("create")}
        onOpenLanding={() => { closeDrop(); setActiveView("explore"); }}
        onScrollCollections={() => scrollToLandingSection("collections")}
        onScrollCreate={() => setActiveView("create")}
        onScrollDrops={() => scrollToLandingSection("drops")}
        onSwitchAccount={switchWalletAccount}
        onSwitchBase={() => void droproom.ensureBaseChain()}
        onToggleMobileMenu={() => setMobileMenuOpen((current) => !current)}
        onToggleWalletMenu={() => setWalletMenuOpen((current) => !current)}
        walletAddress={walletAddress}
        walletLoading={walletLoading}
        walletMenuOpen={walletMenuOpen}
        walletProviderName={droproom.walletProvider?.name}
        walletProviderOptions={droproom.walletProviderOptions}
      />

      {notice ? (
        <div className={`notice ${/indexed|minted|generated|uploaded|connected/i.test(notice) ? "success" : ""}`}>
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
        <>
          {publishedDrop ? (
            <section className="section-wrap publish-wrap">
              <PublishSuccessPanel
                drop={publishedDrop}
                onCopyLink={() => void copyDropLink(publishedDrop, "Creator link copied.")}
                onDismiss={() => setPublishedDropId(null)}
                onShareFarcaster={() => shareCreatedDrop(publishedDrop, "farcaster")}
                onShareReddit={() => shareCreatedDrop(publishedDrop, "reddit")}
                onShareX={() => shareCreatedDrop(publishedDrop, "x")}
              />
            </section>
          ) : null}

          <RoomHero
            genesis={genesisDrop}
            loading={dropsLoading}
            artwork={genesisDrop ? <ArtworkMedia alt={genesisDrop.title} src={genesisDrop.image} /> : null}
            onOpen={() => { if (genesisDrop) selectDrop(genesisDrop.id); }}
            onCreate={() => setActiveView("create")}
          />

          <LiveDropsSection
            activeLibrary={activeLibrary}
            savedDrops={savedDrops}
            onToggleSaved={toggleSavedDrop}
            drops={prioritizedDrops}
            dropsLoading={dropsLoading}
            dropsError={dropsError}
            onRetry={() => void loadDrops()}
            isMinting={mintPending}
            onCreate={() => setActiveView("create")}
            onMint={(drop) => void mintSelectedDrop(drop)}
            onSelect={selectDrop}
            selectedDropId={selectedDrop?.id ?? null}
          />

          {selectedDrop ? (
            <DropDialog title={selectedDrop.title} onClose={closeDrop}>
              {notice ? <p className="room-dialog-notice" role="status">{notice}</p> : null}
              <DropDetail
                canShare
                drop={selectedDrop}
                isMinting={mintPending}
                isOwned={activeLibrary.includes(selectedDrop.id)}
                isWalletConnected={Boolean(walletAddress)}
                onCopyLink={() => void copyDropLink(selectedDrop, "Drop link copied.")}
                onMint={() => void mintSelectedDrop(selectedDrop)}
                onShareFarcaster={() => shareCreatedDrop(selectedDrop, "farcaster")}
                onShareReddit={() => shareCreatedDrop(selectedDrop, "reddit")}
                onShareX={() => shareCreatedDrop(selectedDrop, "x")}
              />
            </DropDialog>
          ) : null}

          <CollectionsSection drops={collectionDrops} onSelect={selectDrop} />
          <CreateCta onCreate={() => setActiveView("create")} />
          <MarketplaceFooter />
        </>
      ) : null}

      {view === "create" ? (
        <section className="screen create-screen page-view">
          <CreatorGateNotice account={droproom.account} />
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
        <section className="screen dashboard page-view">
          <Dashboard
            drops={creatorDrops}
            eligibilityReason={tokenEligibility.reason}
            eligibilityStatus={tokenEligibility.status}
            isAdmin={isPlatformAdmin}
            allDrops={drops}
            onBaseNotificationAdmin={requestBaseNotificationAdmin}
            onDropModerationAdmin={requestDropModerationAdmin}
            onCopyLink={(drop) => void copyDropLink(drop, "Creator link copied.")}
            onShareFarcaster={(drop) => shareCreatedDrop(drop, "farcaster")}
            onShareReddit={(drop) => shareCreatedDrop(drop, "reddit")}
            onShareX={(drop) => shareCreatedDrop(drop, "x")}
            soldOutCount={soldOutCount}
          />
        </section>
      ) : null}

      {view === "library" ? (
        <section className="screen library-screen page-view">
          <LibraryView
            drops={drops.filter((drop) => activeLibrary.includes(drop.id))}
            onOpenDrop={(id) => {
              selectDrop(id);
              setActiveView("explore");
            }}
          />
        </section>
      ) : null}
      <RoomDock view={view} onExplore={() => { closeDrop(); setActiveView("explore"); }} onCreate={() => setActiveView("create")} onLibrary={() => setActiveView("library")} />
    </main>
  );
}

function MarketplaceNav({
  isCorrectChain,
  mobileMenuOpen,
  onCloseMobileMenu,
  onConnectWallet,
  onCopyWalletAddress,
  onDashboard,
  onDisconnectWallet,
  onLibrary,
  onOpenCreate,
  onOpenLanding,
  onScrollCollections,
  onScrollCreate,
  onScrollDrops,
  onSwitchAccount,
  onSwitchBase,
  onToggleMobileMenu,
  onToggleWalletMenu,
  walletAddress,
  walletLoading,
  walletMenuOpen,
  walletProviderName,
  walletProviderOptions
}: {
  isCorrectChain: boolean;
  mobileMenuOpen: boolean;
  onCloseMobileMenu: () => void;
  onConnectWallet: (providerOption?: WalletProviderOption) => Promise<void>;
  onCopyWalletAddress: () => Promise<void>;
  onDashboard: () => void;
  onDisconnectWallet: () => Promise<void>;
  onLibrary: () => void;
  onOpenCreate: () => void;
  onOpenLanding: () => void;
  onScrollCollections: () => void;
  onScrollCreate: () => void;
  onScrollDrops: () => void;
  onSwitchAccount: () => Promise<void>;
  onSwitchBase: () => void;
  onToggleMobileMenu: () => void;
  onToggleWalletMenu: () => void;
  walletAddress: string;
  walletLoading: boolean;
  walletMenuOpen: boolean;
  walletProviderName?: string;
  walletProviderOptions: WalletProviderOption[];
}) {
  return (
    <header className="market-nav">
      <div className="market-nav-inner">
        <button className="market-brand" onClick={onOpenLanding} type="button">
          <span className="market-brand-icon">
            <Image alt="Droproom icon" height={56} priority src={brandIconPrimary} width={56} />
          </span>
          <span>Droproom</span>
        </button>

        <nav className="market-links" aria-label="Marketplace navigation">
          <button onClick={onScrollDrops} type="button">Explore</button>
          <button onClick={onLibrary} type="button">My collection</button>
          <button onClick={onScrollCreate} type="button">Create</button>
        </nav>

        <div className="market-actions">
          <WalletMenu
            isCorrectChain={isCorrectChain}
            onConnectWallet={onConnectWallet}
            onCopyWalletAddress={onCopyWalletAddress}
            onDashboard={onDashboard}
            onDisconnectWallet={onDisconnectWallet}
            onLibrary={onLibrary}
            onSwitchAccount={onSwitchAccount}
            onSwitchBase={onSwitchBase}
            onToggleWalletMenu={onToggleWalletMenu}
            walletAddress={walletAddress}
            walletLoading={walletLoading}
            walletMenuOpen={walletMenuOpen}
            walletProviderName={walletProviderName}
            walletProviderOptions={walletProviderOptions}
          />
          <button
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            className={mobileMenuOpen ? "mobile-menu-button active" : "mobile-menu-button"}
            onClick={onToggleMobileMenu}
            type="button"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {mobileMenuOpen ? (
        <div className="mobile-menu-panel">
          <button onClick={onScrollDrops} type="button">Drops</button>
          <button onClick={onScrollCollections} type="button">Collections</button>
          <button onClick={onScrollCreate} type="button">Create</button>
          <button onClick={onOpenCreate} type="button">Open studio</button>
          <button onClick={onDashboard} type="button">Dashboard</button>
          <button onClick={onLibrary} type="button">Library</button>
          <button onClick={onCloseMobileMenu} type="button">Close</button>
        </div>
      ) : null}
    </header>
  );
}

function WalletMenu({
  isCorrectChain,
  onConnectWallet,
  onCopyWalletAddress,
  onDashboard,
  onDisconnectWallet,
  onLibrary,
  onSwitchAccount,
  onSwitchBase,
  onToggleWalletMenu,
  walletAddress,
  walletLoading,
  walletMenuOpen,
  walletProviderName,
  walletProviderOptions
}: {
  isCorrectChain: boolean;
  onConnectWallet: (providerOption?: WalletProviderOption) => Promise<void>;
  onCopyWalletAddress: () => Promise<void>;
  onDashboard: () => void;
  onDisconnectWallet: () => Promise<void>;
  onLibrary: () => void;
  onSwitchAccount: () => Promise<void>;
  onSwitchBase: () => void;
  onToggleWalletMenu: () => void;
  walletAddress: string;
  walletLoading: boolean;
  walletMenuOpen: boolean;
  walletProviderName?: string;
  walletProviderOptions: WalletProviderOption[];
}) {
  return (
    <div className="wallet-menu">
      <button
        aria-expanded={walletMenuOpen}
        className={walletAddress ? "wallet-button connected" : "wallet-button"}
        disabled={walletLoading}
        onClick={onToggleWalletMenu}
        type="button"
      >
        {walletAddress ? (
          <span className="wallet-status-dot" aria-hidden="true" />
        ) : (
          <span className="wallet-glyph" aria-hidden="true" />
        )}
        <strong>
          {walletLoading
            ? "Opening..."
            : walletAddress
              ? isCorrectChain
                ? shortAddress(walletAddress)
                : "Switch to Base"
              : "Connect"}
        </strong>
      </button>

      {walletMenuOpen && walletAddress ? (
        <div className="wallet-dropdown">
          <span>Connected wallet</span>
          <strong>{shortAddress(walletAddress)}</strong>
          <small>{walletProviderName ?? "Wallet"} on {isCorrectChain ? "Base" : "wrong network"}</small>
          <button onClick={() => void onCopyWalletAddress()} type="button">Copy address</button>
          <button onClick={() => void onSwitchAccount()} type="button">Change account</button>
          {!isCorrectChain ? <button onClick={onSwitchBase} type="button">Switch to Base</button> : null}
          <button onClick={onDashboard} type="button">Dashboard</button>
          <button onClick={onLibrary} type="button">Library</button>
          <a href={`https://basescan.org/address/${walletAddress}`} rel="noreferrer" target="_blank">View on Basescan</a>
          <button className="danger-link" onClick={() => void onDisconnectWallet()} type="button">Disconnect</button>
        </div>
      ) : null}

      {walletMenuOpen && !walletAddress ? (
        <div className="wallet-dropdown wallet-picker" role="dialog" aria-label="Choose wallet">
          <span>Connect wallet</span>
          <strong>Choose how to enter Droproom</strong>
          {walletProviderOptions.length ? (
            <div className="wallet-option-list">
              {walletProviderOptions.map((option) => (
                <button className="wallet-option" key={option.id} onClick={() => void onConnectWallet(option)} type="button">
                  <WalletProviderIcon option={option} />
                  <span>
                    <strong>{option.name}</strong>
                    <small>{option.isPreferred ? "Recommended for Base" : option.kind === "metamask" ? "Injected wallet" : "Detected wallet"}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="wallet-empty-state">
              Open Droproom in Base Wallet, Coinbase Wallet, MetaMask, or another EIP-1193 wallet browser to connect.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function LiveDropsSection({
  activeLibrary,
  savedDrops,
  onToggleSaved,
  drops,
  dropsLoading,
  dropsError,
  onRetry,
  isMinting,
  onCreate,
  onMint,
  onSelect,
  selectedDropId
}: {
  activeLibrary: string[];
  savedDrops: string[];
  onToggleSaved: (id: string) => void;
  drops: Drop[];
  dropsLoading: boolean;
  dropsError: boolean;
  onRetry: () => void;
  isMinting: boolean;
  onCreate: () => void;
  onMint: (drop: Drop) => void;
  onSelect: (id: string) => void;
  selectedDropId: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<DiscoveryFilter>("live");
  const [sort, setSort] = useState<DiscoverySort>("newest");
  const [limit, setLimit] = useState(12);
  const results = discoverDrops(drops, query, filter, sort, savedDrops);
  const filters: { id: DiscoveryFilter; label: string }[] = [
    { id: "live", label: "Live drops" }, { id: "free", label: "Free mint" },
    { id: "small", label: "Small editions" }, { id: "sold-out", label: "Sold out" }, { id: "saved", label: `Saved (${savedDrops.length})` }
  ];
  return (
    <section className="section-wrap live-drops-section" id="drops">
      <div className="section-heading">
        <div>
          <p className="eyebrow">THE COMMUNITY COLLECTION</p>
          <h2>Fresh in the room<span className="heading-dot">.</span></h2>
          <p>{filter === "saved" ? "Your shortlist, saved on this browser." : "Genesis first. Then something new to discover."}</p>
        </div>
        <button className="text-link" onClick={onCreate} type="button">Create a drop ↗</button>
      </div>

      <div className="discovery-toolbar">
        <label className="discovery-search">
          <span className="sr-only">Search drops</span>
          <RoomIcon name="explore" /><input type="search" placeholder="Find a drop, creator or token…" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(12); }} />
        </label>
        <label className="discovery-sort">
          <span>Sort by</span>
          <select value={sort} onChange={(event) => { setSort(event.target.value as DiscoverySort); setLimit(12); }}>
            <option value="newest">Newest</option><option value="collected">Most minted</option><option value="remaining">Fewest left</option>
          </select>
        </label>
      </div>
      <div className="discovery-filter-row">
        <div className="discovery-filters" aria-label="Filter drops">
          {filters.map((item) => <button key={item.id} type="button" className={filter === item.id ? "chip active" : "chip"} aria-pressed={filter === item.id} onClick={() => { setFilter(item.id); setLimit(12); }}>{item.label}</button>)}
        </div>
        <span className="discovery-count" role="status">{dropsLoading ? "Loading drops…" : `${results.length} ${results.length === 1 ? "drop" : "drops"}`}</span>
      </div>

      {dropsLoading ? (
        <div className="drop-card-grid">
          {[0, 1, 2, 3].map((item) => (
            <div className="market-drop-card skeleton" key={item} />
          ))}
        </div>
      ) : dropsError ? (
        <div className="discovery-empty" role="alert">
          <h3>The room is taking a moment.</h3>
          <p>We couldn’t load the live drops. Please try again.</p>
          <button type="button" className="secondary-button" onClick={onRetry}>Retry loading drops</button>
        </div>
      ) : results.length ? (
        <>
        <div className="drop-card-grid">
          {results.slice(0, limit).map((drop) => (
            <LiveDropCard
              drop={drop}
              isMinting={isMinting}
              isOwned={activeLibrary.includes(drop.id)}
              isSelected={drop.id === selectedDropId}
              isSaved={savedDrops.includes(drop.id)}
              onToggleSaved={() => onToggleSaved(drop.id)}
              key={drop.id}
              onMint={() => onMint(drop)}
              onSelect={() => onSelect(drop.id)}
            />
          ))}
        </div>
        {results.length > limit ? <button className="secondary-button load-more" type="button" onClick={() => setLimit((value) => value + 12)}>Show more drops ({results.length - limit} left)</button> : null}
        </>
      ) : drops.length ? (
        <div className="discovery-empty">
          <h3>No drops match just yet.</h3>
          <p>Try another name or explore all live drops.</p>
          <button type="button" className="secondary-button" onClick={() => { setQuery(""); setFilter("live"); setLimit(12); }}>Reset filters</button>
        </div>
      ) : (
        <GenesisEmptyState onCreate={onCreate} />
      )}
    </section>
  );
}

function LiveDropCard({
  drop,
  isSaved,
  onToggleSaved,
  isMinting,
  isOwned,
  isSelected,
  onMint,
  onSelect
}: {
  drop: Drop;
  isSaved: boolean;
  onToggleSaved: () => void;
  isMinting: boolean;
  isOwned: boolean;
  isSelected: boolean;
  onMint: () => void;
  onSelect: () => void;
}) {
  const remaining = getDropRemaining(drop);
  const soldOut = remaining === 0;
  const progress = getDropProgress(drop);

  return (
    <article className={`market-drop-card${isSelected ? " selected" : ""}${isGenesisDrop(drop) ? " genesis-pinned" : ""}`} data-token-id={drop.tokenId}>
      <button className="market-drop-art" onClick={onSelect} type="button">
        <ArtworkMedia alt={drop.title} src={drop.image} />
        <span className={soldOut ? "drop-state sold" : "drop-state live"}>
          <i />
          {isGenesisDrop(drop) ? "Genesis · #1" : soldOut ? "Sold out" : "Live"}
        </span>
      </button>
      <button className={isSaved ? "save-drop saved" : "save-drop"} type="button" aria-label={`${isSaved ? "Unsave" : "Save"} ${drop.title}`} aria-pressed={isSaved} onClick={onToggleSaved}><RoomIcon name="heart" /></button>
      <div className="market-drop-body">
        <button className="room-card-title" type="button" onClick={onSelect}><strong title={drop.title}>{drop.title}</strong><small>{isGenesisDrop(drop) ? "By Droproom · Original" : `by ${drop.creator}`}</small></button>
        <div className="drop-stat-row">
          <div>
            <small>Price</small>
            <strong>{formatDropPrice(drop)}</strong>
          </div>
          <div>
            <small>Remaining</small>
            <strong>{remaining}</strong>
          </div>
        </div>
        <div className="drop-progress-copy">
          <span>{drop.minted} / {drop.edition} collected</span>
        </div>
        <div className="progress-track">
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="drop-card-actions">
          <button className="primary-button" disabled={drop.status !== "live" || soldOut || isOwned || isMinting} onClick={onMint} type="button">
            {soldOut ? "Sold out" : drop.status !== "live" ? "Paused" : isOwned ? "Collected" : isMinting ? "Collecting…" : "Collect"}<span aria-hidden="true">↗</span>
          </button>
        </div>
      </div>
    </article>
  );
}

function CreateCta({ onCreate }: { onCreate: () => void }) {
  return <section className="section-wrap room-invite" id="create">
    <div><span className="eyebrow">THERE’S ROOM FOR YOUR IDEA</span><h2>Made by you. Collected by someone.</h2><p>A photo, a doodle, a wild idea. Turn it into your next drop.</p></div>
    <button type="button" className="primary-button" onClick={onCreate}>Make a drop <span>↗</span></button>
  </section>;
}

function CollectionsSection({ drops, onSelect }: { drops: Drop[]; onSelect: (id: string) => void }) {
  return (
    <section className="section-wrap collections-section" id="collections">
      <div className="section-heading">
        <div>
          <p className="eyebrow">WORTH ANOTHER LOOK</p>
          <h2>Room favorites<span className="heading-dot">.</span></h2>
          <p>Our original first, followed by the most collected.</p>
        </div>
      </div>
      {drops.length ? (
        <div className="collection-grid">
          {drops.map((drop) => (
            <button className="collection-card" key={drop.id} onClick={() => onSelect(drop.id)} type="button">
              <span className="collection-art">
                <ArtworkMedia alt={drop.title} src={drop.image} />
              </span>
              <strong>{drop.title}</strong>
              <span>
                <small>Minted</small>
                <b>{drop.minted}/{drop.edition}</b>
              </span>
              <span>
                <small>Price</small>
                <b>{formatDropPrice(drop)}</b>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="empty-state">Community favorites will appear here.</div>
      )}
    </section>
  );
}

function MarketplaceFooter() {
  return (
    <footer className="market-footer">
      <div>
        <div className="market-brand footer-brand">
          <span className="market-brand-icon">
            <Image alt="Droproom icon" height={56} src={brandIconPrimary} width={56} />
          </span>
          <span>Droproom</span>
        </div>
        <p>A place to make, discover and collect limited NFT drops on Base.</p>
        <a className="footer-social-link" href={droproomXUrl} rel="noreferrer" target="_blank">
          Follow {droproomXHandle}
        </a>
      </div>
      <nav aria-label="Footer">
        <a href="/terms">Terms</a>
        <a href="/privacy">Privacy</a>
        <a href="/support">Support</a>
      </nav>
    </footer>
  );
}

function ArtworkMedia({ alt, src }: { alt: string; src: string }) {
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img aria-hidden="true" alt="" className="artwork-backdrop" src={src} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={alt} className="artwork-main" src={src} />
    </>
  );
}

function getDropRemaining(drop: Drop) {
  return Math.max(drop.edition - drop.minted, 0);
}

function getDropProgress(drop: Drop) {
  return Math.min(Math.max((drop.minted / Math.max(drop.edition, 1)) * 100, 0), 100);
}

function formatDropPrice(drop: Drop) {
  return drop.isFree || drop.price === 0 ? "Free" : `${drop.price} ETH`;
}

function WalletProviderIcon({ option }: { option: WalletProviderOption }) {
  if (option.icon) {
    return (
      <span className="wallet-option-icon">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" src={option.icon} />
      </span>
    );
  }

  return (
    <span className={`wallet-option-icon ${option.kind}`} aria-hidden="true">
      {option.kind === "base" || option.kind === "coinbase" ? "B" : option.kind === "metamask" ? "M" : "W"}
    </span>
  );
}

function DropCard({ drop, isSelected, onClick }: { drop: Drop; isSelected: boolean; onClick: () => void }) {
  const soldOut = drop.minted >= drop.edition;
  const progress = Math.min((drop.minted / drop.edition) * 100, 100);

  return (
    <button className={[isSelected ? "drop-card selected" : "drop-card", soldOut ? "is-sold-out" : ""].filter(Boolean).join(" ")} onClick={onClick} type="button">
      <div className="drop-image-wrap">
        <ArtworkMedia alt={drop.title} src={drop.image} />
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
        <ArtworkMedia alt={drop.title} src={drop.image} />
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
        <button className="primary-button wide" disabled={drop.status !== "live" || soldOut || isOwned || isMinting} onClick={onMint} type="button">
          {soldOut ? "Sold out" : drop.status !== "live" ? "Collecting paused" : isOwned ? "Collected" : isMinting ? "Collecting…" : isWalletConnected ? "Collect on Base" : "Connect to collect"} <span>↗</span>
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
                <strong>Pass it on</strong>
                <p>Share this collection with someone who would love it.</p>
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
          <h1>Something only<br /><span className="studio-accent">you would make.</span></h1>
          <p>Pick a starting point. Make it yours. Drop it on Base.</p>
        </div>
        <div className="start-grid">
          <StartCard icon={<i aria-hidden="true" className="mode-glyph upload-glyph" />} label="Upload artwork" onClick={() => props.onBegin("upload")} text="Bring a PNG, JPG, WEBP, or one-second GIF and turn it into a Base drop." />
          <StartCard icon={<i aria-hidden="true" className="mode-glyph canvas-glyph" />} label="Design a card" onClick={() => props.onBegin("blank")} text="Orbit, Bloom or Signal. Pick a look, add your words, make it yours." />
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
                if (mode === "blank") props.onUpdateDraft((current) => ({ ...current, image: createBlankArtwork(current.overlayText || current.title, current.background, current.frame) }));
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
                    <ArtworkMedia alt="AI variation" src={image} />
                    <span>Use this</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <label className="field">
          <span>Title</span>
          <input maxLength={64} placeholder="Give your drop a name" onChange={(event) => props.onUpdateDraft((current) => ({ ...current, title: event.target.value, image: props.startMode === "blank" ? createBlankArtwork(current.overlayText || event.target.value, current.background, current.frame) : current.image }))} value={props.draft.title} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea maxLength={1000} placeholder="What makes this drop yours?" onChange={(event) => props.onUpdateDraft((current) => ({ ...current, description: event.target.value }))} value={props.draft.description} />
        </label>
        {props.startMode === "blank" ? (
          <>
            <div className="card-templates" role="group" aria-label="Card design">
              {CARD_TEMPLATES.map((template) => <button className={props.draft.frame === template.id ? "template-choice active" : "template-choice"} key={template.id} type="button" aria-pressed={props.draft.frame === template.id} onClick={() => props.onUpdateDraft((current) => ({ ...current, frame: template.id, background: template.color, image: createBlankArtwork(current.overlayText || current.title, template.color, template.id) }))}><span className="template-art"><ArtworkMedia alt={`${template.label} card design`} src={createBlankArtwork(template.label, template.color, template.id)} /></span><strong>{template.label}</strong></button>)}
            </div>
            <label className="field">
              <span>Background color</span>
              <input
                onChange={(event) =>
                  props.onUpdateDraft((current) => ({
                    ...current,
                    background: event.target.value,
                    image: createBlankArtwork(current.overlayText || current.title, event.target.value, current.frame)
                  }))
                }
                type="color"
                value={props.draft.background}
              />
            </label>
            <label className="field">
              <span>Card label</span>
              <input
                maxLength={18}
                onChange={(event) => props.onUpdateDraft((current) => ({ ...current, overlayText: event.target.value, image: createBlankArtwork(event.target.value || current.title, current.background, current.frame) }))}
                placeholder="Optional text on the artwork"
                value={props.draft.overlayText}
              />
            </label>
          </>
        ) : null}
        <div className="edition-presets" role="group" aria-label="Choose edition size">
          {[1, 10, 25, 99].map((size) => <button type="button" key={size} className={props.draft.edition === size ? "chip active" : "chip"} aria-pressed={props.draft.edition === size} onClick={() => props.onUpdateDraft((current) => ({ ...current, edition: size }))}>{size === 1 ? "1 of 1" : `${size} editions`}</button>)}
        </div>
        <div className="field-row">
          <label className="field">
            <span>Edition</span>
            <input
              max={EDITION_MAX}
              min={1}
              onChange={(event) => props.onUpdateDraft((current) => ({ ...current, edition: Math.min(Math.max(Math.round(safeNumber(event.target.value, 10)), 1), EDITION_MAX) }))}
              type="number"
              value={props.draft.edition}
            />
            <small>Start small. This drop must sell out before you can publish another. Maximum {EDITION_MAX}.</small>
          </label>
          <label className="field">
            <span>Price</span>
            <input
              disabled={props.draft.isFree}
              min={0}
              onChange={(event) => props.onUpdateDraft((current) => ({ ...current, price: safeNumber(event.target.value, 0) }))}
              step="0.0001"
              type="number"
              value={props.draft.price}
            />
            <small>Free drops usually reach more collectors.</small>
          </label>
        </div>
        <button className={props.draft.isFree ? "toggle active" : "toggle"} onClick={() => props.onUpdateDraft((current) => ({ ...current, isFree: !current.isFree, price: current.isFree ? 0.01 : 0 }))} type="button">
          {props.draft.isFree ? "Free mint" : `Paid mint (${PLATFORM_FEE_PERCENT}% fee)`}
        </button>
        <button className="primary-button wide" disabled={!props.hasArtwork || props.draft.title.trim().length < 3 || props.draft.description.trim().length < 10} onClick={() => props.onStep("review")} type="button">
          Review drop <span>→</span>
        </button>
        <CreatorPolicyNotice compact />
        {!props.hasArtwork ? <p className="microcopy">Add artwork, choose a blank canvas, or select an AI variation before review.</p> : null}
        {props.hasArtwork && (props.draft.title.trim().length < 3 || props.draft.description.trim().length < 10) ? <p className="microcopy">Add a title (3+ characters) and a short description (10+ characters) to continue.</p> : null}
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
          <ArtworkMedia alt={draft.title} src={draft.image} />
        ) : (
          <div className="preview-empty">Awaiting artwork</div>
        )}
      </div>
      <div className="preview-copy">
        <p className="eyebrow">Drop preview</p>
        <h2>{draft.title}</h2>
        <p>{draft.description}</p>
        <div className="stat-row">
            <span>{draft.isFree ? "Free" : `${draft.price} ETH`}</span>
            <span>{draft.edition} editions</span>
            <span>On Base</span>
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
            <span>Network fee</span>
            <strong>Shown by your wallet before confirmation</strong>
          </li>
        </ul>
        <CreatorPolicyNotice compact />
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

function CreatorPolicyNotice({ compact = false }: { compact?: boolean }) {
  return (
    <div className={compact ? "creator-policy-notice compact" : "creator-policy-notice"}>
      <strong>One unfinished drop per wallet</strong>
      <span>
        Your current drop must sell out before you publish another. You can always prepare your next draft.
      </span>
    </div>
  );
}

function Dashboard({
  allDrops,
  drops,
  eligibilityReason,
  eligibilityStatus,
  isAdmin,
  onBaseNotificationAdmin,
  onDropModerationAdmin,
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
  onDropModerationAdmin: DropModerationAdminRequester;
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
                  <ArtworkMedia alt={drop.title} src={drop.image} />
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
      {isAdmin ? (
        <>
          <DropModerationAdminPanel initialDrops={allDrops} onRequest={onDropModerationAdmin} />
          <BaseNotificationAdminPanel drops={allDrops} onRequest={onBaseNotificationAdmin} />
        </>
      ) : null}
    </section>
  );
}

function DropModerationAdminPanel({
  initialDrops,
  onRequest
}: {
  initialDrops: Drop[];
  onRequest: DropModerationAdminRequester;
}) {
  const [adminDrops, setAdminDrops] = useState<Drop[]>(initialDrops);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState<"list" | string | null>(null);

  useEffect(() => {
    setAdminDrops(initialDrops);
  }, [initialDrops]);

  async function run(action: "list" | "hide" | "show", tokenId?: string) {
    try {
      setLoading(action === "list" ? "list" : `${action}:${tokenId}`);
      setStatus(action === "list" ? "Loading indexed drops..." : `${action === "hide" ? "Hiding" : "Restoring"} token #${tokenId}...`);
      const result = await onRequest({ action, tokenId });

      if (result.drops) {
        setAdminDrops(result.drops);
      } else if (result.drop) {
        setAdminDrops((current) => [result.drop as Drop, ...current.filter((drop) => drop.id !== result.drop?.id)]);
      }

      setStatus(
        action === "list"
          ? `Loaded ${result.drops?.length ?? 0} indexed drops.`
          : `Token #${tokenId} ${action === "hide" ? "hidden from public surfaces" : "restored to public surfaces"}.`
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Drop moderation action failed.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <section className="admin-notification-panel admin-content-panel">
      <div className="admin-panel-head">
        <div>
          <p className="eyebrow">Admin content</p>
          <h2>Control public drop visibility.</h2>
          <p>Hide test or duplicate drops from the homepage, Explore, Collections, and library discovery without touching the onchain token.</p>
        </div>
        <button className="secondary-button" disabled={loading !== null} onClick={() => void run("list")} type="button">
          {loading === "list" ? "Loading..." : "Refresh"}
        </button>
      </div>
      <div className="admin-drop-list">
        {adminDrops.length ? (
          adminDrops.map((drop) => {
            const hidden = isAdminHiddenDrop(drop);
            const tokenId = drop.tokenId ?? drop.id;

            return (
              <div className={hidden ? "admin-drop-row is-hidden" : "admin-drop-row"} key={drop.id}>
                <span className="admin-drop-art">
                  <ArtworkMedia alt={drop.title} src={drop.image} />
                </span>
                <div>
                  <strong>{drop.title}</strong>
                  <span>
                    #{tokenId} · {drop.minted}/{drop.edition} minted · {hidden ? "Hidden" : drop.status}
                  </span>
                </div>
                <button
                  className={hidden ? "secondary-button" : "danger-button"}
                  disabled={loading !== null}
                  onClick={() => void run(hidden ? "show" : "hide", tokenId)}
                  type="button"
                >
                  {loading === `hide:${tokenId}` || loading === `show:${tokenId}`
                    ? "Saving..."
                    : hidden
                      ? "Show"
                      : "Hide"}
                </button>
              </div>
            );
          })
        ) : (
          <div className="empty-state">No indexed drops found yet.</div>
        )}
      </div>
      {status ? <p className="microcopy admin-status">{status}</p> : null}
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
  const [broadcastPreviewOpen, setBroadcastPreviewOpen] = useState(false);
  const trimmedTitle = title.trim();
  const trimmedMessage = message.trim();
  const trimmedTargetPath = targetPath.trim();
  const normalizedTargetPath = trimmedTargetPath ? (trimmedTargetPath.startsWith("/") ? trimmedTargetPath : `/${trimmedTargetPath}`) : "/";
  const titleInvalid = trimmedTitle.length === 0 || trimmedTitle.length > 30;
  const messageInvalid = trimmedMessage.length === 0 || trimmedMessage.length > 200;
  const targetPathInvalid = normalizedTargetPath.length > 500;
  const notificationInvalid = titleInvalid || messageInvalid || targetPathInvalid;
  const liveDrops = drops.filter((drop) => drop.tokenId);

  function selectTargetDrop(dropId: string) {
    const selected = liveDrops.find((drop) => drop.id === dropId);
    if (!selected) return;

    setTitle(`${selected.title}`.slice(0, 30));
    setMessage(`A limited Droproom edition is live on Base: ${selected.title}`.slice(0, 200));
    setTargetPath(getDropPath(selected));
    setBroadcastPreviewOpen(false);
  }

  function requestBroadcastPreview() {
    if (notificationInvalid) {
      setBroadcastPreviewOpen(false);
      setStatus("Broadcast is blocked until the title, message, and target path meet the limits below.");
      return;
    }

    setBroadcastPreviewOpen(true);
    setStatus("Broadcast has not been sent. Review the summary, then confirm to sign and send.");
  }

  async function run(action: "audience" | "send" | "test") {
    if (action !== "audience" && notificationInvalid) {
      setStatus("Notification is blocked until the title, message, and target path meet the limits below.");
      return;
    }

    try {
      setLoading(action);
      setStatus(
        action === "audience"
          ? "Checking current Base App notification audience..."
          : action === "test"
            ? "Wallet signature required to send a test notification to your admin wallet."
            : "Wallet signature required to broadcast this notification."
      );
      const result = await onRequest({
        action,
        message: trimmedMessage,
        targetPath: normalizedTargetPath,
        title: trimmedTitle
      });

      if (typeof result.notificationEnabledCount === "number") {
        setAudienceCount(result.notificationEnabledCount);
      }

      if (action === "audience") {
        setStatus(`Audience check complete: ${result.notificationEnabledCount ?? 0} saved Base App users currently have notifications enabled.`);
      } else if (action === "test") {
        setStatus(`Test send complete: sent ${result.sentCount ?? 0} of ${result.targetedCount ?? 0} to the admin wallet. Failed: ${result.failedCount ?? 0}.`);
      } else {
        setBroadcastPreviewOpen(false);
        setStatus(`Broadcast complete: sent ${result.sentCount ?? 0} of ${result.targetedCount ?? 0} enabled audience wallets. Failed: ${result.failedCount ?? 0}.`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Base notification request failed before completion.");
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
          <input
            maxLength={30}
            onChange={(event) => {
              setTitle(event.target.value);
              setBroadcastPreviewOpen(false);
            }}
            value={title}
          />
          <small>{trimmedTitle.length}/30{titleInvalid ? " - enter 1-30 characters" : ""}</small>
        </label>
      </div>
      <div className="field-row">
        <label className="field">
          <span>Target path</span>
          <input
            maxLength={500}
            onChange={(event) => {
              setTargetPath(event.target.value);
              setBroadcastPreviewOpen(false);
            }}
            placeholder="/drop/1-droproom-genesis"
            value={targetPath}
          />
          <small>{normalizedTargetPath.length}/500{targetPathInvalid ? " - target path is too long" : ""}</small>
        </label>
      </div>
      <label className="field">
        <span>Message</span>
        <textarea
          maxLength={200}
          onChange={(event) => {
            setMessage(event.target.value);
            setBroadcastPreviewOpen(false);
          }}
          value={message}
        />
        <small>{trimmedMessage.length}/200{messageInvalid ? " - enter 1-200 characters" : ""}</small>
      </label>
      {broadcastPreviewOpen ? (
        <div className="admin-notification-preview" role="status">
          <div>
            <p className="eyebrow">Broadcast preview</p>
            <h3>Confirm Base App broadcast</h3>
          </div>
          <dl className="admin-notification-summary">
            <div>
              <dt>Target</dt>
              <dd>{normalizedTargetPath}</dd>
            </div>
            <div>
              <dt>Title</dt>
              <dd>{trimmedTitle}</dd>
            </div>
            <div>
              <dt>Message</dt>
              <dd>{trimmedMessage}</dd>
            </div>
            <div>
              <dt>Audience</dt>
              <dd>{audienceCount === null ? "Not checked in this session" : `Last checked: ${audienceCount} enabled`}</dd>
            </div>
          </dl>
          <div className="admin-actions">
            <button className="secondary-button" disabled={loading !== null} onClick={() => setBroadcastPreviewOpen(false)} type="button">
              Edit
            </button>
            <button className="primary-button" disabled={loading !== null || notificationInvalid} onClick={() => void run("send")} type="button">
              {loading === "send" ? "Sending broadcast..." : "Confirm broadcast"}
            </button>
          </div>
        </div>
      ) : null}
      <div className="admin-actions">
        <button className="secondary-button" disabled={loading !== null} onClick={() => void run("audience")} type="button">
          {loading === "audience" ? "Checking..." : "Check audience"}
        </button>
        <button className="secondary-button" disabled={loading !== null || notificationInvalid} onClick={() => void run("test")} type="button">
          {loading === "test" ? "Sending test..." : "Send test to me"}
        </button>
        <button
          className="primary-button"
          disabled={loading !== null || notificationInvalid}
          onClick={requestBroadcastPreview}
          type="button"
        >
          Review broadcast
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


