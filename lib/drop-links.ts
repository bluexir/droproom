import type { Drop } from "@/lib/types";

type DropLinkData = Pick<Drop, "id" | "title" | "tokenId">;

export function getDropTokenIdFromSlug(slug?: string | null) {
  if (!slug) return null;

  const match = slug.trim().match(/^(\d+)(?:-|$)/);
  return match?.[1] ?? null;
}

export function slugifyDropTitle(value: string) {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "drop"
  );
}

export function getDropSlug(drop: DropLinkData) {
  const tokenId = drop.tokenId ?? drop.id;
  return `${tokenId}-${slugifyDropTitle(drop.title)}`;
}

export function getDropPath(drop: DropLinkData) {
  return `/drop/${getDropSlug(drop)}`;
}

export function getDropPermalink(baseUrl: string, drop: DropLinkData) {
  return new URL(getDropPath(drop), baseUrl).toString();
}
