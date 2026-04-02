import { AddGoalForm } from "@/components/forms/AddGoalForm";
import { DeleteApiButton } from "@/components/forms/DeleteApiButton";
import { EditGoalRow } from "@/components/forms/EditGoalRow";
import { prisma } from "@/lib/prisma";
import { getServerUserId } from "@/lib/server-user";

export default async function ObjetivosPage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const goals = await prisma.goal.findMany({
    where: { userId },
    orderBy: { deadline: "asc" },
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Objetivos
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
          Metas financeiras vinculadas à sua conta.
        </p>
      </div>

      <AddGoalForm />

      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {goals.length === 0 ? (
          <li className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
            Nenhuma meta ainda.
          </li>
        ) : (
          goals.map((g) => (
            <li
              key={g.id}
              className="flex flex-wrap items-stretch justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <EditGoalRow
                  goal={{
                    id: g.id,
                    title: g.title,
                    targetAmount: g.targetAmount.toNumber(),
                    deadline: g.deadline,
                  }}
                />
              </div>
              <div className="flex shrink-0 items-start p-4">
                <DeleteApiButton url={`/api/goals/${g.id}`} />
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
