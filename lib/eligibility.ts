import { TOKEN_UNLOCK_MIN_EDITION } from "@/lib/constants";
import type { Drop } from "@/lib/types";

export type EligibilityResult = {
  status: "locked" | "review-ready";
  reason: string;
};

export function getCreatorTokenEligibility(drops: Drop[], creatorAddress?: string): EligibilityResult {
  const creatorDrops = drops.filter((drop) => drop.creatorAddress === creatorAddress || drop.creator === "You");
  const qualifyingDrop = creatorDrops.find((drop) => drop.status === "sold-out" && drop.edition >= TOKEN_UNLOCK_MIN_EDITION);

  if (!qualifyingDrop) {
    return {
      status: "locked",
      reason: `Needs 1 sold-out drop with at least ${TOKEN_UNLOCK_MIN_EDITION} editions. Self-mints do not count in production review.`
    };
  }

  return {
    status: "review-ready",
    reason: "A sold-out drop is ready for manual review. Token launch stays locked until approval."
  };
}
