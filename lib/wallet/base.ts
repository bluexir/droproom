import { base } from "viem/chains";

export const DROPROOM_CHAIN = base;
export const DROPROOM_CHAIN_ID = base.id;
export const BASE_PUBLIC_RPC_URL = process.env.NEXT_PUBLIC_BASE_RPC_URL?.trim() || "https://mainnet.base.org";
export const BASE_PUBLIC_RPC_URLS = [
  BASE_PUBLIC_RPC_URL,
  ...(process.env.NEXT_PUBLIC_BASE_RPC_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org"
].filter((url, index, urls) => urls.indexOf(url) === index);
export const BASE_EXPLORER_URL = "https://basescan.org";

export function isBaseMainnetChainId(chainId: number | null | undefined) {
  return chainId === DROPROOM_CHAIN_ID;
}
