"use client";

import { useEffect, useState } from "react";
import type { Address } from "viem";
import { readCreatorGate, type CreatorGate } from "@/lib/contract/creator-gate";

export function CreatorGateNotice({ account }: { account: Address | null }) {
  const [result, setResult] = useState<{ account: Address; gate?: CreatorGate; failed?: boolean } | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    setResult(null);
    void readCreatorGate(account).then(
      (gate) => { if (!cancelled) setResult({ account, gate }); },
      () => { if (!cancelled) setResult({ account, failed: true }); }
    );
    return () => { cancelled = true; };
  }, [account, retry]);

  const current = result?.account === account ? result : null;
  return (
    <aside className="creator-gate" aria-live="polite">
      <div>
        <span className="eyebrow">Your next drop</span>
        <strong>{!account ? "Create a draft. Connect when you’re ready." : !current ? "Checking your drops on Base…" : current.failed ? "We couldn’t check your drops." : current.gate?.blockingTokenId ? `Finish drop #${current.gate.blockingTokenId} first` : "You’re ready to publish a new drop."}</strong>
        <p>{current?.gate?.blockingTokenId ? `${current.gate.minted} of ${current.gate.edition} editions collected. You can prepare a draft now; publishing unlocks when your existing drop sells out.` : "One unfinished drop per wallet. We check the chain again before publishing."}</p>
      </div>
      {account ? <button className="secondary-button" type="button" onClick={() => setRetry((value) => value + 1)} disabled={!current}>Check again</button> : null}
    </aside>
  );
}
