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
    text: "Where the class is heading. Increase = the wind is at your back, it makes sense to put more money here. Hold = no defined direction, keep what you already have without adding faster. Reduce = the trend turned against you — that does not mean it already lost money, it means the direction changed. Reduce hard = cut the exposure.",
  },
  {
    term: "New money",
    text: "Whether it is worth putting new money into this name now. Can add = the class is favorable and the name ranks among the best in the group. Wait = it is eligible, but confirmation is missing. Do not add = the model advises against entering now (existing holders do not necessarily need to sell because of that). Indifferent = it is a cash reserve, where there is no good or bad entry moment.",
  },
  {
    term: "Main factor",
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
