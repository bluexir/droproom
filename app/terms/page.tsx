import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

const updatedAt = "April 16, 2026";
const supportEmail = "supportdroproom@gmail.com";

const pageShell: CSSProperties = {
  width: "min(920px, calc(100% - 32px))",
  margin: "0 auto",
  padding: "56px 0 72px"
};

const card: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: "34px",
  background: "rgba(6, 15, 26, 0.82)",
  boxShadow: "var(--shadow)",
  padding: "clamp(24px, 5vw, 52px)"
};

const kicker: CSSProperties = {
  color: "var(--cyan)",
  fontFamily: "var(--font-display), sans-serif",
  fontSize: "0.78rem",
  fontWeight: 800,
  letterSpacing: "0.16em",
  textTransform: "uppercase"
};

const section: CSSProperties = {
  borderTop: "1px solid var(--line)",
  marginTop: "28px",
  paddingTop: "28px"
};

const list: CSSProperties = {
  color: "var(--muted)",
  lineHeight: 1.75,
  paddingLeft: "1.2rem"
};

const linkStyle: CSSProperties = {
  color: "var(--cyan)"
};

export const metadata: Metadata = {
  title: "Terms of Use | Droproom",
  description:
    "Droproom terms for limited NFT drops, paid mint fees, user content, AI-assisted artwork, IP rights, and creator responsibilities.",
  alternates: {
    canonical: "/terms"
  },
  openGraph: {
    title: "Terms of Use | Droproom",
    description:
      "The rules for creating, publishing, and collecting limited NFT drops on Droproom.",
    url: "/terms"
  }
};

export default function TermsPage() {
  return (
    <main style={pageShell}>
      <article style={card}>
        <Link href="/" style={linkStyle}>
          Back to Droproom
        </Link>
        <p style={{ ...kicker, marginTop: "32px" }}>Launch trust layer</p>
        <h1>Terms of Use</h1>
        <p>
          These terms explain how Droproom works for creators and collectors.
          By using Droproom, you agree to use the product responsibly and to
          respect wallet, payment, content, and intellectual property rules.
        </p>
        <p className="microcopy">Last updated: {updatedAt}</p>

        <section style={section}>
          <h2>What Droproom provides</h2>
          <p>
            Droproom is a creator-first NFT drop studio for image-based drops on
            Base. Creators can upload artwork, start from a blank canvas, or use
            AI-assisted creation tools, then prepare limited edition drops.
          </p>
          <p>
            Droproom is not a broker, financial adviser, custodian, marketplace,
            bank, or legal adviser. You are responsible for reviewing
            transactions before signing them with your wallet.
          </p>
        </section>

        <section style={section}>
          <h2>Gas and transaction costs</h2>
          <p>
            Droproom does not currently use a paymaster or sponsor gas. Creators
            and collectors pay their own Base network gas from their connected
            wallet when they publish, mint, or sign onchain transactions.
          </p>
          <p>
            Gas is paid to the network, not to Droproom. Gas can vary, failed or
            reverted transactions may still consume gas, and Droproom does not
            reimburse network fees.
          </p>
        </section>

        <section style={section}>
          <h2>Platform fee</h2>
          <ul style={list}>
            <li>Free mints are platform-fee free.</li>
            <li>
              Paid primary mints include a 10% Droproom platform fee, currently
              represented as 1000 basis points.
            </li>
            <li>
              The creator receives the remaining paid primary mint proceeds
              after the platform fee, before any external wallet, network,
              bridge, marketplace, tax, or third-party costs.
            </li>
            <li>
              Platform fees are separate from gas. Collectors still pay network
              gas even when a mint has no platform fee.
            </li>
          </ul>
        </section>

        <section style={section}>
          <h2>User content and AI-assisted creation</h2>
          <p>
            You are responsible for the artwork, prompts, names, descriptions,
            metadata, and other content you submit or publish. Do not upload,
            generate, mint, or distribute content that violates law, infringes
            intellectual property rights, contains private information you do not
            have permission to use, or breaches another platform&apos;s rules.
          </p>
          <p>
            AI tools can produce unexpected or similar outputs. Droproom does not
            guarantee that AI-assisted artwork is unique, non-infringing, or
            suitable for commercial use. Review outputs carefully before using
            them in a drop.
          </p>
        </section>

        <section style={section}>
          <h2>Intellectual property rights</h2>
          <p>
            You keep the rights you already have in content you submit. You grant
            Droproom a worldwide, non-exclusive, royalty-free license to host,
            store, reproduce, display, format, and distribute your submitted
            content as needed to operate, secure, market, and improve the
            product.
          </p>
          <p>
            Publishing a drop does not automatically transfer copyright or
            commercial rights to collectors unless the creator separately grants
            those rights in the drop details or another written license.
            Collectors receive only the onchain token and any rights expressly
            stated by the creator.
          </p>
        </section>

        <section style={section}>
          <h2>Wallets, eligibility, and risk</h2>
          <p>
            You are responsible for your wallet, private keys, approvals,
            signatures, taxes, and compliance obligations. Onchain transactions
            are generally public and irreversible. Droproom may restrict access,
            hide content, or pause features when needed for security, abuse
            prevention, legal compliance, or product integrity.
          </p>
        </section>

        <section style={section}>
          <h2>Support</h2>
          <p>
            For product, billing, content, IP, or safety questions, contact{" "}
            <a href={`mailto:${supportEmail}`} style={linkStyle}>
              {supportEmail}
            </a>
            . Please include your wallet address, drop link or transaction hash,
            and a short description of the issue.
          </p>
        </section>
      </article>
    </main>
  );
}
