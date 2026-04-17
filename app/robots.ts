import type { MetadataRoute } from "next";

const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = new URL(appUrl);

  return {
    rules: {
      userAgent: "*",
      allow: "/"
    },
    sitemap: new URL("/sitemap.xml", baseUrl).toString(),
    host: baseUrl.origin
  };
}
