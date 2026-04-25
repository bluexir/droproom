import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Link from "next/link";

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

const grid: CSSProperties = {
  display: "grid",
  gap: "16px",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  marginTop: "28px"
};

const panel: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: "22px",
  background: "rgba(255, 255, 255, 0.05)",
  padding: "20px"
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
  title: "Support | Droproom",
  description:
    "Contact Droproom support for wallet, gas, fee, AI content, IP, safety, and launch questions.",
  alternates: {
    canonical: "/support"
  },
  openGraph: {
    title: "Support | Droproom",
    description:
      "Get help with Droproom drops, wallet transactions, fees, AI outputs, and content concerns.",
    url: "/support"
  }
};

export default function SupportPage() {
  return (
    <main style={pageShell}>
      <article style={card}>
        <Link href="/" style={linkStyle}>
          Back to Droproom
        </Link>
        <p style={{ ...kicker, marginTop: "32px" }}>Help and launch support</p>
        <h1>Support</h1>
        <p>
          Need help with a drop, wallet transaction, AI output, content report,
          or launch question? Send the details below so we can investigate
          quickly.
        </p>

        <div style={grid}>
          <section style={panel}>
            <h2>Email</h2>
            <p>
              <a href={`mailto:${supportEmail}`} style={linkStyle}>
                {supportEmail}
              </a>
            </p>
            <p className="microcopy">
              Best for product issues, privacy requests, billing questions, IP
              concerns, and safety reports.
            </p>
          </section>

          <section style={panel}>
            <h2>Response goal</h2>
            <p>We aim to review launch-critical support requests within 2 business days.</p>
            <p className="microcopy">
              Urgent security or abuse reports should include &ldquo;Urgent&rdquo; in the
              subject line.
            </p>
          </section>
        </div>

        <section style={section}>
          <h2>What to include</h2>
          <ul style={list}>
            <li>Your wallet address.</li>
            <li>The drop link, token ID, or transaction hash if available.</li>
            <li>A short description of what happened and what you expected.</li>
            <li>Screenshots or error text for failed publish or mint attempts.</li>
            <li>
              For IP or content reports, include the original work, the reported
              drop, and proof that you are authorized to submit the request.
            </li>
          </ul>
        </section>

        <section style={section}>
          <h2>Gas and fees</h2>
          <p>
            Droproom does not currently sponsor gas or use a paymaster. Your
            connected wallet pays Base network gas for publish, mint, and other
            onchain transactions. Gas is separate from Droproom&apos;s platform fee.
          </p>
          <p>
            Free mints are platform-fee free. Paid primary mints include a 10%
            platform fee, with the remaining primary mint proceeds routed to the
            creator according to the drop contract.
          </p>
        </section>

        <section style={section}>
          <h2>Safety and IP reports</h2>
          <p>
            Report suspected infringement, impersonation, unsafe content, or
            abuse to{" "}
            <a href={`mailto:${supportEmail}`} style={linkStyle}>
              {supportEmail}
            </a>
            . Droproom may hide content, pause access, or request more
            information while reviewing a report.
          </p>
        </section>
      </article>
    </main>
  );
}
