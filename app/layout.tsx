import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Droproom";
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const appDescription =
  "Create limited social NFT drops with upload, blank canvas, and AI-assisted creation on Base. No sponsored gas: users pay their own network gas.";
const ogImage = "/brand/droproom-premium-hero.png";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  applicationName: appName,
  title: "Droproom | Limited NFT Drops on Base",
  description: appDescription,
  alternates: {
    canonical: "/"
  },
  keywords: [
    "Droproom",
    "NFT drops",
    "Base",
    "creator drops",
    "AI art",
    "limited editions"
  ],
  icons: {
    icon: "/brand/droproom-premium-hero.png"
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: appName,
    title: "Droproom | Limited NFT Drops on Base",
    description: appDescription,
    images: [
      {
        url: ogImage,
        alt: "Droproom limited NFT drops on Base"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Droproom | Limited NFT Drops on Base",
    description: appDescription,
    images: [ogImage]
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#07111f"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

