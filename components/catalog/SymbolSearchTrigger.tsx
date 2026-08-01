"use client";

import { useEffect, useState } from "react";
import { SymbolSearchModal } from "./SymbolSearchModal";

export function SymbolSearchTrigger() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-full border border-zinc-800 bg-zinc-950 px-4 py-2 text-left text-sm text-zinc-500 transition-colors hover:border-zinc-700 hover:text-zinc-400 sm:max-w-md"
      >
        <svg
          className="h-4 w-4 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <span className="truncate">Symbol, ISIN or CUSIP</span>
        <kbd className="ml-auto hidden rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-600 sm:inline">
          ⌘K
        </kbd>
      </button>
      <SymbolSearchModal open={open} onClose={() => setOpen(false)} />
    </>
  );
}
