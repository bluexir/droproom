import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";
import { parseEther } from "viem";

describe("DroproomDrops", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [owner, creator, collector, platform] = await viem.getWalletClients();

  async function deployFixture() {
    const contract = await viem.deployContract("DroproomDrops", [platform.account.address, "ipfs://droproom-contract"]);

    const creatorContract = await viem.getContractAt("DroproomDrops", contract.address, {
      client: { public: publicClient, wallet: creator }
    });
    const collectorContract = await viem.getContractAt("DroproomDrops", contract.address, {
      client: { public: publicClient, wallet: collector }
    });
    const ownerContract = await viem.getContractAt("DroproomDrops", contract.address, {
      client: { public: publicClient, wallet: owner }
    });

    return { collectorContract, contract, creatorContract, ownerContract };
  }

  it("creates a limited drop with immutable metadata after mint", async function () {
    const { collectorContract, contract, creatorContract } = await deployFixture();

    const createHash = await creatorContract.write.createDrop(["ipfs://drop-1", 25, 0n, 500n]);
    await publicClient.waitForTransactionReceipt({ hash: createHash });

    const drop = await contract.read.drops([1n]);
    assert.equal(drop[0].toLowerCase(), creator.account.address.toLowerCase());
    assert.equal(drop[1], 25);
    assert.equal(drop[2], 0n);
    assert.equal(drop[3], true);
    assert.equal(await contract.read.uri([1n]), "ipfs://drop-1");
    assert.equal(await contract.read.remainingSupply([1n]), 25n);

    const mintHash = await collectorContract.write.mint([1n, 1n]);
    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    await assert.rejects(creatorContract.write.updateDropMetadata([1n, "ipfs://changed"]));
  });

  it("mints paid editions and splits the primary sale platform fee", async function () {
    const { collectorContract, contract, creatorContract } = await deployFixture();
    const price = parseEther("0.1");

    const createHash = await creatorContract.write.createDrop(["ipfs://paid-drop", 3, price, 500n]);
    await publicClient.waitForTransactionReceipt({ hash: createHash });

    const creatorBefore = await publicClient.getBalance({ address: creator.account.address });
    const platformBefore = await publicClient.getBalance({ address: platform.account.address });

    const mintHash = await collectorContract.write.mint([1n, 2n], { value: price * 2n });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    const creatorAfter = await publicClient.getBalance({ address: creator.account.address });
    const platformAfter = await publicClient.getBalance({ address: platform.account.address });

    assert.equal(await contract.read.totalSupply([1n]), 2n);
    assert.equal(platformAfter - platformBefore, (price * 2n) / 10n);
    assert.equal(creatorAfter - creatorBefore, price * 2n - (price * 2n) / 10n);
  });

  it("blocks invalid supply, wrong payment, oversupply, inactive drops, and paused minting", async function () {
    const { collectorContract, creatorContract, ownerContract } = await deployFixture();
    const price = parseEther("0.01");

    await assert.rejects(creatorContract.write.createDrop(["ipfs://too-large", 1000, 0n, 0n]));

    const createHash = await creatorContract.write.createDrop(["ipfs://limited", 2, price, 0n]);
    await publicClient.waitForTransactionReceipt({ hash: createHash });

    await assert.rejects(collectorContract.write.mint([1n, 1n]));
    await assert.rejects(collectorContract.write.mint([1n, 3n], { value: price * 3n }));

    const mintHash = await collectorContract.write.mint([1n, 2n], { value: price * 2n });
    await publicClient.waitForTransactionReceipt({ hash: mintHash });
    await assert.rejects(collectorContract.write.mint([1n, 1n], { value: price }));

    const inactiveCreateHash = await creatorContract.write.createDrop(["ipfs://inactive", 2, 0n, 0n]);
    await publicClient.waitForTransactionReceipt({ hash: inactiveCreateHash });
    const inactiveHash = await creatorContract.write.setDropActive([2n, false]);
    await publicClient.waitForTransactionReceipt({ hash: inactiveHash });
    await assert.rejects(collectorContract.write.mint([2n, 1n]));

    const pauseHash = await ownerContract.write.pause();
    await publicClient.waitForTransactionReceipt({ hash: pauseHash });
    await assert.rejects(creatorContract.write.createDrop(["ipfs://paused", 1, 0n, 0n]));
  });
});
