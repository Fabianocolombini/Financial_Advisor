import { AddBalanceItemForm } from "@/components/forms/AddBalanceItemForm";
import { DeleteApiButton } from "@/components/forms/DeleteApiButton";
import { EditBalanceItemRow } from "@/components/forms/EditBalanceItemRow";
import { formatBRL } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { getServerUserId } from "@/lib/server-user";
import { Prisma } from "@prisma/client";

export default async function PatrimonioPage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const items = await prisma.balanceItem.findMany({
    where: { userId },
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
        <h1 className="font-title text-2xl tracking-tight text-white">Net Worth</h1>
        <p className="font-body mt-2 max-w-2xl text-zinc-400">
          Assets and liabilities. Net worth:{" "}
          <strong className="text-white">{formatBRL(net.toNumber())}</strong>
        </p>
      </div>

      <AddBalanceItemForm />

      <ul className="divide-y divide-zinc-800 rounded-xl border border-zinc-800">
        {items.length === 0 ? (
          <li className="p-4 text-sm text-zinc-500">No items yet.</li>
        ) : (
          items.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-stretch justify-between gap-2"
            >
              <div className="min-w-0 flex-1">
                <EditBalanceItemRow
                  item={{
                    id: item.id,
                    label: item.label,
                    kind: item.kind,
                    amount: item.amount.toNumber(),
                  }}
                />
              </div>
              <div className="flex shrink-0 items-start p-4">
                <DeleteApiButton url={`/api/balance-items/${item.id}`} />
              </div>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
