"use client";

/**
 * Reading guide for the market table.
 *
 * Every column here answers a different question, and two of them used to be
 * named after the model's internals ("Stage", "Entry / Validated") rather than
 * after the question. This panel states the question each column answers, so the
 * table can be read without knowing how the motor works.
 */

const ENTRIES: { term: string; text: string }[] = [
  {
    term: "Score",
    text: "Where this name sits in its own class ranking, from 0 to 1. 0.5 is the median name in the group; the higher it is, the better it compares with direct peers. It does not compare different classes — a high cash score does not make it better than a stock with a similar score. Open “How the score is calculated” under each table to see that class's ingredients.",
  },
  {
    term: "Volume 15d",
    text: "How many shares, on average, traded per day over the last 15 sessions, and how much that is of the class volume. It is the mass actually traded: high volume means you can enter and exit without moving the price.",
  },
  {
    term: "Trend",
    text: "This name's own stage from its Security Score, not the sleeve. ↑ = increase, ● = hold, ↓ = reduce, ⇊ = reduce hard. Hover the symbol for the full sentence. The sleeve is the “The whole class” line above the table.",
  },
  {
    term: "Money",
    text: "+ can add, × do not add, … wait, ~ indifferent. Money answers “may I add new cash?”, not “will the price go up?”. … plus a green 7D is still Wait — do not treat it as a buy. Gain (green) is the name vs its peers, 0–100. Risk (red) mixes the sleeve climate (70%) with how weak the name is (30%). A Gain of 56 can still be × when the class is Reduce hard — new money would fight the sleeve.",
  },
  {
    term: "Score mix / pillars",
    text: "Each class has a fixed recipe (weights under the class title and on each pillar header). The cell is the 0–1 peer rank that actually enters the score, stacked on Adds / Neutral / Drags. Adds ≥ 0.65 (this pillar lifts the score), Neutral is the median, Drags < 0.35 (this is where the name is failing).",
  },
  {
    term: "Factor",
    text: "The ingredient that weighed most on this name's score today — the number-one reason it sits where it does in the ranking.",
  },
];

export function TableLegend() {
  return (
    <details className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
      <summary className="cursor-pointer text-xs text-zinc-400 hover:text-zinc-200">
        How to read this table
      </summary>

      <dl className="mt-3 space-y-2.5">
        {ENTRIES.map((e) => (
          <div key={e.term}>
            <dt className="text-xs font-medium text-zinc-200">{e.term}</dt>
            <dd className="text-[11px] leading-relaxed text-zinc-500">{e.text}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-600">
        Inside each class, names are ordered from highest to lowest score.
        Scores are recalculated every day for the most liquid names (~90% of
        class volume); a symbol newly marked with ★ is scored on demand and
        appears after 1–2 minutes.
      </p>
    </details>
  );
}
