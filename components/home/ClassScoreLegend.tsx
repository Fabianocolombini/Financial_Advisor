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
        Como o score de {label} é calculado
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
        Cada ingrediente vira uma nota de 0 a 1 comparando este papel com os outros
        da mesma classe no mesmo dia, e o score é a média ponderada dessas notas.
        Por isso <span className="text-zinc-300">0,5 é o papel mediano do grupo</span>{" "}
        e o score só faz sentido dentro da própria classe: 0,62 em {label} e 0,62 em
        outra classe não dizem qual das duas é o melhor lugar para o seu dinheiro —
        isso é o papel da linha “A classe inteira”.
      </p>
    </details>
  );
}
