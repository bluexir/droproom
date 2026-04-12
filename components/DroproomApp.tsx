"use client";

import Image from "next/image";
import { useEffect, useState, type ReactNode } from "react";

import {
  ACCEPTED_IMAGE_TYPES,
  AI_DAILY_JOB_LIMIT,
  EDITION_MAX,
  PLATFORM_FEE_PERCENT,
  STYLE_CHIPS,
  TOKEN_UNLOCK_MIN_EDITION,
  type StyleChipId
} from "@/lib/constants";
import { getCreatorTokenEligibility } from "@/lib/eligibility";
import type { Drop, StartMode, StudioDraft } from "@/lib/types";

type View = "explore" | "create" | "dashboard" | "library";
type CreateStep = "start" | "studio" | "review";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const storageKey = "droproom:drops:v1";
const libraryKey = "droproom:library:v1";
const walletKey = "droproom:wallet:v1";
const brandIconPrimary = "/brand/droproom-premium-hero.png";
const brandIconSecondary = "/brand/droproom-premium-hero1.png";
const fallbackArtwork = brandIconPrimary;

const starterDrops: Drop[] = [
  {
    id: "genesis-pass",
    title: "Genesis Support Pass",
    description: "A limited supporter drop for the first collectors entering Droproom.",
    image: brandIconPrimary,
    creator: "Droproom Studio",
    price: 0,
    isFree: true,
    edition: 99,
    minted: 61,
    status: "live",
    createdAt: new Date().toISOString(),
    collectors: [],
    previewOnly: true,
    featured: true
  },
  {
    id: "blue-room",
    title: "Blue Room Study",
    description: "A clean cyan edition card for creator-led drops on Base.",
    image: brandIconSecondary,
    creator: "bluexir",
    price: 1,
    isFree: false,
    edition: 120,
    minted: 120,
    status: "sold-out",
    createdAt: new Date(Date.now() - 86400000).toISOString(),
    collectors: [],
    previewOnly: true,
    featured: true
  },
  {
    id: "soft-launch",
    title: "Soft Launch Collectible",
    description: "A quiet launch card for people who like early internet objects.",
    image: brandIconPrimary,
    creator: "Droproom",
    price: 0.5,
    isFree: false,
    edition: 250,
    minted: 88,
    status: "live",
    createdAt: new Date(Date.now() - 172800000).toISOString(),
    collectors: [],
    previewOnly: true,
    featured: false
  }
];

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
    <rect width="1200" height="1200" rx="96" fill="${background}"/>
    <circle cx="600" cy="600" r="418" fill="url(#g)" opacity=".76"/>
    <path d="M600 244L872 401V715L600 872L328 715V401L600 244Z" stroke="white" stroke-width="26" opacity=".9"/>
    <path d="M600 328L712 520H488L600 328Z" fill="white" opacity=".95"/>
    <path d="M412 724L600 834L788 724" stroke="white" stroke-width="34" stroke-linecap="round" opacity=".9"/>
    <text x="600" y="1010" text-anchor="middle" fill="white" font-family="Arial, sans-serif" font-size="56" font-weight="700" letter-spacing="10">${title.slice(0, 18)}</text>
    <defs>
      <radialGradient id="g" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(748 318) rotate(117) scale(782)">
        <stop stop-color="#26F0E4"/>
        <stop offset=".55" stop-color="#1575FF"/>
        <stop offset="1" stop-color="#07111F"/>
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

function safeStorageSet(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Large uploaded/generated images can exceed localStorage quota. Keep the live
    // in-memory preview working and avoid breaking the app during testing.
    window.localStorage.removeItem(key);
  }
}

function prepareDropsForStorage(drops: Drop[]) {
  return drops.map((drop) => ({
    ...drop,
    image: drop.image.startsWith("data:") ? fallbackArtwork : drop.image,
    previewImage: undefined
  }));
}

function migrateBrandImage(drop: Drop) {
  if (!drop.image.startsWith("/brand/logo-")) return drop;

  return {
    ...drop,
    image: drop.id === "blue-room" ? brandIconSecondary : brandIconPrimary
  };
}

