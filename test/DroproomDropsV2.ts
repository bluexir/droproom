import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { network } from "hardhat";

describe("DroproomDropsV2 creator gate", async () => {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [owner, creator, collector, otherCreator] = await viem.getWalletClients();

  async function fixture() {
    const deployed = await viem.deployContract("DroproomDropsV2", [owner.account.address, "ipfs://contract"]);
    const forWallet = (wallet: typeof creator) => viem.getContractAt("DroproomDropsV2", deployed.address, { client: { public: publicClient, wallet } });
    return { deployed, creatorContract: await forWallet(creator), collectorContract: await forWallet(collector), otherContract: await forWallet(otherCreator), ownerContract: await forWallet(owner) };
  }

  it("blocks a second creation before and after a partial mint, then permits it once sold out", async () => {
    const { deployed, creatorContract, collectorContract } = await fixture();
    await creatorContract.write.createDrop(["ipfs://one", 2, 0n, 0n]);
    await assert.rejects(creatorContract.write.createDrop(["ipfs://two", 1, 0n, 0n]), /PreviousDropNotSoldOut/);
    await collectorContract.write.mint([1n, 1n]);
    await assert.rejects(creatorContract.write.createDrop(["ipfs://two", 1, 0n, 0n]), /PreviousDropNotSoldOut/);
    assert.equal(await deployed.read.nextTokenId(), 2n);
    await collectorContract.write.mint([1n, 1n]);
    await creatorContract.write.createDrop(["ipfs://two", 1, 0n, 0n]);
    assert.equal(await deployed.read.latestDropOf([creator.account.address]), 2n);
    assert.equal(await deployed.read.balanceOf([collector.account.address, 1n]), 2n);
    await assert.rejects(creatorContract.write.createDrop(["ipfs://three", 1, 0n, 0n]), /PreviousDropNotSoldOut/);
  });

  it("keeps creator wallets independent and does not exempt the owner", async () => {
    const { creatorContract, otherContract, ownerContract } = await fixture();
    await creatorContract.write.createDrop(["ipfs://creator", 10, 0n, 0n]);
    await otherContract.write.createDrop(["ipfs://other", 10, 0n, 0n]);
    await ownerContract.write.createDrop(["ipfs://owner", 10, 0n, 0n]);
    await assert.rejects(ownerContract.write.createDrop(["ipfs://owner-two", 1, 0n, 0n]), /PreviousDropNotSoldOut/);
  });

  it("does not let deactivation bypass the supply rule", async () => {
    const { creatorContract, ownerContract } = await fixture();
    await creatorContract.write.createDrop(["ipfs://one", 10, 0n, 0n]);
    await creatorContract.write.setDropActive([1n, false]);
    await assert.rejects(creatorContract.write.createDrop(["ipfs://two", 1, 0n, 0n]), /PreviousDropNotSoldOut/);
    await ownerContract.write.setDropActive([1n, true]);
    await assert.rejects(creatorContract.write.createDrop(["ipfs://two", 1, 0n, 0n]), /PreviousDropNotSoldOut/);
  });

  it("invalid creation does not consume the creator slot", async () => {
    const { deployed, creatorContract } = await fixture();
    await assert.rejects(creatorContract.write.createDrop(["ipfs://invalid", 0, 0n, 0n]));
    assert.equal(await deployed.read.latestDropOf([creator.account.address]), 0n);
    await creatorContract.write.createDrop(["ipfs://valid", 1, 0n, 0n]);
    assert.equal(await deployed.read.latestDropOf([creator.account.address]), 1n);
  });
});
