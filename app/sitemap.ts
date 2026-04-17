import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const lastModified = new Date("2026-04-16T00:00:00.000Z");

const routes = [
  { path: "/", priority: 1 },
  { path: "/terms", priority: 0.7 },
  { path: "/privacy", priority: 0.7 },
  { path: "/support", priority: 0.7 }
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = new URL(appUrl);

  return routes.map((route) => ({
    url: new URL(route.path, baseUrl).toString(),
    lastModified,
    changeFrequency: "weekly",
    priority: route.priority
  }));
}
