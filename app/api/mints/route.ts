import { NextResponse } from "next/server";

import { getBasescanTxUrl } from "@/lib/contract/links";
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

export async function GET(request: Request) {
  const wallet = new URL(request.url).searchParams.get("wallet")?.trim().toLowerCase();

  if (!wallet) {
    return NextResponse.json({ mints: [] });
  }

  try {
    const rows = await supabaseRest<MintRow[]>(
      `mints?select=*&collector_address=eq.${encodeURIComponent(wallet)}&order=created_at.desc&limit=100`
    );

    return NextResponse.json({ mints: rows });
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