function parseDrops(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Drop[];
    if (!Array.isArray(parsed)) return null;
    return parsed.map(migrateBrandImage);
  } catch {
    window.localStorage.removeItem(storageKey);
    return null;
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
  const [view, setView] = useState<View>("explore");
  const [createStep, setCreateStep] = useState<CreateStep>("start");
  const [startMode, setStartMode] = useState<StartMode>("upload");
  const [draft, setDraft] = useState<StudioDraft>({
    ...defaultDraft,
    image: createBlankArtwork("DROPROOM")
  });
  const [drops, setDrops] = useState<Drop[]>(starterDrops);
  const [libraryByWallet, setLibraryByWallet] = useState<Record<string, string[]>>({});
  const [selectedDropId, setSelectedDropId] = useState<string | null>(starterDrops[0]?.id ?? null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [styleChip, setStyleChip] = useState<StyleChipId>("premium");
  const [aiImages, setAiImages] = useState<string[]>([]);
  const [aiJobsUsed, setAiJobsUsed] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [walletLoading, setWalletLoading] = useState(false);
  const [publishPending, setPublishPending] = useState(false);
  const [mintPending, setMintPending] = useState(false);
  const hasCustomArtwork = Boolean(draft.image && !draft.image.includes("DROPROOM"));

  useEffect(() => {
    const savedDrops = parseDrops(window.localStorage.getItem(storageKey));
    const savedLibrary = parseLibrary(window.localStorage.getItem(libraryKey));
    const savedWallet = window.localStorage.getItem(walletKey);

    if (savedDrops) setDrops(savedDrops);
    setLibraryByWallet(savedLibrary);
    if (savedWallet) setWalletAddress(savedWallet);
  }, []);

  useEffect(() => {
    safeStorageSet(storageKey, prepareDropsForStorage(drops));
  }, [drops]);

  useEffect(() => {
    safeStorageSet(libraryKey, libraryByWallet);
  }, [libraryByWallet]);

  const selectedDrop = drops.find((drop) => drop.id === selectedDropId) ?? drops[0];
  const activeLibrary = walletAddress ? libraryByWallet[walletAddress.toLowerCase()] ?? [] : [];
  const creatorDrops = drops.filter((drop) => drop.creatorAddress === walletAddress || drop.creator === "You");
  const soldOutCount = creatorDrops.filter((drop) => drop.status === "sold-out" && drop.edition >= TOKEN_UNLOCK_MIN_EDITION).length;
  const tokenEligibility = getCreatorTokenEligibility(drops, walletAddress);

  async function connectWallet() {
    if (!window.ethereum) {
      setNotice("No wallet provider found. Open Droproom inside Base App or a wallet-enabled browser.");
      return;
    }

    try {
      setWalletLoading(true);
      const accounts = (await window.ethereum.request({ method: "eth_requestAccounts" })) as string[];
      const nextWallet = accounts[0] ?? "";
      setWalletAddress(nextWallet);
      if (nextWallet) window.localStorage.setItem(walletKey, nextWallet);
    } catch {
      setNotice("Wallet connection was not completed.");
    } finally {
      setWalletLoading(false);
    }
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
      image: mode === "blank" ? createBlankArtwork("BLANK CANVAS") : createBlankArtwork("DROPROOM")
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
      setNotice("Only PNG, JPG, and WEBP files are supported in V1.");
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
      const payload = (await response.json()) as { images?: string[]; error?: string; mock?: boolean };

      if (!response.ok || !payload.images?.length) throw new Error(payload.error ?? "AI generation failed.");

      setAiImages(payload.images);
      setAiJobsUsed((current) => current + 1);
      setNotice(payload.mock ? "AI mock mode is active until OPENAI_API_KEY is configured." : "AI generated 4 variations.");
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

  function publishDrop() {
    if (publishPending) return;
    setPublishPending(true);
    const edition = Math.min(Math.max(Math.round(draft.edition), 1), EDITION_MAX);
    const price = draft.isFree ? 0 : Math.max(draft.price, 0);
    const drop: Drop = {
      id: `${Date.now()}-${draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 36)}`,
      title: draft.title.trim() || "Untitled Drop",
      description: draft.description.trim() || "A limited edition NFT drop created on Droproom.",
      image: draft.image || createBlankArtwork(draft.title),
      creator: walletAddress ? shortAddress(walletAddress) : "You",
      creatorAddress: walletAddress,
      price,
      isFree: price === 0,
      edition,
      minted: 0,
      status: "live",
      createdAt: new Date().toISOString(),
      collectors: [],
      previewImage: draft.image.startsWith("data:") ? draft.image : undefined,
      previewOnly: true
    };

    setDrops((current) => [drop, ...current]);
    setSelectedDropId(drop.id);
    setCreateStep("start");
    setDraft({ ...defaultDraft, image: createBlankArtwork("DROPROOM") });
    setAiPrompt("");
    setAiImages([]);
    setPublishPending(false);
    setView("explore");
    setNotice("Preview drop published. Full onchain minting will be connected in the next production layer.");
  }

  function mintSelectedDrop() {
    if (!selectedDrop) return;
    if (!walletAddress) {
      void connectWallet();
      return;
    }
    if (mintPending || selectedDrop.minted >= selectedDrop.edition || activeLibrary.includes(selectedDrop.id)) return;
    setMintPending(true);

    setDrops((current) =>
      current.map((drop) => {
        if (drop.id !== selectedDrop.id) return drop;
        const minted = Math.min(drop.minted + 1, drop.edition);
        const collectors = drop.collectors.includes(walletAddress) ? drop.collectors : [...drop.collectors, walletAddress];
        return {
          ...drop,
          minted,
          status: minted >= drop.edition ? "sold-out" : drop.status,
          collectors
        };
      })
    );
    setLibraryByWallet((current) => {
      const key = walletAddress.toLowerCase();
      const existing = current[key] ?? [];
      return {
        ...current,
        [key]: [selectedDrop.id, ...existing.filter((id) => id !== selectedDrop.id)]
      };
    });
    setMintPending(false);
    setNotice("Preview mint complete. Full onchain minting will be connected in the next production layer.");
  }

  return (
    <main className="app-shell">
      <BackgroundGlow />
      <header className="topbar">
        <button className="brand-lockup" onClick={() => setView("explore")} type="button">
          <Image alt="Droproom icon" height={56} priority src={brandIconPrimary} width={56} />
          <span>DROPROOM</span>
        </button>
        <nav className="nav-pills" aria-label="Primary navigation">
          {(["explore", "create", "dashboard", "library"] as const).map((item) => (
            <button
              className={view === item ? "nav-pill active" : "nav-pill"}
              key={item}
              onClick={() => {
                setView(item);
                if (item === "create") setCreateStep("start");
              }}
              type="button"
            >
              {item}
            </button>
          ))}
        </nav>
        <button className="wallet-button" disabled={walletLoading} onClick={walletAddress ? () => setWalletAddress("") : connectWallet} type="button">
          <span>{walletLoading ? "..." : "Base"}</span>
          {walletAddress ? shortAddress(walletAddress) : "Connect"}
        </button>
      </header>

      {notice ? <div className="notice enter">{notice}</div> : null}

      {view === "explore" ? (
        <section className="screen enter">
          <Hero onCreate={() => setView("create")} />
          <section className="content-grid">
            <div className="drop-grid">
              {drops.map((drop) => (
                <DropCard drop={drop} isSelected={drop.id === selectedDrop?.id} key={drop.id} onClick={() => setSelectedDropId(drop.id)} />
              ))}
            </div>
            {selectedDrop ? <DropDetail drop={selectedDrop} isMinting={mintPending} isOwned={activeLibrary.includes(selectedDrop.id)} onMint={mintSelectedDrop} /> : null}
          </section>
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
            onSelectAi={selectAiImage}
            onStartMode={setStartMode}
            onStep={setCreateStep}
            onStyle={setStyleChip}
            onUpdateDraft={setDraft}
            onUpload={handleUpload}
            hasCustomArtwork={hasCustomArtwork}
            startMode={startMode}
            step={createStep}
            styleChip={styleChip}
          />
        </section>
      ) : null}

      {view === "dashboard" ? (
        <section className="screen dashboard enter">
          <Dashboard drops={creatorDrops} eligibilityReason={tokenEligibility.reason} eligibilityStatus={tokenEligibility.status} soldOutCount={soldOutCount} />
        </section>
      ) : null}

      {view === "library" ? (
        <section className="screen library-screen enter">
          <LibraryView drops={drops.filter((drop) => activeLibrary.includes(drop.id))} />
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
    <section className="hero">
      <div className="hero-copy">
        <p className="eyebrow">Creator-first NFT drops on Base</p>
        <h1>Create limited drops. Get collected.</h1>
        <p>
          Upload artwork, start from a blank canvas, or generate with AI. Publish image-only drops with free or paid minting,
          then track collectors, sold-out status, and future creator unlocks.
        </p>
        <div className="hero-actions">
          <button className="primary-button" onClick={onCreate} type="button">
            Create NFT <span>-&gt;</span>
          </button>
          <span className="microcopy">Free mints stay free. Paid mints include a {PLATFORM_FEE_PERCENT}% platform fee.</span>
        </div>
      </div>
      <div className="hero-art hero-art-compare">
        <div className="hero-variant-grid" aria-label="Droproom app icon options">
          <article className="hero-variant">
            <Image alt="Droproom app icon option A" className="hero-variant-image" height={720} priority src={brandIconPrimary} width={720} />
            <span>Icon A</span>
          </article>
          <article className="hero-variant">
            <Image alt="Droproom app icon option B" className="hero-variant-image" height={720} priority src={brandIconSecondary} width={720} />
            <span>Icon B</span>
          </article>
        </div>
        <div className="floating-stat top">AI assisted</div>
        <div className="floating-stat bottom">Sold-out unlocks</div>
      </div>
    </section>
  );
}

function DropCard({ drop, isSelected, onClick }: { drop: Drop; isSelected: boolean; onClick: () => void }) {
  const soldOut = drop.minted >= drop.edition;

  return (
    <button className={isSelected ? "drop-card selected" : "drop-card"} onClick={onClick} type="button">
      <div className="drop-image-wrap">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={drop.title} src={drop.image} />
        {soldOut ? <span className="sold-out">Sold out</span> : <span className="live-dot">Live</span>}
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
      </div>
    </button>
  );
}

function DropDetail({ drop, isMinting, isOwned, onMint }: { drop: Drop; isMinting: boolean; isOwned: boolean; onMint: () => void }) {
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
          {soldOut ? "Sold out" : isOwned ? "Collected" : isMinting ? "Minting..." : "Mint preview"} <span>OK</span>
        </button>
        <p className="microcopy">
          V1 preview uses local state. Free drops have no platform fee; real onchain mints may still require network gas unless sponsorship is added.
        </p>
      </div>
    </aside>
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
  hasCustomArtwork: boolean;
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
          <p>Keep it simple: image-only, limited editions, free or paid minting, and a clean review before publish.</p>
        </div>
        <div className="start-grid">
          <StartCard icon="UP" label="Upload artwork" onClick={() => props.onBegin("upload")} text="Bring your finished PNG, JPG, or WEBP and turn it into a drop." />
          <StartCard icon="BL" label="Start from blank" onClick={() => props.onBegin("blank")} text="Build a simple card with background, frame, title, and preview." />
          <StartCard icon="AI" label="Generate with AI" onClick={() => props.onBegin("ai")} text="Prompt + style chips, 4 image variations, 10 AI jobs per day." />
        </div>
      </section>
    );
  }

  if (props.step === "review") {
    return <ReviewStep draft={props.draft} onBack={() => props.onStep("studio")} onPublish={props.onPublish} />;
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
            <small>PNG, JPG, WEBP only</small>
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
              {props.aiLoading ? "Generating..." : "* Generate 4 variations"}
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
        <button className="primary-button wide" disabled={!props.hasCustomArtwork} onClick={() => props.onStep("review")} type="button">
          Review drop <span>→</span>
        </button>
        {!props.hasCustomArtwork ? <p className="microcopy">Add artwork, choose a blank canvas, or select an AI variation before review.</p> : null}
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
      <strong>-&gt;</strong>
    </button>
  );
}

function LivePreview({ draft }: { draft: StudioDraft }) {
  return (
    <div className="live-preview-card">
      <div className={`preview-art ${draft.frame}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={draft.title} src={draft.image || createBlankArtwork(draft.title)} />
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

function ReviewStep({ draft, onBack, onPublish }: { draft: StudioDraft; onBack: () => void; onPublish: () => void }) {
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
          <button className="secondary-button" onClick={onBack} type="button">
            Back to studio
          </button>
          <button className="primary-button" onClick={onPublish} type="button">
            Publish preview <span>-&gt;</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function Dashboard({
  drops,
  eligibilityReason,
  eligibilityStatus,
  soldOutCount
}: {
  drops: Drop[];
  eligibilityReason: string;
  eligibilityStatus: "locked" | "review-ready";
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
        <span>*</span>
        <span>Sold-out qualifying drops</span>
        <strong>{soldOutCount}</strong>
      </div>
      <div className="metric-card">
        <span>&lt;&gt;</span>
        <span>Future unlock status</span>
        <strong>{canUnlockToken ? "Review ready" : "Locked"}</strong>
      </div>
      <div className="dashboard-list">
        {drops.length ? (
          drops.map((drop) => (
            <div className="dashboard-row" key={drop.id}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt={drop.title} src={drop.image} />
              <div>
                <strong>{drop.title}</strong>
                <span>
                  {drop.minted}/{drop.edition} minted
                </span>
              </div>
              <span>{drop.status}</span>
            </div>
          ))
        ) : (
          <div className="empty-state">Create your first drop to see dashboard metrics.</div>
        )}
      </div>
    </section>
  );
}

function LibraryView({ drops }: { drops: Drop[] }) {
  return (
    <section className="library-view">
      <p className="eyebrow">Collector library</p>
      <h1>Your collected editions live here.</h1>
      {drops.length ? (
        <div className="drop-grid compact">
          {drops.map((drop) => (
            <DropCard drop={drop} isSelected={false} key={drop.id} onClick={() => null} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span>&lt;&gt;</span>
          Mint a preview edition from Explore to populate your collection.
        </div>
      )}
    </section>
  );
}


