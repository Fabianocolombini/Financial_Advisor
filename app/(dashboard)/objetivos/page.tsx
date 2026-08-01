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
        <h1 className="font-title text-2xl tracking-tight text-white">Goals</h1>
        <p className="font-body mt-2 max-w-2xl text-zinc-400">
          Financial goals linked to your account.
        </p>
      </div>

      <AddGoalForm />

      <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
        {goals.length === 0 ? (
          <li className="p-4 text-sm text-zinc-500">No goals yet.</li>
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
