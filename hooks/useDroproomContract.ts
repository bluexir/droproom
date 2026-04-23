"use client";

import { startTransition, useEffect, useRef, useState } from "react";
import type { Address, Hash, TransactionReceipt } from "viem";

import {
  createDrop,
  mintDrop,
  parseDroproomReceipt,
  readDrop,
  readDropBalance,
  waitForDroproomTransaction,
  type CreateDropInput,
  type DroproomDrop,
  type DroproomReceiptEvents,
  type MintDropInput
} from "@/lib/contract";
import { getBasescanTxUrl } from "@/lib/contract/links";
import { DROPROOM_CHAIN_ID, isBaseMainnetChainId } from "@/lib/wallet/base";
import {
  createDroproomWalletClient,
  disconnectWallet,
  ensureWalletOnBaseMainnet,
  getConnectedWalletAccounts,
  getConnectedWalletProvider,
  getInjectedWalletProvider,
  getWalletChainId,
  parseWalletChainId,
  requestWalletAccountSwitch,
  requestWalletAccount,
  signWalletMessage,
  type Eip1193Provider
} from "@/lib/wallet/provider";

export type DroproomTxState = {
  basescanUrl: string | null;
  error: string | null;
  events: DroproomReceiptEvents | null;
  hash: Hash | null;
  pending: boolean;
  receipt: TransactionReceipt | null;
};

const initialTxState: DroproomTxState = {
  basescanUrl: null,
  error: null,
  events: null,
  hash: null,
  pending: false,
  receipt: null
};

