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

export type Eip6963ProviderInfo = {
  icon?: string;
  name?: string;
  rdns?: string;
  uuid?: string;
};

export type WalletProviderKind = "base" | "coinbase" | "metamask" | "injected";

export type WalletProviderOption = {
  icon: string | null;
  id: string;
  isPreferred: boolean;
  kind: WalletProviderKind;
  name: string;
  provider: Eip1193Provider;
  rdns: string | null;
};

type Eip6963ProviderDetail = {
  info?: Eip6963ProviderInfo;
  provider?: Eip1193Provider;
};

type WalletProviderCandidate = WalletProviderOption & {
  priority: number;
  sourceIndex: number;
};

const announcedProviders = new Map<string, Eip6963ProviderDetail>();
const fallbackProviderIds = new WeakMap<Eip1193Provider, string>();
let hasRequestedProviderAnnouncements = false;
let nextFallbackProviderId = 1;

export class WalletProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WalletProviderError";
  }
}

export function getInjectedWalletProvider() {
  return getWalletProviderOptions()[0]?.provider ?? null;
}

export function getInjectedWalletProviders() {
  return getWalletProviderOptions().map((option) => option.provider);
}

export function getWalletProviderOptions(): WalletProviderOption[] {
  if (typeof window === "undefined") return [];

  requestEip6963ProviderAnnouncements();

  const ethereum = (window as Window & { ethereum?: Eip1193Provider }).ethereum;
  const candidates: WalletProviderCandidate[] = [];
  let sourceIndex = 0;

  for (const detail of announcedProviders.values()) {
    if (isEip1193Provider(detail.provider)) {
      candidates.push(createWalletProviderCandidate(detail.provider, detail.info, sourceIndex++));
    }
  }

  if (isEip1193Provider(ethereum)) {
    for (const provider of [
      ethereum.selectedProvider,
      ...(Array.isArray(ethereum.providers) ? ethereum.providers : []),
      ethereum
    ]) {
      if (isEip1193Provider(provider)) {
        candidates.push(createWalletProviderCandidate(provider, undefined, sourceIndex++));
      }
    }
  }

  return sortWalletProviderOptions(dedupeWalletProviderOptions(candidates));
}

