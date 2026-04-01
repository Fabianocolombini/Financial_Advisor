import { auth } from "@/auth";
import { AddGoalForm } from "@/components/forms/AddGoalForm";
import { DeleteApiButton } from "@/components/forms/DeleteApiButton";
import { formatBRL } from "@/lib/format";
import { prisma } from "@/lib/prisma";

export default async function ObjetivosPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const goals = await prisma.goal.findMany({
    where: { userId: session.user.id },
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
              className="flex flex-wrap items-center justify-between gap-2 p-4"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {g.title}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Alvo: {formatBRL(g.targetAmount.toNumber())}
                  {g.deadline
                    ? ` · até ${g.deadline.toLocaleDateString("pt-BR")}`
                    : ""}
                </p>
              </div>
              <DeleteApiButton url={`/api/goals/${g.id}`} />
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
