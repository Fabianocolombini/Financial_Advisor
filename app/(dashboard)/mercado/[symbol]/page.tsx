import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { SymbolDetailPanel } from "@/components/symbol/SymbolDetailPanel";
import { loadSymbolDetailView } from "@/lib/motor/load-symbol-detail";
import { getServerUserId } from "@/lib/server-user";

export default async function SymbolMercadoPage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const userId = await getServerUserId();
  if (!userId) return null;

  const { symbol } = await params;
  const detail = await loadSymbolDetailView(userId, symbol);
  if (!detail) notFound();

  return (
    <div className="space-y-4">
      <Link
        href="/mercado"
        className="text-sm text-zinc-500 hover:text-zinc-300"
      >
        ← Markets
      </Link>
      <Suspense
        fallback={
          <p className="text-sm text-zinc-500">Loading name detail…</p>
        }
      >
        <SymbolDetailPanel detail={detail} />
      </Suspense>
    </div>
  );
}
