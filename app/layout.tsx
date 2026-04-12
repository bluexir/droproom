import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Work_Sans } from "next/font/google";
import type { ReactNode } from "react";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-display"
});

const workSans = Work_Sans({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  title: "Droproom | Limited NFT Drops on Base",
  description: "Create limited social NFT drops with upload, blank canvas, and AI-assisted creation on Base.",
  icons: {
    icon: "/brand/droproom-premium-hero.png"
  },
  openGraph: {
    title: "Droproom",
    description: "Create, publish, and collect limited NFT drops on Base.",
    images: ["/brand/droproom-premium-hero.png"]
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
      <body className={`${spaceGrotesk.variable} ${workSans.variable}`}>
        {children}
      </body>
    </html>
  );
}

