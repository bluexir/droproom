import { NextResponse } from "next/server";
import type { Address } from "viem";

import { readDropBalance, readDroproomSummary } from "@/lib/contract";
import { getBasescanTxUrl } from "@/lib/contract/links";
import { isAdminHiddenDropStatus } from "@/lib/drop-visibility";
import { isVisibleDropId } from "@/lib/hidden-drops";
import { verifyDropMintedTx } from "@/lib/server/chain-events";
import { supabaseRest } from "@/lib/server/supabase-rest";

export const runtime = "nodejs";

type MintRow = {
  basescan_url: string | null;
  collector_address: string;
  created_at: string;
  id: string;
  paid_wei: string;
  quantity: number;
  token_id: string;
  tx_hash: string;
};

type DropVisibilityRow = {
  status: string | null;
  token_id: string;
};

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet")?.trim().toLowerCase();

  if (!wallet) {
    return NextResponse.json({ mints: [] });
  }

  try {
    let rows: MintRow[] = [];

    try {
      rows = await supabaseRest<MintRow[]>(
        `mints?select=*&collector_address=eq.${encodeURIComponent(wallet)}&order=created_at.desc&limit=100`
      );
    } catch (error) {
      console.error("Mint index fetch failed", error);
    }

    const adminHiddenTokenIds = await fetchAdminHiddenTokenIds();
    const visibleRows = rows.filter((row) => isPublicTokenId(row.token_id, adminHiddenTokenIds));
    const discoveredRows = await discoverWalletMints(wallet as Address, adminHiddenTokenIds);
    const seenTokenIds = new Set(visibleRows.map((row) => row.token_id));
    const mergedRows = [...visibleRows, ...discoveredRows.filter((row) => !seenTokenIds.has(row.token_id))];

    return NextResponse.json({ mints: mergedRows });
  } catch (error) {
    console.error("Mint fetch failed", error);
    return NextResponse.json({ mints: [], error: "Mints are not available yet." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as Partial<MintRow> | null;

  if (!body?.tx_hash) {
    return NextResponse.json({ error: "Missing mint transaction hash." }, { status: 400 });
  }

  let verified: Awaited<ReturnType<typeof verifyDropMintedTx>>;

  try {
    verified = await verifyDropMintedTx(body.tx_hash);

    if (body.token_id && body.token_id !== verified.tokenId) {
      return NextResponse.json({ error: "Mint token does not match the transaction." }, { status: 409 });
    }
  } catch (error) {
    console.error("Mint verification failed", error);
    return NextResponse.json({ error: "Mint transaction could not be verified." }, { status: 400 });
  }

  const row = {
    basescan_url: getBasescanTxUrl(verified.txHash),
    collector_address: verified.collector.toLowerCase(),
    paid_wei: verified.paidWei,
    quantity: verified.quantity,
    token_id: verified.tokenId,
    tx_hash: verified.txHash
  };

  try {
    const rows = await supabaseRest<MintRow[]>("mints?on_conflict=tx_hash", {
      method: "POST",
      body: row,
      headers: { "Content-Type": "application/json" },
      prefer: "resolution=merge-duplicates,return=representation"
    });

    return NextResponse.json({ mint: rows[0] ?? row });
  } catch (error) {
    console.error("Mint save failed", error);
    return NextResponse.json({ error: "Mint succeeded but could not be indexed yet." }, { status: 502 });
  }
}

async function fetchAdminHiddenTokenIds() {
  try {
    const rows = await supabaseRest<DropVisibilityRow[]>(
      `drops?select=token_id,status&status=eq.review-pending&limit=500`
    );
    return new Set(rows.filter((row) => isAdminHiddenDropStatus(row.status)).map((row) => row.token_id));
  } catch (error) {
    console.error("Hidden drop visibility fetch failed", error);
    return new Set<string>();
  }
}

function isPublicTokenId(tokenId: string, adminHiddenTokenIds: Set<string>) {
  return isVisibleDropId(tokenId) && !adminHiddenTokenIds.has(tokenId);
}

async function discoverWalletMints(wallet: Address, adminHiddenTokenIds: Set<string>): Promise<MintRow[]> {
  try {
    const summary = await readDroproomSummary();
    const latestTokenId = Number(summary.nextTokenId) - 1;
    if (latestTokenId < 1) return [];

    const tokenIds = Array.from({ length: latestTokenId }, (_, index) => String(latestTokenId - index)).filter((tokenId) =>
      isPublicTokenId(tokenId, adminHiddenTokenIds)
    );
    const balances = await Promise.all(
      tokenIds.map(async (tokenId) => {
        try {
          const balance = await readDropBalance(wallet, tokenId);
          return balance > 0n ? tokenId : null;
        } catch {
          return null;
        }
      })
    );

    return balances
      .filter((tokenId): tokenId is string => Boolean(tokenId))
      .map((tokenId) => ({
        basescan_url: null,
        collector_address: wallet,
        created_at: new Date(0).toISOString(),
        id: `chain-${wallet}-${tokenId}`,
        paid_wei: "0",
        quantity: 1,
        token_id: tokenId,
        tx_hash: `chain-${tokenId}`
      }));
  } catch (error) {
    console.error("Onchain mint discovery failed", error);
    return [];
  }
}
