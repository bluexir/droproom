import {
  parseEventLogs,
  type Address,
  type Hash,
  type TransactionReceipt,
  type WalletClient
} from "viem";

import { droproomDropsAbi } from "@/lib/abi/droproomDrops";
import { createDroproomPublicClient, droproomContract, getDroproomPublicClient, type DroproomPublicClient } from "@/lib/contract/client";
import { DROPROOM_MAX_EDITION_SUPPLY, DROPROOM_MAX_ROYALTY_BPS } from "@/lib/contract/config";
import { getBasescanTxUrl } from "@/lib/contract/links";
import { DROPROOM_CHAIN } from "@/lib/wallet/base";
import { assertWalletClientOnBaseMainnet } from "@/lib/wallet/provider";
import { assertCreatorCanPublish } from "@/lib/contract/creator-gate";

export type DroproomDrop = {
  tokenId: bigint;
  creator: Address;
  maxSupply: number;
  price: bigint;
  active: boolean;
  metadataURI: string;
  minted: bigint;
  remaining: bigint;
  soldOut: boolean;
};

export type DroproomContractSummary = {
  contractURI: string;
  maxEditionSupply: number;
  maxRoyaltyBps: number;
  nextTokenId: bigint;
  paused: boolean;
  platformFeeBps: number;
  platformWallet: Address;
};

export type CreateDropInput = {
  metadataURI: string;
  maxSupply: number;
  price: bigint;
  royaltyBps?: number;
};

export type CreateDropParams = CreateDropInput & {
  account?: Address;
  walletClient: WalletClient;
};

export type MintDropInput = {
  tokenId: bigint | number | string;
  quantity?: bigint | number | string;
  value?: bigint;
};

export type MintDropParams = MintDropInput & {
  account?: Address;
  walletClient: WalletClient;
  publicClient?: DroproomPublicClient;
};

export type DropCreatedEvent = {
  creator: Address;
  logIndex: number;
  maxSupply: bigint;
  metadataURI: string;
  price: bigint;
  tokenId: bigint;
  transactionHash: Hash;
};

export type DropMintedEvent = {
  collector: Address;
  logIndex: number;
  paid: bigint;
  platformFee: bigint;
  quantity: bigint;
  tokenId: bigint;
  totalMinted: bigint;
  transactionHash: Hash;
};

export type DroproomReceiptEvents = {
  created: DropCreatedEvent[];
  minted: DropMintedEvent[];
};

export type DroproomTransactionResult = {
  basescanUrl: string;
  events: DroproomReceiptEvents;
  hash: Hash;
  receipt: TransactionReceipt;
};

export async function readDroproomSummary(client = getDroproomPublicClient()): Promise<DroproomContractSummary> {
  const [contractURI, maxEditionSupply, maxRoyaltyBps, nextTokenId, paused, platformFeeBps, platformWallet] =
    await Promise.all([
      client.readContract({ ...droproomContract, functionName: "contractURI" }),
      client.readContract({ ...droproomContract, functionName: "MAX_EDITION_SUPPLY" }),
      client.readContract({ ...droproomContract, functionName: "MAX_ROYALTY_BPS" }),
      client.readContract({ ...droproomContract, functionName: "nextTokenId" }),
      client.readContract({ ...droproomContract, functionName: "paused" }),
      client.readContract({ ...droproomContract, functionName: "PLATFORM_FEE_BPS" }),
      client.readContract({ ...droproomContract, functionName: "platformWallet" })
    ]);

  return {
    contractURI,
    maxEditionSupply: Number(maxEditionSupply),
    maxRoyaltyBps: Number(maxRoyaltyBps),
    nextTokenId,
    paused,
    platformFeeBps: Number(platformFeeBps),
    platformWallet
  };
}

export async function readDrop(tokenId: bigint | number | string, client = getDroproomPublicClient()): Promise<DroproomDrop> {
  const id = toUint256(tokenId, "tokenId");
  const [drop, minted] = await client.multicall({
    allowFailure: false,
    contracts: [
      { ...droproomContract, functionName: "drops", args: [id] },
      { ...droproomContract, functionName: "totalSupply", args: [id] }
    ]
  });
  const [creator, maxSupply, price, active, metadataURI] = drop;
  if (creator === "0x0000000000000000000000000000000000000000") throw new Error("This drop does not exist.");
  const soldOut = minted >= BigInt(maxSupply);
  const remaining = soldOut ? 0n : BigInt(maxSupply) - minted;

  return {
    tokenId: id,
    creator,
    maxSupply: Number(maxSupply),
    price,
    active,
    metadataURI,
    minted,
    remaining,
    soldOut
  };
}

export async function readDropBalance(
  account: Address,
  tokenId: bigint | number | string,
  client = getDroproomPublicClient()
) {
  return client.readContract({
    ...droproomContract,
    functionName: "balanceOf",
    args: [account, toUint256(tokenId, "tokenId")]
  });
}

export async function readDropMetadataURI(tokenId: bigint | number | string, client = getDroproomPublicClient()) {
  return client.readContract({
    ...droproomContract,
    functionName: "uri",
    args: [toUint256(tokenId, "tokenId")]
  });
}

