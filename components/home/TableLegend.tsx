"use client";

/**
 * Reading guide for the Markets table.
 * Two independent questions: is the name good (Score), and is it time to buy
 * (Trend, Money, To buy). A high score with Wait is not a contradiction.
 */

export function TableLegend() {
  return (
    <div className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
      <p className="text-xs leading-relaxed text-zinc-400">
        Two questions, kept apart on purpose.{" "}
        <span className="text-zinc-200">Score</span> = is this name good vs its
        peers?{" "}
        <span className="text-zinc-200">Trend, Money, To buy</span> = is it time
        to add cash? A top Score with Wait means the name is ready and the class
        is not — that is the system working, not a bug.
      </p>
      <ol className="list-decimal space-y-0.5 pl-4 text-[11px] leading-relaxed text-zinc-500">
        <li>
          <span className="text-zinc-300">Score</span> — is the name good?
        </li>
        <li>
          <span className="text-zinc-300">Trend</span> — which phase is it in?
          (the Score as a traffic light)
        </li>
        <li>
          <span className="text-zinc-300">Money</span> — does the system allow a
          buy now?
        </li>
        <li>
          <span className="text-zinc-300">To buy</span> — if not, how far, and
          is the name or the class the bottleneck?
        </li>
      </ol>

      <details className="pt-1">
        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-300">
          What each column means
        </summary>
        <dl className="mt-2.5 space-y-2.5">
          {ENTRIES.map((e) => (
            <div key={e.term}>
              <dt className="text-xs font-medium text-zinc-200">{e.term}</dt>
              <dd className="text-[11px] leading-relaxed text-zinc-500">{e.text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
          Names in each class are ordered from highest to lowest Score. A green
          1D or 7D is the market price, not an entry.
        </p>
      </details>
    </div>
  );
}

const ENTRIES: { term: string; text: string }[] = [
  {
    term: "Score",
    text: "A 0–1 grade vs the other names in this same class only (Treasuries vs Treasuries, never vs Cash or stocks). 0.65+ Among the best · 0.25–0.65 In the middle · below 0.25 Among the weakest. It is the rank in the class, not a buy signal.",
  },
  {
    term: "Trend",
    text: "The Score as a traffic light, not a second indicator. ↑ Increase = Score ≥ 0.65 · ● Hold = 0.25–0.65 · ↓ Reduce = below 0.25. This is this name’s phase. The line above the table (“The whole class”) is the sleeve, which can be Hold while this name is Increase.",
  },
  {
    term: "Money",
    text: "+ Can add — name and class are aligned. … Wait — the name is ready, the class has not given the signal yet. × Do not add — the class is unfavorable; existing holders do not have to sell just because of this. ~ Indifferent — Cash only; there is no price-timing for a cash reserve. Risk (0–100) is how tense the moment is, mostly the class climate. Low = calm, high = the sleeve is in a poor phase.",
  },
  {
    term: "To buy",
    text: "How far from a buy, and who is late. Smaller number = closer. 0.00 Can add = already a buy. Class = the name is ready, the asset class still has to improve. Name = the class is already favorable, this paper still has to rank better vs its peers. Blocked = the path is closed (class reducing, or the name is too weak) — not “almost there”. Watch = rare case: excellent name while the class is poor; not a buy, but worth watching.",
  },
  {
    term: "1D / 7D / 15D",
    text: "Price over the last 1, 7 and 15 sessions. Green is not a buy. A strong print with Money … or × is still Wait or Do not add.",
  },
  {
    term: "Vol 15d",
    text: "Average shares traded per day over 15 sessions, and this name’s share of the class volume on screen. Higher volume means you can enter and exit without moving the price.",
  },
  {
    term: "Factor",
    text: "Which ingredient weighed most on today’s Score — the number-one reason the name sits where it does.",
  },
];
