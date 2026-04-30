import type { Metadata } from "next";

import { DroproomApp } from "@/components/DroproomApp";
import { fetchPublicDropPreviewFromSlug, getTokenIdFromDropSlug } from "@/lib/server/drop-preview";

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "Droproom";
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://baseappdroproom.com";
const defaultDescription = "Create and collect limited NFT drops on Base with Droproom.";

type DropPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: DropPageProps): Promise<Metadata> {
  const { slug } = await params;
  const drop = await fetchPublicDropPreviewFromSlug(slug);

  if (!drop) {
    return {
      alternates: {
        canonical: "/"
      },
      description: defaultDescription,
      title: `Drop unavailable | ${appName}`
    };
  }

  const title = `${drop.title} | ${appName}`;
  const description = drop.description || `Collect ${drop.title} on Droproom.`;
  const canonicalPath = drop.path;
  const previewImage = new URL(`${canonicalPath}/opengraph-image`, appUrl).toString();

  return {
    alternates: {
      canonical: canonicalPath
    },
    description,
    openGraph: {
      description,
      images: [
        {
          alt: `${drop.title} on Droproom`,
          height: 630,
          url: previewImage,
          width: 1200
        }
      ],
      siteName: appName,
      title,
      type: "website",
      url: canonicalPath
    },
    title,
    twitter: {
      card: "summary_large_image",
      description,
      images: [previewImage],
      title
    }
  };
}

export default async function DropPage({ params }: DropPageProps) {
  const { slug } = await params;
  const initialDropId = getTokenIdFromDropSlug(slug) ?? undefined;

  return <DroproomApp initialDropId={initialDropId} />;
}
