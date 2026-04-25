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
  title: "Privacy Policy | Droproom",
  description:
    "How Droproom handles wallet addresses, creator uploads, AI prompts, support requests, analytics, and onchain activity.",
  alternates: {
    canonical: "/privacy"
  },
  openGraph: {
    title: "Privacy Policy | Droproom",
    description:
      "Droproom privacy details for wallet, drop, AI, analytics, and support data.",
    url: "/privacy"
  }
};

export default function PrivacyPage() {
  return (
    <main style={pageShell}>
      <article style={card}>
        <Link href="/" style={linkStyle}>
          Back to Droproom
        </Link>
        <p style={{ ...kicker, marginTop: "32px" }}>Privacy and data</p>
        <h1>Privacy Policy</h1>
        <p>
          This policy explains what Droproom collects, why we use it, and the
          choices you have when creating, publishing, and collecting limited NFT
          drops.
        </p>
        <p className="microcopy">Last updated: {updatedAt}</p>

        <section style={section}>
          <h2>Information we collect</h2>
          <ul style={list}>
            <li>
              Wallet information, such as connected wallet address, chain ID,
              transaction hashes, and public onchain activity.
            </li>
            <li>
              Drop content, such as uploaded images, AI prompts, generated
              outputs, titles, descriptions, edition size, mint price, and
              metadata.
            </li>
            <li>
              Support information, such as your email address, message content,
              screenshots, wallet address, drop links, and transaction details
              when you contact us.
            </li>
            <li>
              Technical information, such as device, browser, logs, IP address,
              approximate location, error reports, and product usage events.
            </li>
          </ul>
        </section>

        <section style={section}>
          <h2>How we use information</h2>
          <p>
            We use information to operate Droproom, generate or store requested
            artwork, prepare drop metadata, display creator and collector
            activity, provide support, protect against fraud or abuse, debug
            product issues, comply with legal obligations, and improve launch
            readiness.
          </p>
          <p>
            Wallet and transaction information may be public by design because
            Base is a public blockchain. Droproom cannot delete or alter public
            onchain records.
          </p>
        </section>

        <section style={section}>
          <h2>AI providers and content processing</h2>
          <p>
            If you use AI-assisted creation, prompts and related request data may
            be sent to the configured AI provider so the image can be generated.
            Do not include secrets, private keys, sensitive personal data, or
            content you are not allowed to process in AI prompts.
          </p>
        </section>

        <section style={section}>
          <h2>Sharing</h2>
          <p>
            We may share information with infrastructure, hosting, analytics,
            wallet, blockchain RPC, storage, AI, security, and support providers
            that help us run Droproom. We may also share information when needed
            for legal compliance, safety, abuse prevention, or to protect the
            rights of Droproom, users, creators, collectors, and third parties.
          </p>
        </section>

        <section style={section}>
          <h2>Your choices</h2>
          <p>
            You can disconnect your wallet, avoid submitting optional content,
            and contact support to request access, correction, deletion, or
            export of offchain personal information where applicable. We may need
            to retain certain records for security, dispute resolution, legal, or
            accounting reasons.
          </p>
        </section>

        <section style={section}>
          <h2>Security and retention</h2>
          <p>
            We use reasonable safeguards for offchain data, but no online system
            is risk-free. We keep information only as long as needed for product,
            support, legal, accounting, security, or operational purposes.
          </p>
        </section>

        <section style={section}>
          <h2>Contact</h2>
          <p>
            For privacy requests, contact{" "}
            <a href={`mailto:${supportEmail}`} style={linkStyle}>
              {supportEmail}
            </a>
            . Include the wallet address or email related to your request so we
            can locate the relevant records.
          </p>
        </section>
      </article>
    </main>
  );
}
