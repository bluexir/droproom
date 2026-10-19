import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { discoverDrops, isPresentationReady } from "../lib/discovery";
import type { Drop } from "../lib/types";
import { GENESIS_CREATOR, isGenesisDrop } from "../lib/genesis";

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
  it("pins the real Genesis ahead of newer, more collected and nearly sold-out drops", () => {
    const genesis = drop("1", { creatorAddress: GENESIS_CREATOR, edition: 99, minted: 64, createdAt: "2026-01-01T00:00:00Z" });
    const newer = drop("90", { edition: 100, minted: 99, createdAt: "2026-10-19T00:00:00Z" });
    for (const sort of ["newest", "collected", "remaining"] as const) {
      assert.equal(discoverDrops([newer, genesis], "", "live", sort)[0].id, "1");
    }
    assert.equal(Boolean(isGenesisDrop(drop("2", { title: "Droproom Genesis Pass", creatorAddress: GENESIS_CREATOR }))), false);
    assert.equal(Boolean(isGenesisDrop(drop("1", { title: "Droproom Genesis Pass" }))), false);
  });
  it("keeps saved sold-out drops accessible and preserves search and moderation", () => {
    assert.deepEqual(discoverDrops(drops, "", "saved", "newest", ["1", "4", "6"]).map((item) => item.id), ["1", "4"]);
    assert.deepEqual(discoverDrops(drops, "Collection 4", "saved", "newest", ["1", "4"]).map((item) => item.id), ["4"]);
  });
  it("pins completed Genesis in the sold-out archive without overriding filter matches", () => {
    const genesis = drop("1", { creatorAddress: GENESIS_CREATOR, minted: 10, status: "sold-out" });
    assert.equal(discoverDrops([drops[3], genesis], "", "sold-out", "collected")[0].id, "1");
    assert.equal(discoverDrops([genesis], "missing", "sold-out", "newest").length, 0);
  });
});
