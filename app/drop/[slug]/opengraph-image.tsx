import { ImageResponse } from "next/og";

import { fetchPublicDropPreviewFromSlug } from "@/lib/server/drop-preview";

export const alt = "Droproom NFT drop preview";
export const contentType = "image/png";
export const runtime = "nodejs";
export const size = {
  height: 630,
  width: 1200
};

type DropImageProps = {
  params: Promise<{ slug: string }>;
};

export default async function DropOpenGraphImage({ params }: DropImageProps) {
  const { slug } = await params;
  const drop = await fetchPublicDropPreviewFromSlug(slug);

  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(135deg, #030712 0%, #07111f 45%, #101827 100%)",
          color: "white",
          display: "flex",
          height: "100%",
          justifyContent: "space-between",
          padding: "54px",
          position: "relative",
          width: "100%"
        }}
      >
        <div
          style={{
            background: "rgba(49, 243, 233, 0.16)",
            borderRadius: "999px",
            filter: "blur(64px)",
            height: "360px",
            left: "410px",
            position: "absolute",
            top: "-110px",
            width: "360px"
          }}
        />
        <div
          style={{
            background: "rgba(25, 109, 255, 0.2)",
            borderRadius: "999px",
            bottom: "-130px",
            filter: "blur(70px)",
            height: "390px",
            position: "absolute",
            right: "-30px",
            width: "390px"
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "28px",
            maxWidth: "510px",
            position: "relative",
            zIndex: 2
          }}
        >
          <div style={{ alignItems: "center", display: "flex", gap: "14px" }}>
            <div
              style={{
                alignItems: "center",
                background: "linear-gradient(135deg, #31f3e9, #196dff)",
                border: "1px solid rgba(255,255,255,0.22)",
                borderRadius: "18px",
                display: "flex",
                fontSize: "28px",
                fontWeight: 900,
                height: "58px",
                justifyContent: "center",
                width: "58px"
              }}
            >
              D
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <div style={{ color: "#f8fafc", fontSize: "29px", fontWeight: 900 }}>Droproom</div>
              <div style={{ color: "#93c5fd", fontSize: "19px", fontWeight: 700 }}>Limited NFT Drops on Base</div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
            <div style={{ color: "#60a5fa", fontSize: "22px", fontWeight: 900, letterSpacing: "0.08em" }}>
              {drop ? `DROP #${drop.tokenId ?? drop.id}` : "DROP PREVIEW"}
            </div>
            <div
              style={{
                color: "#ffffff",
                fontSize: drop && drop.title.length > 28 ? "58px" : "68px",
                fontWeight: 950,
                letterSpacing: 0,
                lineHeight: 1.02
              }}
            >
              {drop?.title ?? "Drop unavailable"}
            </div>
            <div style={{ color: "#b7c6d8", fontSize: "26px", lineHeight: 1.42 }}>
              {drop?.description ? clamp(drop.description, 118) : "Collect limited NFT drops on Base."}
            </div>
          </div>

          <div style={{ display: "flex", gap: "14px" }}>
            <Badge>{drop ? `${drop.minted}/${drop.edition} minted` : "Base"}</Badge>
            <Badge>Mint on Droproom</Badge>
          </div>
        </div>

        <div
          style={{
            alignItems: "center",
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.16)",
            borderRadius: "36px",
            boxShadow: "0 34px 90px rgba(0,0,0,0.45)",
            display: "flex",
            height: "510px",
            justifyContent: "center",
            overflow: "hidden",
            padding: "20px",
            position: "relative",
            width: "510px",
            zIndex: 2
          }}
        >
          {drop?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={drop.title}
              src={drop.image}
              style={{
                borderRadius: "24px",
                height: "100%",
                objectFit: "contain",
                width: "100%"
              }}
            />
          ) : (
            <div
              style={{
                alignItems: "center",
                background: "linear-gradient(135deg, #1d4ed8, #0f172a)",
                borderRadius: "24px",
                color: "#bfdbfe",
                display: "flex",
                fontSize: "44px",
                fontWeight: 900,
                height: "100%",
                justifyContent: "center",
                width: "100%"
              }}
            >
              DROPROOM
            </div>
          )}
        </div>
      </div>
    ),
    size
  );
}

function Badge({ children }: { children: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.08)",
        border: "1px solid rgba(255,255,255,0.14)",
        borderRadius: "999px",
        color: "#e0f2fe",
        display: "flex",
        fontSize: "22px",
        fontWeight: 800,
        padding: "13px 18px"
      }}
    >
      {children}
    </div>
  );
}

function clamp(value: string, maxLength: number) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1).trim()}...` : value;
}