export function useDroproomContract() {
  const [account, setAccount] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasProvider, setHasProvider] = useState(false);
  const [tx, setTx] = useState<DroproomTxState>(initialTxState);
  const providerRef = useRef<Eip1193Provider | null>(null);

  useEffect(() => {
    let activeProvider: Eip1193Provider | null = null;
    let disposed = false;
    let refreshTimer: number | undefined;

    function handleAccountsChanged() {
      if (activeProvider) void refreshWalletState(activeProvider);
    }

    function handleChainChanged(nextChainId: unknown) {
      setChainId(parseWalletChainId(nextChainId));
      if (activeProvider) void refreshWalletState(activeProvider);
    }

    function detachProvider() {
      activeProvider?.removeListener?.("accountsChanged", handleAccountsChanged);
      activeProvider?.removeListener?.("chainChanged", handleChainChanged);
      activeProvider = null;
    }

    function attachProvider(provider: Eip1193Provider) {
      if (activeProvider === provider) return;
      detachProvider();
      activeProvider = provider;
      providerRef.current = provider;
      provider.on?.("accountsChanged", handleAccountsChanged);
      provider.on?.("chainChanged", handleChainChanged);
    }

    async function refreshActiveProvider() {
      const provider = await getConnectedWalletProvider();
      if (disposed) return;

      setHasProvider(Boolean(provider));
      if (!provider) {
        providerRef.current = null;
        detachProvider();
        startTransition(() => {
          setAccount(null);
          setChainId(null);
        });
        return;
      }

      attachProvider(provider);
      void refreshWalletState(provider);
    }

    function refreshWhenVisible() {
      if (document.visibilityState === "visible") void refreshActiveProvider();
    }

    void refreshActiveProvider();
    window.addEventListener("focus", refreshActiveProvider);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    refreshTimer = window.setInterval(refreshActiveProvider, 3000);

    return () => {
      disposed = true;
      detachProvider();
      window.removeEventListener("focus", refreshActiveProvider);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (refreshTimer) window.clearInterval(refreshTimer);
    };
  }, []);

  const isConnected = Boolean(account);
  const isCorrectChain = isBaseMainnetChainId(chainId);

  async function refreshWalletState(provider = providerRef.current ?? requireProvider()) {
    const [accounts, walletChainId] = await Promise.all([
      getConnectedWalletAccounts(provider).catch(() => []),
      getWalletChainId(provider).catch(() => null)
    ]);

    startTransition(() => {
      setAccount(accounts[0] ?? null);
      setChainId(walletChainId);
      setHasProvider(true);
    });

    providerRef.current = provider;
  }

  async function connect() {
    const provider = requireProvider(providerRef.current ?? getInjectedWalletProvider());
    setError(null);

    try {
      const nextAccount = await requestWalletAccount(provider);
      const nextChainId = await ensureWalletOnBaseMainnet(provider);

      startTransition(() => {
        setAccount(nextAccount);
        setChainId(nextChainId);
        setHasProvider(true);
      });

      return nextAccount;
    } catch (nextError) {
      const message = formatError(nextError);
      setError(message);
      throw nextError;
    }
  }

  async function disconnect() {
    const provider = providerRef.current ?? getInjectedWalletProvider();
    await disconnectWallet(provider ?? undefined);

    startTransition(() => {
      setAccount(null);
      setChainId(null);
      setTx(initialTxState);
    });
    providerRef.current = null;
  }

  async function switchAccount() {
    const provider = requireProvider(providerRef.current ?? getInjectedWalletProvider());
    setError(null);

    try {
      const requestedAccount = await requestWalletAccountSwitch(provider);
      const activeProvider = (await getConnectedWalletProvider()) ?? provider;
      const accounts = await getConnectedWalletAccounts(activeProvider).catch(() => []);
      const nextAccount = accounts[0] ?? requestedAccount;
      const nextChainId = await ensureWalletOnBaseMainnet(activeProvider);

      startTransition(() => {
        setAccount(nextAccount);
        setChainId(nextChainId);
        setHasProvider(true);
      });
      providerRef.current = activeProvider;

      return nextAccount;
    } catch (nextError) {
      const message = formatError(nextError);
      setError(message);
      throw nextError;
    }
  }

  async function ensureBaseChain() {
    const provider = providerRef.current ?? requireProvider();
    const nextChainId = await ensureWalletOnBaseMainnet(provider);
    setChainId(nextChainId);
    return nextChainId;
  }

  async function getReadyWalletClient() {
    const provider = (await getConnectedWalletProvider()) ?? requireProvider(providerRef.current ?? getInjectedWalletProvider());
    const connectedAccounts = await getConnectedWalletAccounts(provider).catch(() => []);
    const sender = connectedAccounts[0] ?? (await requestWalletAccount(provider));
    const nextChainId = await ensureWalletOnBaseMainnet(provider);

    startTransition(() => {
      setAccount(sender);
      setChainId(nextChainId);
      setHasProvider(true);
    });
    providerRef.current = provider;

    return {
      account: sender,
      walletClient: createDroproomWalletClient(provider, sender)
    };
  }

  async function createDropTx(input: CreateDropInput) {
    const ready = await getReadyWalletClient();
    return sendAndWait(() => createDrop({ ...input, ...ready }));
  }

  async function mintDropTx(input: MintDropInput) {
    const ready = await getReadyWalletClient();
    return sendAndWait(() => mintDrop({ ...input, ...ready }));
  }

  async function signMessage(message: string) {
    const provider = (await getConnectedWalletProvider()) ?? requireProvider(providerRef.current ?? getInjectedWalletProvider());
    const connectedAccounts = await getConnectedWalletAccounts(provider).catch(() => []);
    const signer = connectedAccounts[0] ?? (await requestWalletAccount(provider));
    const signature = await signWalletMessage(message, signer, provider);

    startTransition(() => {
      setAccount(signer);
      setHasProvider(true);
    });
    providerRef.current = provider;

    return { address: signer, message, signature };
  }

  async function sendAndWait(send: () => Promise<Hash>) {
    setError(null);
    setTx({ ...initialTxState, pending: true });

    try {
      const hash = await send();
      setTx((current) => ({
        ...current,
        basescanUrl: getBasescanTxUrl(hash),
        hash
      }));

      const result = await waitForDroproomTransaction(hash);
      setTx({
        basescanUrl: result.basescanUrl,
        error: result.receipt.status === "success" ? null : "Transaction reverted.",
        events: result.events,
        hash,
        pending: false,
        receipt: result.receipt
      });

      return result;
    } catch (nextError) {
      const message = formatError(nextError);
      setError(message);
      setTx((current) => ({
        ...current,
        error: message,
        events: current.receipt ? parseDroproomReceipt(current.receipt) : current.events,
        pending: false
      }));
      throw nextError;
    }
  }

  function resetTx() {
    setTx(initialTxState);
  }

  return {
    account,
    chainId,
    connect,
    createDrop: createDropTx,
    disconnect,
    ensureBaseChain,
    error,
    expectedChainId: DROPROOM_CHAIN_ID,
    hasProvider,
    isConnected,
    isCorrectChain,
    mintDrop: mintDropTx,
    readDrop: (tokenId: bigint | number | string): Promise<DroproomDrop> => readDrop(tokenId),
    readDropBalance: (owner: Address, tokenId: bigint | number | string) => readDropBalance(owner, tokenId),
    refreshWalletState,
    resetTx,
    signMessage,
    switchAccount,
    tx
  };
}

function requireProvider(provider = getInjectedWalletProvider()): Eip1193Provider {
  if (!provider) {
    throw new Error("No wallet provider found. Open Droproom in a wallet-enabled browser.");
  }

  return provider;
}

function formatError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Droproom wallet transaction failed.";
}
