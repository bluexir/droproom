import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discoverDrops, isPresentationReady } from "../lib/discovery";
import type { Drop } from "../lib/types";

function drop(id: string, changes: Partial<Drop> = {}): Drop {
  return { id, tokenId: id, title: `Collection ${id}`, description: "A test collection", image: "/image.png", creator: "alice", creatorAddress: "0x1234", price: 0, isFree: true, edition: 10, minted: 2, status: "live", createdAt: "2026-10-18T00:00:00Z", collectors: [], ...changes };
}

describe("drop discovery", () => {
  const drops = [drop("1"), drop("2", { isFree: false, price: 0.001, minted: 8 }), drop("3", { edition: 99 }), drop("4", { minted: 10, status: "sold-out" }), drop("5", { status: "paused" }), drop("6", { status: "review-pending" })];
  it("keeps sold out, paused and hidden items out of live results", () => {
    assert.deepEqual(discoverDrops(drops, "", "live", "newest").map((item) => item.id), ["1", "2", "3"]);
    assert.deepEqual(discoverDrops(drops, "", "sold-out", "newest").map((item) => item.id), ["4"]);
  });
  it("combines price, edition size, search and sorting", () => {
    assert.deepEqual(discoverDrops(drops, "", "free", "newest").map((item) => item.id), ["1", "3"]);
    assert.deepEqual(discoverDrops(drops, "ALICE", "small", "remaining").map((item) => item.id), ["2", "1"]);
    assert.equal(discoverDrops(drops, "unknown", "live", "newest").length, 0);
  });
  it("keeps filename-like titles out of featured slots without deleting those drops", () => {
    for (const title of ["Untitled Drop", "images (3)", "1000018757", "Nature_Islands"]) {
      assert.equal(isPresentationReady(drop("1", { title })), false);
    }
    assert.equal(isPresentationReady(drop("1", { title: "Droproom Genesis Pass" })), true);
  });
});
