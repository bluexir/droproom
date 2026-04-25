import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.css";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Droproom";
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://baseappdroproom.com";
const baseAppId = process.env.NEXT_PUBLIC_BASE_APP_ID ?? "69db83cb2c63bda0567316af";
const appDescription =
  "Create limited social NFT drops with upload, blank canvas, and AI-assisted creation on Base. No sponsored gas: users pay their own network gas.";
const brandIcon = "/brand/logo.png";
const ogImage = "/brand/og.png";

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
    icon: [
      {
        url: brandIcon,
        sizes: "1254x1254",
        type: "image/png"
      }
    ],
    apple: [
      {
        url: brandIcon,
        sizes: "1254x1254",
        type: "image/png"
      }
    ]
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
        width: 1731,
        height: 909,
        alt: "Droproom limited NFT drops on Base"
      }
    ]
  },
  twitter: {
    card: "summary_large_image",
    title: "Droproom | Limited NFT Drops on Base",
    description: appDescription,
    images: [ogImage]
  },
  other: {
    "base:app_id": baseAppId
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

