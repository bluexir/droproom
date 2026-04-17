import { getAddress, type Address } from "viem";

export const DROPROOM_CONTRACT_ADDRESS = getAddress(
  process.env.NEXT_PUBLIC_DROP_CONTRACT_ADDRESS ?? "0x6d746fdb4316881194ebb2bbe4771c1523a9e51b"
) as Address;
export const DROPROOM_MAX_EDITION_SUPPLY = 999;
export const DROPROOM_MAX_ROYALTY_BPS = 1_000;
export const DROPROOM_PLATFORM_FEE_BPS = 1_000;
