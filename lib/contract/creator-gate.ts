import type { Address } from "viem";

import { droproomContract, getDroproomPublicClient, type DroproomPublicClient } from "@/lib/contract/client";

export type CreatorGate = {
  blockingTokenId: string | null;
  minted: number;
  edition: number;
};

/** Read all token IDs, including hidden and unindexed drops. Never trust the public feed as a gate. */
export async function readCreatorGate(
  creator: Address,
  client: DroproomPublicClient = getDroproomPublicClient()
): Promise<CreatorGate> {
  const blockNumber = await client.getBlockNumber();
  const nextTokenId = await client.readContract({ ...droproomContract, functionName: "nextTokenId", blockNumber });

  for (let start = 1n; start < nextTokenId; start += 40n) {
    const count = Number(nextTokenId - start < 40n ? nextTokenId - start : 40n);
    const ids = Array.from({ length: count }, (_, index) => start + BigInt(index));
    const drops = await client.multicall({
      allowFailure: false,
      blockNumber,
      contracts: ids.map((id) => ({ ...droproomContract, functionName: "drops" as const, args: [id] as const }))
    });
    for (const [index, drop] of drops.entries()) {
      if (drop[0].toLowerCase() !== creator.toLowerCase()) continue;
      const minted = await client.readContract({
        ...droproomContract, functionName: "totalSupply", args: [ids[index]], blockNumber
      });
      // An inactive/hidden drop still has unsold supply. Hiding it must not bypass the rule.
      if (minted < BigInt(drop[1])) {
        return { blockingTokenId: ids[index].toString(), minted: Number(minted), edition: Number(drop[1]) };
      }
    }
  }
  return { blockingTokenId: null, minted: 0, edition: 0 };
}

export async function assertCreatorCanPublish(creator: Address, client = getDroproomPublicClient()) {
  let gate: CreatorGate;
  try {
    gate = await readCreatorGate(creator, client);
  } catch {
    throw new Error("Could not check your existing drops on Base. Please retry before publishing.");
  }
  if (gate.blockingTokenId) {
    throw new Error(`Drop #${gate.blockingTokenId} still has ${gate.edition - gate.minted} editions left. It must sell out before you publish another drop.`);
  }
  return gate;
}
