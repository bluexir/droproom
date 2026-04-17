import {
  decodeEventLog,
  formatEther,
  getAddress,
  isAddressEqual,
  type Address,
  type Hex
} from "viem";

import { droproomDropsAbi } from "@/lib/abi/droproomDrops";
import { getDroproomPublicClient } from "@/lib/contract/client";
import { DROPROOM_CONTRACT_ADDRESS } from "@/lib/contract/config";

export type VerifiedDropCreated = {
  creator: Address;
  maxSupply: number;
  metadataURI: string;
  priceEth: number;
  priceWei: string;
  tokenId: string;
  txHash: Hex;
};

export type VerifiedDropMinted = {
  collector: Address;
  paidWei: string;
  quantity: number;
  tokenId: string;
  totalMinted: number;
  txHash: Hex;
};

function toTxHash(value: unknown): Hex {
  if (typeof value !== "string" || !/^0x[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("Invalid transaction hash.");
  }

  return value as Hex;
}

async function getSuccessfulReceipt(txHashInput: unknown) {
  const txHash = toTxHash(txHashInput);
  const receipt = await getDroproomPublicClient().getTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    throw new Error("Transaction was not successful.");
  }

  return { receipt, txHash };
}

export async function verifyDropCreatedTx(txHashInput: unknown): Promise<VerifiedDropCreated> {
  const { receipt, txHash } = await getSuccessfulReceipt(txHashInput);

  for (const log of receipt.logs) {
    if (!isAddressEqual(log.address, DROPROOM_CONTRACT_ADDRESS)) continue;

    try {
      const decoded = decodeEventLog({
        abi: droproomDropsAbi,
        data: log.data,
        topics: log.topics
      });

      if (decoded.eventName !== "DropCreated") continue;
      const args = decoded.args;

      return {
        creator: getAddress(args.creator),
        maxSupply: Number(args.maxSupply),
        metadataURI: args.metadataURI,
        priceEth: Number(formatEther(args.price)),
        priceWei: args.price.toString(),
        tokenId: args.tokenId.toString(),
        txHash
      };
    } catch {
      // Ignore logs from inherited standards; we only accept the Droproom event.
    }
  }

  throw new Error("DropCreated event was not found in the transaction.");
}

export async function verifyDropMintedTx(txHashInput: unknown): Promise<VerifiedDropMinted> {
  const { receipt, txHash } = await getSuccessfulReceipt(txHashInput);

  for (const log of receipt.logs) {
    if (!isAddressEqual(log.address, DROPROOM_CONTRACT_ADDRESS)) continue;

    try {
      const decoded = decodeEventLog({
        abi: droproomDropsAbi,
        data: log.data,
        topics: log.topics
      });

      if (decoded.eventName !== "DropMinted") continue;
      const args = decoded.args;

      return {
        collector: getAddress(args.collector),
        paidWei: args.paid.toString(),
        quantity: Number(args.quantity),
        tokenId: args.tokenId.toString(),
        totalMinted: Number(args.totalMinted),
        txHash
      };
    } catch {
      // Ignore logs from inherited standards; we only accept the Droproom event.
    }
  }

  throw new Error("DropMinted event was not found in the transaction.");
}
