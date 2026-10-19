import type { Drop } from "./types";
import { compareGenesisFirst } from "./genesis";

export type DiscoveryFilter = "live" | "free" | "small" | "sold-out" | "saved";
export type DiscoverySort = "newest" | "collected" | "remaining";

export function discoverDrops(drops: Drop[], query: string, filter: DiscoveryFilter, sort: DiscoverySort, saved: string[] = []) {
  const search = query.trim().toLocaleLowerCase();
  return drops.filter((drop) => {
    if (!drop.tokenId || drop.status === "review-pending" || drop.status === "draft") return false;
    const soldOut = drop.minted >= drop.edition || drop.status === "sold-out";
    if (filter === "saved") {
      if (!saved.includes(drop.id)) return false;
    } else if (filter === "sold-out" ? !soldOut : soldOut || drop.status !== "live") return false;
    if (filter === "free" && !drop.isFree) return false;
    if (filter === "small" && drop.edition > 25) return false;
    return !search || [drop.title, drop.creator, drop.creatorAddress, drop.tokenId].some((value) => value?.toLocaleLowerCase().includes(search));
  }).sort((a, b) => {
    const pinned = compareGenesisFirst(a, b);
    if (pinned) return pinned;
    if (sort === "collected") return b.minted - a.minted || compareNewest(a, b);
    if (sort === "remaining") return (a.edition - a.minted) - (b.edition - b.minted) || compareNewest(a, b);
    return compareNewest(a, b);
  });
}

function compareNewest(a: Drop, b: Drop) {
  return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
}

export function isPresentationReady(drop: Drop) {
  const title = drop.title.trim();
  return title.length >= 3 && !/^(untitled(?: drop)?|images?\s*(?:\(\d+\))?|\d{7,}|[a-f0-9]{24,})$/i.test(title)
    && !/_/.test(title) && title.length <= 64 && Boolean(drop.image);
}
