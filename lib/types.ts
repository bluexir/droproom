export type StartMode = "upload" | "blank" | "ai";

export type DropStatus = "draft" | "live" | "sold-out" | "review-pending";

export type Drop = {
  id: string;
  title: string;
  description: string;
  image: string;
  creator: string;
  creatorAddress?: string;
  price: number;
  isFree: boolean;
  edition: number;
  minted: number;
  status: DropStatus;
  createdAt: string;
  collectors: string[];
  previewImage?: string;
  previewOnly?: boolean;
  featured?: boolean;
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
