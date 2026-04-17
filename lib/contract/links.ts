import type { Address, Hex } from "viem";

import { DROPROOM_CONTRACT_ADDRESS } from "@/lib/contract/config";
import { BASE_EXPLORER_URL } from "@/lib/wallet/base";

export function getBasescanTxUrl(txHash: Hex) {
  return `${BASE_EXPLORER_URL}/tx/${txHash}`;
}

export function getBasescanAddressUrl(address: Address) {
  return `${BASE_EXPLORER_URL}/address/${address}`;
}

export function getBasescanTokenUrl(tokenId?: bigint | number | string) {
  const url = `${BASE_EXPLORER_URL}/token/${DROPROOM_CONTRACT_ADDRESS}`;
  return tokenId === undefined ? url : `${url}?a=${tokenId.toString()}`;
}

export function getDroproomContractUrl() {
  return getBasescanAddressUrl(DROPROOM_CONTRACT_ADDRESS);
}
