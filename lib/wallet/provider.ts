import {
  createWalletClient,
  custom,
  getAddress,
  numberToHex,
  type Address,
  type Hex,
  type WalletClient
} from "viem";
import { Attribution } from "ox/erc8021";

import { BASE_EXPLORER_URL, BASE_PUBLIC_RPC_URL, DROPROOM_CHAIN, DROPROOM_CHAIN_ID } from "@/lib/wallet/base";

const BASE_BUILDER_CODE = process.env.NEXT_PUBLIC_BASE_BUILDER_CODE?.trim() || "bc_n0xmhqgc";

export type Eip1193Provider = {
  request: (args: { method: string; params?: readonly unknown[] | Record<string, unknown> }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
  isBase?: boolean;
  isBraveWallet?: boolean;
  isCoinbaseWallet?: boolean;
  isFrame?: boolean;
  isMetaMask?: boolean;
  isRabby?: boolean;
  isTrust?: boolean;
  providers?: Eip1193Provider[];
  selectedProvider?: Eip1193Provider;
};

export class WalletProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletProviderError";
  }
}

export function getInjectedWalletProvider() {
  const candidates = getInjectedWalletProviders();
  return candidates[0] ?? null;
}

export function getInjectedWalletProviders() {
  if (typeof window === "undefined") return [];

  const ethereum = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  if (!ethereum) return [];

  const candidates = dedupeProviders([
    ethereum.selectedProvider,
    ...(Array.isArray(ethereum.providers) ? ethereum.providers : []),
    ethereum
  ].filter((provider): provider is Eip1193Provider => Boolean(provider?.request)));

  return candidates;
}

export async function getConnectedWalletProvider() {
  const candidates = getInjectedWalletProviders();

  for (const provider of candidates) {
    const accounts = await getConnectedWalletAccounts(provider).catch(() => []);
    if (accounts.length) return provider;
  }

  return candidates[0] ?? null;
}

export function requireInjectedWalletProvider(provider = getInjectedWalletProvider()) {
  if (!provider) {
    throw new WalletProviderError("No wallet provider found. Open Droproom in a wallet-enabled browser.");
  }

  return provider;
}

export function parseWalletChainId(chainId: unknown) {
  if (typeof chainId === "number" && Number.isInteger(chainId)) return chainId;

  if (typeof chainId === "bigint") return Number(chainId);

  if (typeof chainId === "string") {
    const trimmed = chainId.trim();
    if (!trimmed) return null;

    const parsed = trimmed.startsWith("0x") ? Number.parseInt(trimmed, 16) : Number.parseInt(trimmed, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

export async function getWalletChainId(provider = requireInjectedWalletProvider()) {
  const chainId = await provider.request({ method: "eth_chainId" });
  const parsed = parseWalletChainId(chainId);

  if (!parsed) {
    throw new WalletProviderError("Wallet returned an invalid chain id.");
  }

  return parsed;
}

export async function getConnectedWalletAccounts(provider = requireInjectedWalletProvider()) {
  const accounts = await provider.request({ method: "eth_accounts" });

  if (!Array.isArray(accounts)) return [];

  return accounts.filter((account): account is string => typeof account === "string").map((account) => getAddress(account));
}

export async function requestWalletAccount(provider = requireInjectedWalletProvider()) {
  const accounts = await provider.request({ method: "eth_requestAccounts" });

  if (!Array.isArray(accounts) || typeof accounts[0] !== "string") {
    throw new WalletProviderError("Wallet connection did not return an account.");
  }

  return getAddress(accounts[0]);
}

export async function requestWalletAccountSwitch(provider = requireInjectedWalletProvider()) {
  await provider
    .request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }]
    })
    .catch(() => null);

  return requestWalletAccount(provider);
}

export async function disconnectWallet(provider = getInjectedWalletProvider()) {
  if (!provider) return;

  await provider
    .request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }]
    })
    .catch(() => null);
}

export async function signWalletMessage(message: string, account?: Address, provider = requireInjectedWalletProvider()) {
  const signer = account ?? (await requestWalletAccount(provider));
  const signature = await provider.request({
    method: "personal_sign",
    params: [message, signer]
  });

  if (typeof signature !== "string") {
    throw new WalletProviderError("Wallet did not return a signature.");
  }

  return asHex(signature);
}

export function assertBaseMainnetChain(chainId: number | null | undefined) {
  if (chainId !== DROPROOM_CHAIN_ID) {
    throw new WalletProviderError(`Wrong network. Switch to Base mainnet (${DROPROOM_CHAIN_ID}).`);
  }

  return chainId;
}

export async function switchWalletToBaseMainnet(provider = requireInjectedWalletProvider()) {
  const chainId = numberToHex(DROPROOM_CHAIN_ID);

  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }]
    });
  } catch (error) {
    if (!isUnknownChainError(error)) throw error;

    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          blockExplorerUrls: [BASE_EXPLORER_URL],
          chainId,
          chainName: DROPROOM_CHAIN.name,
          nativeCurrency: DROPROOM_CHAIN.nativeCurrency,
          rpcUrls: [BASE_PUBLIC_RPC_URL]
        }
      ]
    });

    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId }]
    });
  }

  return getWalletChainId(provider);
}

export async function ensureWalletOnBaseMainnet(provider = requireInjectedWalletProvider()) {
  const chainId = await getWalletChainId(provider);
  if (chainId === DROPROOM_CHAIN_ID) return chainId;

  const nextChainId = await switchWalletToBaseMainnet(provider);
  return assertBaseMainnetChain(nextChainId);
}

export async function assertWalletClientOnBaseMainnet(walletClient: Pick<WalletClient, "getChainId">) {
  const chainId = await walletClient.getChainId();
  return assertBaseMainnetChain(chainId);
}

export function createDroproomWalletClient(provider = requireInjectedWalletProvider(), account?: Address) {
  return createWalletClient({
    account,
    chain: DROPROOM_CHAIN,
    dataSuffix: BASE_BUILDER_CODE ? Attribution.toDataSuffix({ codes: [BASE_BUILDER_CODE] }) : undefined,
    transport: custom(provider)
  });
}

export function asAddress(value: string) {
  return getAddress(value);
}

export function asHex(value: string) {
  if (!value.startsWith("0x")) {
    throw new WalletProviderError("Expected a 0x-prefixed hex value.");
  }

  return value as Hex;
}

function isUnknownChainError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const code = "code" in error ? (error as { code?: unknown }).code : undefined;
  if (code === 4902) return true;
  if (code !== -32603) return false;

  const message = "message" in error ? String((error as { message?: unknown }).message).toLowerCase() : "";
  return message.includes("unknown chain") || message.includes("unrecognized chain") || message.includes("not added");
}

function dedupeProviders(providers: Eip1193Provider[]) {
  return providers.filter((provider, index) => providers.indexOf(provider) === index);
}
