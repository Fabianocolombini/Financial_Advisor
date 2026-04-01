import { auth } from "@/auth";
import { AddBalanceItemForm } from "@/components/forms/AddBalanceItemForm";
import { DeleteApiButton } from "@/components/forms/DeleteApiButton";
import { formatBRL } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export default async function PatrimonioPage() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const items = await prisma.balanceItem.findMany({
    where: { userId: session.user.id },
    orderBy: [{ kind: "asc" }, { label: "asc" }],
  });

  let assets = new Prisma.Decimal(0);
  let liabilities = new Prisma.Decimal(0);
  for (const item of items) {
    if (item.kind === "ASSET") assets = assets.add(item.amount);
    else liabilities = liabilities.add(item.amount);
  }
  const net = assets.sub(liabilities);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Patrimônio
        </h1>
        <p className="mt-2 max-w-2xl text-zinc-600 dark:text-zinc-400">
          Ativos e passivos. Patrimônio líquido:{" "}
          <strong className="text-zinc-900 dark:text-zinc-50">
            {formatBRL(net.toNumber())}
          </strong>
        </p>
      </div>

      <AddBalanceItemForm />

      <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
        {items.length === 0 ? (
          <li className="p-4 text-sm text-zinc-500 dark:text-zinc-400">
            Nenhum item cadastrado.
          </li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 p-4"
            >
              <div>
                <p className="font-medium text-zinc-900 dark:text-zinc-50">
                  {item.label}
                </p>
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {item.kind === "ASSET" ? "Ativo" : "Passivo"} ·{" "}
                  {formatBRL(item.amount.toNumber())}
                </p>
              </div>
              <DeleteApiButton url={`/api/balance-items/${item.id}`} />
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
