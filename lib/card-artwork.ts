export const CARD_TEMPLATES = [
  { id: "orbit", label: "Orbit", color: "#153be8" },
  { id: "bloom", label: "Bloom", color: "#5935a3" },
  { id: "signal", label: "Signal", color: "#15594c" }
] as const;

export function createCardArtwork(title = "YOUR DROP", background = "#153be8", template = "orbit") {
  const label = (title.trim() || "YOUR DROP").slice(0, 18).toUpperCase().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const color = /^#[a-f0-9]{6}$/i.test(background) ? background : "#153be8";
  const shape = template === "bloom"
    ? Array.from({ length: 8 }, (_, i) => `<ellipse cx="600" cy="370" rx="100" ry="230" transform="rotate(${i * 45} 600 510)" fill="#f4f0df" opacity=".68"/>`).join("") + '<circle cx="600" cy="510" r="100" fill="#e9ee85"/>'
    : template === "signal"
      ? Array.from({ length: 6 }, (_, i) => `<rect x="${250 + i * 100}" y="${360 - Math.sin(i) * 100}" width="65" height="${250 + Math.sin(i) * 200}" rx="32" fill="${i % 2 ? '#e9ee85' : '#f4f0df'}"/>`).join("")
      : '<circle cx="600" cy="500" r="220" fill="#e9ee85"/><ellipse cx="600" cy="500" rx="390" ry="110" transform="rotate(-30 600 500)" stroke="#f4f0df" stroke-width="22" fill="none"/><circle cx="880" cy="280" r="34" fill="#f4f0df"/>';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="${color}"/><rect x="48" y="48" width="1104" height="1104" rx="28" fill="none" stroke="#fff" stroke-opacity=".24" stroke-width="2"/><text x="100" y="140" font-family="Arial,sans-serif" font-size="28" letter-spacing="7" fill="#fff">DROPROOM / BASE</text>${shape}<path d="M100 885H1100" stroke="#fff" stroke-opacity=".35"/><text x="100" y="990" font-family="Arial,sans-serif" font-weight="700" font-size="62" fill="#f4f0df">${label}</text><text x="100" y="1070" font-family="Arial,sans-serif" font-size="25" letter-spacing="6" fill="#fff">A LITTLE MORE ONCHAIN.</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