export async function createDrop({ account, maxSupply, metadataURI, price, royaltyBps = 0, walletClient }: CreateDropParams) {
  await assertWalletClientOnBaseMainnet(walletClient);
  const sender = resolveWalletAccount(walletClient, account);
  const normalized = normalizeCreateDropInput({ maxSupply, metadataURI, price, royaltyBps });
  await assertCreatorCanPublish(sender);

  return walletClient.writeContract({
    ...droproomContract,
    account: sender,
    args: [normalized.metadataURI, normalized.maxSupply, normalized.price, BigInt(normalized.royaltyBps)],
    chain: DROPROOM_CHAIN,
    functionName: "createDrop"
  });
}

export async function mintDrop({
  account,
  publicClient = getDroproomPublicClient(),
  quantity = 1n,
  tokenId,
  value,
  walletClient
}: MintDropParams) {
  await assertWalletClientOnBaseMainnet(walletClient);
  const sender = resolveWalletAccount(walletClient, account);
  const id = toUint256(tokenId, "tokenId");
  const normalizedQuantity = toUint256(quantity, "quantity");
  const mintValue = value ?? (await getMintValue({ client: publicClient, quantity: normalizedQuantity, tokenId: id }));

  return walletClient.writeContract({
    ...droproomContract,
    account: sender,
    args: [id, normalizedQuantity],
    chain: DROPROOM_CHAIN,
    functionName: "mint",
    value: mintValue
  });
}

export async function getMintValue({
  client = getDroproomPublicClient(),
  quantity = 1n,
  tokenId
}: {
  client?: DroproomPublicClient;
  quantity?: bigint | number | string;
  tokenId: bigint | number | string;
}) {
  const drop = await readDrop(tokenId, client);
  const requestedQuantity = toUint256(quantity, "quantity");
  if (!drop.active) throw new Error("Minting for this drop is paused.");
  if (requestedQuantity === 0n || requestedQuantity > drop.remaining) throw new Error("Not enough editions remain for this mint.");
  return drop.price * requestedQuantity;
}

export async function waitForDroproomTransaction(
  hash: Hash,
  client: DroproomPublicClient = getDroproomPublicClient()
): Promise<DroproomTransactionResult> {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Transaction reverted. No drop or mint was completed.");

  return {
    basescanUrl: getBasescanTxUrl(hash),
    events: parseDroproomReceipt(receipt),
    hash,
    receipt
  };
}

export function parseDroproomReceipt(receipt: TransactionReceipt): DroproomReceiptEvents {
  const logs = receipt.logs.filter((log) => log.address.toLowerCase() === droproomContract.address.toLowerCase());
  const created = parseEventLogs({
    abi: droproomDropsAbi,
    eventName: "DropCreated",
    logs,
    strict: false
  }).flatMap((log) => {
    const { creator, maxSupply, metadataURI, price, tokenId } = log.args;
    if (!creator || maxSupply === undefined || !metadataURI || price === undefined || tokenId === undefined) return [];

    return [
      {
        creator,
        logIndex: log.logIndex,
        maxSupply,
        metadataURI,
        price,
        tokenId,
        transactionHash: log.transactionHash
      }
    ];
  });
  const minted = parseEventLogs({
    abi: droproomDropsAbi,
    eventName: "DropMinted",
    logs,
    strict: false
  }).flatMap((log) => {
    const { collector, paid, platformFee, quantity, tokenId, totalMinted } = log.args;
    if (!collector || paid === undefined || platformFee === undefined || quantity === undefined || tokenId === undefined || totalMinted === undefined) return [];

    return [
      {
        collector,
        logIndex: log.logIndex,
        paid,
        platformFee,
        quantity,
        tokenId,
        totalMinted,
        transactionHash: log.transactionHash
      }
    ];
  });

  return { created, minted };
}

export function createBasePublicClient(rpcUrl?: string) {
  return createDroproomPublicClient(rpcUrl);
}

function normalizeCreateDropInput({ maxSupply, metadataURI, price, royaltyBps = 0 }: CreateDropInput): Required<CreateDropInput> {
  const trimmedURI = metadataURI.trim();

  if (!trimmedURI) {
    throw new Error("metadataURI is required.");
  }

  if (!Number.isInteger(maxSupply) || maxSupply < 1 || maxSupply > DROPROOM_MAX_EDITION_SUPPLY) {
    throw new Error(`maxSupply must be between 1 and ${DROPROOM_MAX_EDITION_SUPPLY}.`);
  }

  if (price < 0n) {
    throw new Error("price cannot be negative.");
  }

  if (!Number.isInteger(royaltyBps) || royaltyBps < 0 || royaltyBps > DROPROOM_MAX_ROYALTY_BPS) {
    throw new Error(`royaltyBps must be between 0 and ${DROPROOM_MAX_ROYALTY_BPS}.`);
  }

  return {
    maxSupply,
    metadataURI: trimmedURI,
    price,
    royaltyBps
  };
}

function resolveWalletAccount(walletClient: WalletClient, account?: Address) {
  const address = account ?? walletClient.account?.address;

  if (!address) {
    throw new Error("Wallet account is required before sending a transaction.");
  }

  return address;
}

function toUint256(value: bigint | number | string, label: string) {
  const normalized = typeof value === "bigint" ? value : BigInt(value);

  if (normalized < 0n) {
    throw new Error(`${label} cannot be negative.`);
  }

  return normalized;
}
