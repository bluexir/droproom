"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Drop } from "@/lib/types";

export function RoomIcon({ name }: { name: "explore" | "create" | "library" | "heart" }) {
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    {name === "explore" ? <><rect x="3" y="3" width="7" height="7" rx="2" /><rect x="14" y="3" width="7" height="7" rx="2" /><rect x="3" y="14" width="7" height="7" rx="2" /><rect x="14" y="14" width="7" height="7" rx="2" /></> : name === "create" ? <><path d="M12 5v14M5 12h14" /><rect x="2" y="2" width="20" height="20" rx="6" /></> : name === "heart" ? <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /> : <><rect x="7" y="7" width="14" height="14" rx="3" /><path d="M17 3H6a3 3 0 0 0-3 3v11" /></>}
  </svg>;
}

export function RoomHero({ genesis, loading, artwork, onOpen, onCreate }: {
  genesis?: Drop; loading: boolean; artwork: ReactNode; onOpen: () => void; onCreate: () => void;
}) {
  const soldOut = genesis ? genesis.minted >= genesis.edition : false;
  return <section className="room-hero">
    <div className="room-intro">
      <span className="room-kicker"><i /> A little more onchain.</span>
      <h1>Find your next<br /><span>little obsession.</span></h1>
      <p>Collect something you love. Make something that’s yours. Welcome to the room.</p>
      <button className="room-create-link" type="button" onClick={onCreate}><RoomIcon name="create" /> Make a drop <span>↗</span></button>
      <span className="room-chain-note">On Base. Yours to collect.</span>
    </div>
    <article className="genesis-spotlight" aria-label="Droproom Genesis, always featured first">
      <div className="genesis-topline"><span><i /> THE ORIGINAL DROP</span><span>№ 001</span></div>
      <div className="genesis-content">
        <button className="genesis-art" disabled={!genesis} onClick={onOpen} type="button" aria-label="View Droproom Genesis Pass">
          {genesis ? artwork : <div className={loading ? "genesis-placeholder skeleton" : "genesis-placeholder"}>D</div>}
        </button>
        <div className="genesis-copy">
          <span className="genesis-label">DROPROOM ORIGINAL</span>
          <h2>Genesis Pass</h2>
          <p>The one that started the room.<br />Be part of the first chapter.</p>
          <div className="genesis-progress-label"><strong>{genesis ? `${genesis.minted} / ${genesis.edition}` : "—"}</strong><span>collected</span></div>
          <div className="progress-track"><span style={{width: `${genesis ? Math.min(100, genesis.minted / genesis.edition * 100) : 0}%`}} /></div>
          <button className="primary-button" disabled={!genesis} onClick={onOpen} type="button">{!genesis ? loading ? "Loading Genesis…" : "Genesis unavailable" : soldOut ? "View Genesis" : "Collect Genesis"}<span aria-hidden="true">↗</span></button>
          <small>{genesis ? `${genesis.isFree ? "Free mint" : `${genesis.price} ETH`} · Network gas applies` : "Always at the front of the room"}</small>
        </div>
      </div>
    </article>
  </section>;
}

export function RoomDock({ view, onExplore, onCreate, onLibrary }: { view: string; onExplore: () => void; onCreate: () => void; onLibrary: () => void }) {
  return <nav className="room-dock" aria-label="Quick navigation">
    <button type="button" aria-current={view === "explore" ? "page" : undefined} onClick={onExplore}><RoomIcon name="explore" /><span>Explore</span></button>
    <button type="button" aria-current={view === "create" ? "page" : undefined} onClick={onCreate}><RoomIcon name="create" /><span>Create</span></button>
    <button type="button" aria-current={view === "library" ? "page" : undefined} onClick={onLibrary}><RoomIcon name="library" /><span>My collection</span></button>
  </nav>;
}

export function DropDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previousOverflow = document.body.style.overflow;
    element?.showModal();
    document.body.style.overflow = "hidden";
    return () => { element?.close(); document.body.style.overflow = previousOverflow; };
  }, []);
  return <dialog ref={dialog} className="room-dialog" aria-label={title} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="room-dialog-inner">
      <div className="room-dialog-bar"><span>INSIDE THE DROP</span><button type="button" onClick={onClose} aria-label="Close drop details">Close <span aria-hidden="true">×</span></button></div>
      {children}
    </div>
  </dialog>;
}
