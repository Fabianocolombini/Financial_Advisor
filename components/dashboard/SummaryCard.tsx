export function SummaryCard({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className="rounded-xl border border-zinc-800 bg-zinc-950 p-5">
      <h2 className="font-body text-xs uppercase tracking-wide text-zinc-500">
        {title}
      </h2>
      <p className="font-title mt-2 text-2xl tabular-nums text-white">{value}</p>
      {hint ? (
        <p className="font-body mt-2 text-sm text-zinc-400">{hint}</p>
      ) : null}
    </article>
  );
}
