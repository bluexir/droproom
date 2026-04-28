import { NextResponse } from "next/server";

import { readDrop } from "@/lib/contract";
import { ADMIN_HIDDEN_DROP_STATUS, isAdminHiddenDropStatus } from "@/lib/drop-visibility";
import { AdminAuthError, verifyDroproomAdminRequest, type AdminAuthPayload } from "@/lib/server/admin-auth";
import { supabaseRest } from "@/lib/server/supabase-rest";
import type { Drop } from "@/lib/types";

export const runtime = "nodejs";

const ADMIN_ACTION = "drop-content";

type DropAdminRequest = {
  action?: "list" | "hide" | "show";
  auth?: AdminAuthPayload;
  tokenId?: unknown;
};

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

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as DropAdminRequest | null;
  const action = body?.action;

  if (action !== "list" && action !== "hide" && action !== "show") {
    return NextResponse.json({ error: "Unsupported drop admin action." }, { status: 400 });
  }

  try {
    await verifyDroproomAdminRequest(request, body?.auth, ADMIN_ACTION);

    if (action === "list") {
      const rows = await fetchAdminDropRows();
      return NextResponse.json({ drops: rows.map(toDrop) });
    }

    const tokenId = normalizeTokenId(body?.tokenId);
    const rows = action === "hide" ? await setDropHidden(tokenId) : await setDropVisible(tokenId);
    const row = rows[0];

    if (!row) {
      return NextResponse.json({ error: "Drop was not found in the live index." }, { status: 404 });
    }

    return NextResponse.json({ drop: toDrop(row), drops: (await fetchAdminDropRows()).map(toDrop) });
  } catch (error) {
    if (error instanceof AdminAuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("Drop admin route failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Drop admin request failed." }, { status: 500 });
  }
}

async function fetchAdminDropRows() {
  return supabaseRest<DropRow[]>("drops?select=*&order=created_at.desc&limit=100");
}

async function setDropHidden(tokenId: string) {
  return supabaseRest<DropRow[]>(`drops?token_id=eq.${encodeURIComponent(tokenId)}`, {
    method: "PATCH",
    body: { status: ADMIN_HIDDEN_DROP_STATUS },
    headers: { "Content-Type": "application/json" },
    prefer: "return=representation"
  });
}

async function setDropVisible(tokenId: string) {
  const onchain = await readDrop(tokenId);
  const minted = Number(onchain.minted);
  const status = onchain.soldOut || minted >= onchain.maxSupply ? "sold-out" : "live";

  return supabaseRest<DropRow[]>(`drops?token_id=eq.${encodeURIComponent(tokenId)}`, {
    method: "PATCH",
    body: { minted, status },
    headers: { "Content-Type": "application/json" },
    prefer: "return=representation"
  });
}

function normalizeTokenId(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number" && typeof value !== "bigint") {
    throw new Error("Token id is required.");
  }

  const tokenId = String(value).trim();
  if (!/^\d+$/.test(tokenId) || BigInt(tokenId) < 1n) {
    throw new Error("Token id must be a positive number.");
  }

  return tokenId;
}

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
    status: isAdminHiddenDropStatus(row.status) ? ADMIN_HIDDEN_DROP_STATUS : row.status,
    title: row.title,
    tokenId: row.token_id,
    txHash: row.tx_hash
  };
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}