export async function getConnectedWalletProvider(options: { exclude?: (provider: Eip1193Provider) => boolean } = {}) {
  const candidates = getWalletProviderOptions().filter((option) => !options.exclude?.(option.provider));

  for (const option of candidates) {
    const accounts = await getConnectedWalletAccounts(option.provider).catch(() => []);
    if (accounts.length) return option.provider;
  }

  return null;
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

export async function requestWalletAccountSwitch(provider = requireInjectedWalletProvider(), currentAccount?: Address | null) {
  const previousAccount =
    currentAccount ??
    (await getConnectedWalletAccounts(provider)
      .then((accounts) => accounts[0] ?? null)
      .catch(() => null));
  const permissions = await provider
    .request({
      method: "wallet_requestPermissions",
      params: [{ eth_accounts: {} }]
    })
    .catch(() => null);

  const permittedAccount = getAccountsFromPermissions(permissions)[0];
  const requestedAccount = permittedAccount ?? (await requestWalletAccount(provider));
  const nextAccount = await waitForChangedWalletAccount(provider, requestedAccount, previousAccount);

  if (!previousAccount || nextAccount.toLowerCase() !== previousAccount.toLowerCase()) {
    return nextAccount;
  }

  await provider
    .request({
      method: "wallet_revokePermissions",
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

async function waitForChangedWalletAccount(
  provider: Eip1193Provider,
  requestedAccount: Address,
  previousAccount: Address | null
) {
  if (!previousAccount || requestedAccount.toLowerCase() !== previousAccount.toLowerCase()) {
    return requestedAccount;
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 120));
    const accounts = await getConnectedWalletAccounts(provider).catch(() => []);
    const account = accounts[0];

    if (account && account.toLowerCase() !== previousAccount.toLowerCase()) {
      return account;
    }
  }

  return requestedAccount;
}

function getAccountsFromPermissions(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((permission) => {
    if (!permission || typeof permission !== "object") return [];

    const parentCapability = "parentCapability" in permission ? permission.parentCapability : undefined;
    if (parentCapability !== "eth_accounts") return [];

    const caveats = "caveats" in permission ? permission.caveats : undefined;
    if (!Array.isArray(caveats)) return [];

    return caveats.flatMap((caveat) => {
      if (!caveat || typeof caveat !== "object") return [];

      const type = "type" in caveat ? caveat.type : undefined;
      const accounts = "value" in caveat ? caveat.value : undefined;
      if (type !== "restrictReturnedAccounts" || !Array.isArray(accounts)) return [];

      return accounts.flatMap((account) => {
        if (typeof account !== "string") return [];

        try {
          return [getAddress(account)];
        } catch {
          return [];
        }
      });
    });
  });
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

function requestEip6963ProviderAnnouncements() {
  if (typeof window === "undefined") return;

  if (!hasRequestedProviderAnnouncements) {
    hasRequestedProviderAnnouncements = true;

    window.addEventListener("eip6963:announceProvider", ((event: Event) => {
      const detail = (event as CustomEvent<Eip6963ProviderDetail>).detail;
      if (!isEip1193Provider(detail?.provider)) return;

      const key = getNormalizedString(detail.info?.uuid) ?? getFallbackProviderId(detail.provider);
      announcedProviders.set(key, detail);
    }) as EventListener);
  }

  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

function createWalletProviderCandidate(
  provider: Eip1193Provider,
  info: Eip6963ProviderInfo | undefined,
  sourceIndex: number
): WalletProviderCandidate {
  const kind = getWalletProviderKind(provider, info);
  const priority = getWalletProviderPriority(kind);

  return {
    icon: getNormalizedString(info?.icon) ?? null,
    id: getWalletProviderId(provider, info, kind),
    isPreferred: kind === "base" || kind === "coinbase",
    kind,
    name: getWalletProviderName(provider, info, kind),
    priority,
    provider,
    rdns: getNormalizedString(info?.rdns) ?? null,
    sourceIndex
  };
}

function getWalletProviderKind(provider: Eip1193Provider, info: Eip6963ProviderInfo | undefined): WalletProviderKind {
  const name = getNormalizedString(info?.name)?.toLowerCase() ?? "";
  const rdns = getNormalizedString(info?.rdns)?.toLowerCase() ?? "";

  if (provider.isBase || name.includes("base wallet") || name.includes("base account") || isKnownBaseRdns(rdns)) {
    return "base";
  }
  if (provider.isCoinbaseWallet || name.includes("coinbase") || rdns.includes("coinbase")) return "coinbase";
  if ((provider.isMetaMask && !provider.isBraveWallet) || name.includes("metamask") || rdns.includes("metamask")) {
    return "metamask";
  }

  return "injected";
}

function getWalletProviderPriority(kind: WalletProviderKind) {
  if (kind === "base") return 10;
  if (kind === "coinbase") return 20;
  if (kind === "metamask") return 30;
  return 100;
}

function getWalletProviderName(
  provider: Eip1193Provider,
  info: Eip6963ProviderInfo | undefined,
  kind: WalletProviderKind
) {
  const name = getNormalizedString(info?.name);
  if (name) return name;

  if (kind === "base") return "Base Wallet";
  if (kind === "coinbase") return "Coinbase Wallet";
  if (kind === "metamask") return "MetaMask";
  if (provider.isBraveWallet) return "Brave Wallet";
  if (provider.isRabby) return "Rabby Wallet";
  if (provider.isTrust) return "Trust Wallet";
  if (provider.isFrame) return "Frame";

  return "Injected Wallet";
}

function getWalletProviderId(
  provider: Eip1193Provider,
  info: Eip6963ProviderInfo | undefined,
  kind: WalletProviderKind
) {
  const uuid = getNormalizedString(info?.uuid);
  if (uuid) return `eip6963:${uuid}`;

  return `${kind}:${getFallbackProviderId(provider)}`;
}

function getFallbackProviderId(provider: Eip1193Provider) {
  const existingId = fallbackProviderIds.get(provider);
  if (existingId) return existingId;

  const nextId = String(nextFallbackProviderId++);
  fallbackProviderIds.set(provider, nextId);
  return nextId;
}

function dedupeWalletProviderOptions(candidates: WalletProviderCandidate[]) {
  const byProvider = new Map<Eip1193Provider, WalletProviderCandidate>();

  for (const candidate of candidates) {
    const existing = byProvider.get(candidate.provider);
    if (!existing || shouldReplaceWalletProviderCandidate(existing, candidate)) {
      byProvider.set(candidate.provider, candidate);
    }
  }

  return [...byProvider.values()];
}

function shouldReplaceWalletProviderCandidate(existing: WalletProviderCandidate, candidate: WalletProviderCandidate) {
  if (candidate.priority !== existing.priority) return candidate.priority < existing.priority;
  if (getProviderMetadataScore(candidate) !== getProviderMetadataScore(existing)) {
    return getProviderMetadataScore(candidate) > getProviderMetadataScore(existing);
  }

  return candidate.sourceIndex < existing.sourceIndex;
}

function getProviderMetadataScore(option: WalletProviderOption) {
  return Number(Boolean(option.rdns)) + Number(Boolean(option.icon)) + Number(option.name !== "Injected Wallet");
}

function sortWalletProviderOptions(candidates: WalletProviderCandidate[]): WalletProviderOption[] {
  return [...candidates]
    .sort((left, right) => left.priority - right.priority || left.sourceIndex - right.sourceIndex || left.name.localeCompare(right.name))
    .map((candidate) => ({
      icon: candidate.icon,
      id: candidate.id,
      isPreferred: candidate.isPreferred,
      kind: candidate.kind,
      name: candidate.name,
      provider: candidate.provider,
      rdns: candidate.rdns
    }));
}

function getNormalizedString(value: unknown) {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  return trimmed || null;
}

function isEip1193Provider(value: unknown): value is Eip1193Provider {
  return Boolean(value && typeof value === "object" && typeof (value as { request?: unknown }).request === "function");
}

function isKnownBaseRdns(rdns: string) {
  return rdns === "org.base" || rdns === "com.base" || rdns === "com.base.wallet" || rdns.endsWith(".base.org");
}
