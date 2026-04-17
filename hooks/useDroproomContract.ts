"use client";

import { startTransition, useEffect, useState } from "react";
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
  ensureWalletOnBaseMainnet,
  getConnectedWalletAccounts,
  getInjectedWalletProvider,
  getWalletChainId,
  parseWalletChainId,
  requestWalletAccount,
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

  useEffect(() => {
    const provider = getInjectedWalletProvider();
    setHasProvider(Boolean(provider));
    if (!provider) return;

    void refreshWalletState(provider);

    function handleAccountsChanged(accounts: unknown) {
      const [nextAccount] = Array.isArray(accounts) ? accounts : [];
      setAccount(typeof nextAccount === "string" ? (nextAccount as Address) : null);
    }

    function handleChainChanged(nextChainId: unknown) {
      setChainId(parseWalletChainId(nextChainId));
    }

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, []);

  const isConnected = Boolean(account);
  const isCorrectChain = isBaseMainnetChainId(chainId);

  async function refreshWalletState(provider = requireProvider()) {
    const [accounts, walletChainId] = await Promise.all([
      getConnectedWalletAccounts(provider).catch(() => []),
      getWalletChainId(provider).catch(() => null)
    ]);

    startTransition(() => {
      setAccount(accounts[0] ?? null);
      setChainId(walletChainId);
      setHasProvider(true);
    });
  }

  async function connect() {
    const provider = requireProvider();
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

  async function ensureBaseChain() {
    const provider = requireProvider();
    const nextChainId = await ensureWalletOnBaseMainnet(provider);
    setChainId(nextChainId);
    return nextChainId;
  }

  async function getReadyWalletClient() {
    const provider = requireProvider();
    const sender = account ?? (await requestWalletAccount(provider));
    const nextChainId = await ensureWalletOnBaseMainnet(provider);

    startTransition(() => {
      setAccount(sender);
      setChainId(nextChainId);
      setHasProvider(true);
    });

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
    tx
  };
}

function requireProvider(): Eip1193Provider {
  const provider = getInjectedWalletProvider();
  if (!provider) {
    throw new Error("No wallet provider found. Open Droproom in a wallet-enabled browser.");
  }

  return provider;
}

function formatError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Droproom wallet transaction failed.";
}
