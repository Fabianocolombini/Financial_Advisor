"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteApiButton({
  url,
  label = "Remover",
}: {
  url: string;
  label?: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (!confirm("Remover este registro?")) return;
    setPending(true);
    await fetch(url, { method: "DELETE" });
    setPending(false);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="text-xs text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
    >
      {pending ? "…" : label}
    </button>
  );
}
