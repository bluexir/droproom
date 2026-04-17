import { NextResponse } from "next/server";

import { getBasescanTxUrl } from "@/lib/contract/links";
import { ipfsUriToGatewayUrl } from "@/lib/ipfs";
import { verifyDropCreatedTx } from "@/lib/server/chain-events";
import { supabaseRest } from "@/lib/server/supabase-rest";
import type { Drop } from "@/lib/types";

export const runtime = "nodejs";

type DropRow = {
  basescan_url: string | null;
  created_at: string;
  creator_address: string;
  creator_label: string | null;
  description: string;
  edition: number;
  id: string;
  image_url: string;
  image_ipfs_uri: string | null;
  media_type: string | null;
  metadata_uri: string;
  minted: number;
  price_eth: number;
  price_wei: string;
  status: Drop["status"];
  title: string;
  token_id: string;
  tx_hash: string;
};

type NftMetadata = {
  attributes?: Array<{ trait_type?: unknown; value?: unknown }>;
  description?: unknown;
  image?: unknown;
  name?: unknown;
};

function toDrop(row: DropRow): Drop {
  return {
    basescanUrl: row.basescan_url ?? undefined,
    collectors: [],
    createdAt: row.created_at,
    creator: row.creator_label || shortAddress(row.creator_address),
    creatorAddress: row.creator_address,
    description: row.description,
    edition: row.edition,
    id: row.token_id,
    image: row.image_url,
    imageIpfsUri: row.image_ipfs_uri ?? undefined,
    isFree: Number(row.price_eth) === 0,
    mediaType: row.media_type ?? undefined,
    metadataUri: row.metadata_uri,
    minted: row.minted,
    price: Number(row.price_eth),
    priceWei: row.price_wei,
    status: row.status,
    title: row.title,
    tokenId: row.token_id,
    txHash: row.tx_hash
  };
}

export async function GET() {
  try {
    const rows = await supabaseRest<DropRow[]>(
      "drops?select=*&order=created_at.desc&limit=60"
    );

    return NextResponse.json({ drops: rows.map(toDrop) });
  } catch (error) {
    console.error("Drop fetch failed", error);
    return NextResponse.json({ drops: [], error: "Drops are not available yet." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<Drop> | null;

  if (!body?.txHash) {
    return NextResponse.json({ error: "Missing drop transaction hash." }, { status: 400 });
  }

  let verified: Awaited<ReturnType<typeof verifyDropCreatedTx>>;
  let metadata: NftMetadata;

  try {
    verified = await verifyDropCreatedTx(body.txHash);

    if (body.tokenId && body.tokenId !== verified.tokenId) {
      return NextResponse.json({ error: "Drop token does not match the transaction." }, { status: 409 });
    }

    metadata = await fetchMetadata(verified.metadataURI);
  } catch (error) {
    console.error("Drop verification failed", error);
    return NextResponse.json({ error: "Drop transaction could not be verified." }, { status: 400 });
  }

  const imageUri = typeof metadata.image === "string" ? metadata.image : "";
  const mediaType = readMetadataAttribute(metadata, "Media Type") ?? body.mediaType ?? null;
  const row = {
    basescan_url: getBasescanTxUrl(verified.txHash),
    creator_address: verified.creator,
    creator_label: body.creator ?? null,
    description: typeof metadata.description === "string" ? metadata.description : "",
    edition: verified.maxSupply,
    id: verified.tokenId,
    image_url: imageUri ? ipfsUriToGatewayUrl(imageUri) : "",
    image_ipfs_uri: imageUri.startsWith("ipfs://") ? imageUri : null,
    media_type: mediaType,
    metadata_uri: verified.metadataURI,
    minted: 0,
    price_eth: verified.priceEth,
    price_wei: verified.priceWei,
    status: "live" satisfies Drop["status"],
    title: typeof metadata.name === "string" ? metadata.name : "Untitled Drop",
    token_id: verified.tokenId,
    tx_hash: verified.txHash
  };

  try {
    const rows = await supabaseRest<DropRow[]>("drops?on_conflict=token_id", {
      method: "POST",
      body: row,
      headers: { "Content-Type": "application/json" },
      prefer: "resolution=merge-duplicates,return=representation"
    });

    return NextResponse.json({ drop: toDrop(rows[0] ?? (row as DropRow)) });
  } catch (error) {
    console.error("Drop save failed", error);
    return NextResponse.json({ error: "Drop was minted but could not be indexed yet." }, { status: 502 });
  }
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
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

function readMetadataAttribute(metadata: NftMetadata, traitName: string) {
  const attribute = metadata.attributes?.find((item) => item.trait_type === traitName);
  return typeof attribute?.value === "string" ? attribute.value : null;
}
