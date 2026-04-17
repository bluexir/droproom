import { createPublicClient, fallback, http } from "viem";

import { droproomDropsAbi } from "@/lib/abi/droproomDrops";
import { DROPROOM_CONTRACT_ADDRESS } from "@/lib/contract/config";
import { BASE_PUBLIC_RPC_URLS, DROPROOM_CHAIN } from "@/lib/wallet/base";

export const droproomContract = {
  address: DROPROOM_CONTRACT_ADDRESS,
  abi: droproomDropsAbi
} as const;

export function createDroproomPublicClient(rpcUrls: string | string[] = BASE_PUBLIC_RPC_URLS) {
  const urls = Array.isArray(rpcUrls) ? rpcUrls : [rpcUrls];

  return createPublicClient({
    chain: DROPROOM_CHAIN,
    transport: fallback(urls.map((url) => http(url)))
  });
}

let cachedPublicClient: ReturnType<typeof createDroproomPublicClient> | null = null;

export function getDroproomPublicClient() {
  cachedPublicClient ??= createDroproomPublicClient();
  return cachedPublicClient;
}

export type DroproomPublicClient = ReturnType<typeof createDroproomPublicClient>;
