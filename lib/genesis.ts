import type { Drop } from "./types";

// Identity on the existing Droproom contract, independent of mutable titles.
export const GENESIS_TOKEN_ID = "1";
export const GENESIS_CREATOR = "0x152bB9d22d0a980d915F1052eDEF859A9383b7BF";

export function isGenesisDrop(drop: Pick<Drop, "tokenId" | "creatorAddress">) {
  return drop.tokenId === GENESIS_TOKEN_ID && drop.creatorAddress?.toLowerCase() === GENESIS_CREATOR.toLowerCase();
}

export function compareGenesisFirst(a: Drop, b: Drop) {
  return Number(Boolean(isGenesisDrop(b))) - Number(Boolean(isGenesisDrop(a)));
}
