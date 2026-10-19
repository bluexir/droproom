import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Address } from "viem";
import { assertCreatorCanPublish, readCreatorGate } from "../lib/contract/creator-gate";
import type { DroproomPublicClient } from "../lib/contract/client";

const creator = "0x1111111111111111111111111111111111111111" as Address;
const other = "0x2222222222222222222222222222222222222222" as Address;

function fakeClient(count: number, owned: Map<number, { supply: number; minted: number; active?: boolean }>) {
  const blocks: bigint[] = [];
  const client = {
    getBlockNumber: async () => 100n,
    readContract: async ({ functionName, args, blockNumber }: { functionName: string; args?: [bigint]; blockNumber: bigint }) => {
      blocks.push(blockNumber);
      return functionName === "nextTokenId" ? BigInt(count + 1) : BigInt(owned.get(Number(args?.[0]))?.minted ?? 0);
    },
    multicall: async ({ contracts, blockNumber }: { contracts: { args: [bigint] }[]; blockNumber: bigint }) => {
      blocks.push(blockNumber);
      return contracts.map(({ args }) => {
        const drop = owned.get(Number(args[0]));
        return [drop ? creator : other, drop?.supply ?? 10, 0n, drop?.active ?? true, "ipfs://test"];
      });
    }
  } as unknown as DroproomPublicClient;
  return { client, blocks };
}

describe("publish preflight", () => {
  it("finds an unfinished drop outside the public feed and beyond the first batch", async () => {
    const { client, blocks } = fakeClient(85, new Map([[72, { supply: 10, minted: 3, active: false }]]));
    assert.deepEqual(await readCreatorGate(creator, client), { blockingTokenId: "72", edition: 10, minted: 3 });
    assert.ok(blocks.every((block) => block === 100n));
    await assert.rejects(assertCreatorCanPublish(creator, client), /Drop #72 still has 7 editions left/);
  });
  it("permits a wallet after all of its previous drops sell out", async () => {
    const { client } = fakeClient(85, new Map([[2, { supply: 10, minted: 10 }], [72, { supply: 25, minted: 25 }]]));
    assert.equal((await assertCreatorCanPublish(creator, client)).blockingTokenId, null);
  });
  it("permits the first drop on an empty contract", async () => {
    const { client } = fakeClient(0, new Map());
    assert.equal((await assertCreatorCanPublish(creator, client)).blockingTokenId, null);
  });
  it("fails closed when the RPC cannot be read", async () => {
    const { client } = fakeClient(1, new Map());
    client.getBlockNumber = async () => { throw new Error("offline"); };
    await assert.rejects(assertCreatorCanPublish(creator, client), /Could not check your existing drops/);
  });
});
