import { readDrop } from "@/lib/contract";
import { isAdminHiddenDropStatus } from "@/lib/drop-visibility";
import { getDropPath, getDropTokenIdFromSlug } from "@/lib/drop-links";
import { isHiddenDropId } from "@/lib/hidden-drops";
import { ipfsUriToGatewayUrl } from "@/lib/ipfs";
import { supabaseRest } from "@/lib/server/supabase-rest";
import type { Drop } from "@/lib/types";

export type DropPreview = Pick<
  Drop,
  "creator" | "creatorAddress" | "description" | "edition" | "id" | "image" | "minted" | "status" | "title" | "tokenId"
> & {
  path: string;
};

type DropRow = {
  creator_address: string;
  creator_label: string | null;
  description: string;
  edition: number;
  image_url: string;
  metadata_uri: string;
  minted: number;
  price_eth: number;
  price_wei: string;
  status: Drop["status"];
  title: string;
  token_id: string;
};

type NftMetadata = {
  description?: unknown;
  image?: unknown;
  name?: unknown;
};

export function getTokenIdFromDropSlug(slug?: string | null) {
  const tokenId = getDropTokenIdFromSlug(slug);
  if (!tokenId || isHiddenDropId(tokenId)) return null;
  return tokenId;
}

export async function fetchPublicDropPreviewFromSlug(slug?: string | null) {
  const tokenId = getTokenIdFromDropSlug(slug);
  if (!tokenId) return null;

  return fetchPublicDropPreview(tokenId);
}

export async function fetchPublicDropPreview(tokenId: string): Promise<DropPreview | null> {
  if (isHiddenDropId(tokenId)) return null;

  const indexed = await fetchIndexedDropPreview(tokenId);
  if (indexed.drop || !indexed.shouldFallback) return indexed.drop;

  return fetchChainFallbackDropPreview(tokenId);
}

async function fetchIndexedDropPreview(tokenId: string): Promise<{ drop: DropPreview | null; shouldFallback: boolean }> {
  try {
    const rows = await supabaseRest<DropRow[]>(
      `drops?select=token_id,title,description,image_url,creator_address,creator_label,edition,minted,status,metadata_uri,price_eth,price_wei&token_id=eq.${encodeURIComponent(tokenId)}&limit=1`
    );
    const row = rows[0];
    if (!row) return { drop: null, shouldFallback: true };
    if (isAdminHiddenDropStatus(row.status)) return { drop: null, shouldFallback: false };

    return {
      drop: toDropPreview({
        creator: row.creator_label || shortAddress(row.creator_address),
        creatorAddress: row.creator_address,
        description: row.description,
        edition: row.edition,
        id: row.token_id,
        image: row.image_url,
        minted: row.minted,
        status: row.status,
        title: row.title,
        tokenId: row.token_id
      }),
      shouldFallback: false
    };
  } catch {
    return { drop: null, shouldFallback: true };
  }
}

async function fetchChainFallbackDropPreview(tokenId: string): Promise<DropPreview | null> {
  try {
    const onchain = await readDrop(tokenId);
    if (!onchain.metadataURI) return null;

    const metadata = await fetchMetadata(onchain.metadataURI);
    const imageUri = typeof metadata.image === "string" ? metadata.image : "";
    const minted = Number(onchain.minted);

    return toDropPreview({
      creator: shortAddress(onchain.creator),
      creatorAddress: onchain.creator,
      description: typeof metadata.description === "string" ? metadata.description : "",
      edition: onchain.maxSupply,
      id: tokenId,
      image: imageUri ? ipfsUriToGatewayUrl(imageUri) : "",
      minted,
      status: onchain.soldOut || minted >= onchain.maxSupply ? "sold-out" : "live",
      title: typeof metadata.name === "string" ? metadata.name : `Drop #${tokenId}`,
      tokenId
    });
  } catch {
    return null;
  }
}

function toDropPreview(drop: Omit<DropPreview, "path">) {
  return {
    ...drop,
    path: getDropPath(drop)
  };
}

async function fetchMetadata(metadataUri: string): Promise<NftMetadata> {
  const response = await fetch(ipfsUriToGatewayUrl(metadataUri), { cache: "no-store" });

  if (!response.ok) {
    throw new Error("NFT metadata could not be loaded from IPFS.");
  }

  const metadata = (await response.json()) as NftMetadata;

  if (!metadata || typeof metadata !== "object") {
    throw new Error("NFT metadata is invalid.");
  }

  return metadata;
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
