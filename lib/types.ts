export type StartMode = "upload" | "blank" | "ai";

export type DropStatus = "draft" | "live" | "sold-out" | "review-pending";

export type Drop = {
  id: string;
  tokenId?: string;
  title: string;
  description: string;
  image: string;
  imageIpfsUri?: string;
  metadataUri?: string;
  creator: string;
  creatorAddress?: string;
  price: number;
  priceWei?: string;
  isFree: boolean;
  edition: number;
  minted: number;
  status: DropStatus;
  createdAt: string;
  collectors: string[];
  txHash?: string;
  basescanUrl?: string;
  mediaType?: string;
};

export type StudioDraft = {
  title: string;
  description: string;
  image: string;
  background: string;
  frame: string;
  overlayText: string;
  edition: number;
  price: number;
  isFree: boolean;
};
