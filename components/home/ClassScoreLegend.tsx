"use client";

import { scoreRecipeFor } from "@/lib/motor/score-recipes";

/**
 * The score's recipe, per class.
 *
 * Without this the score is a number with no units: the reader can see that 0.62
 * beats 0.46 but not what either one measures, and has no way to know the value
 * is a rank inside the class rather than an absolute grade.
 */
export function ClassScoreLegend({
  classId,
  label,
}: {
  classId: string;
  label: string;
}) {
  const recipe = scoreRecipeFor(classId);
  if (!recipe) return null;

  return (
    <details className="rounded-lg border border-zinc-800 bg-black px-3 py-2">
      <summary className="cursor-pointer text-[11px] text-zinc-500 hover:text-zinc-300">
        How the {label} score is calculated
      </summary>

      <p className="mt-2 text-xs text-zinc-400">{recipe.headline}</p>

      <ul className="mt-2 space-y-1">
        {recipe.ingredients.map((ing) => (
          <li key={ing.label} className="flex gap-2 text-[11px] text-zinc-500">
            <span className="w-10 shrink-0 tabular-nums text-zinc-400">
              {(ing.weight * 100).toFixed(0)}%
            </span>
            <span>
              <span className="text-zinc-300">{ing.label}</span> — {ing.meaning}
            </span>
          </li>
        ))}
      </ul>

      <p className="mt-2 text-[11px] text-zinc-500">
        Each ingredient becomes a 0-to-1 grade comparing this name with the others
        in the same class on the same day, and the score is the weighted average of
        those grades. That is why <span className="text-zinc-300">0.5 is the median name in the group</span>{" "}
        and the score only makes sense inside its own class: 0.62 in {label} and 0.62 in
        another class do not say which of the two is the better place for your money —
        that is the job of the “The whole class” line.
      </p>
    </details>
  );
}
