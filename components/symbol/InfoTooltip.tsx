"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import glossary from "@/lib/motor/indicator-glossary.json";
import {
  getGlossaryEntry,
  type GlossaryEntry,
} from "@/lib/motor/glossary-lookup";

export type GlossaryTerm = keyof typeof glossary;

function GlossaryBody({ entry }: { entry: GlossaryEntry }) {
  if (typeof entry === "string") return <>{entry}</>;
  return (
    <>
      <p>{entry.meaning}</p>
      <p className="mt-1.5">
        <span className="font-medium text-zinc-100">How to read: </span>
        {entry.read}
      </p>
    </>
  );
}

export function InfoTooltip({
  term,
  className = "",
}: {
  term: GlossaryTerm | string;
  className?: string;
}) {
  const entry = getGlossaryEntry(term);
  const panelId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = rootRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(288, window.innerWidth - 16);
      const left = Math.min(Math.max(8, r.left), window.innerWidth - width - 8);
      setPos({ top: r.bottom + 8, left });
    };
    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  if (!entry) return null;

  const label = String(term).replace(/_/g, " ");

  return (
    <span ref={rootRef} className={`relative inline-flex ${className}`}>
      <button
        type="button"
        aria-label={`What ${label} means and how to read it`}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-zinc-600 text-[10px] leading-none text-zinc-400 transition-colors hover:border-zinc-400 hover:text-zinc-200"
      >
        i
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <span
              ref={panelRef}
              id={panelId}
              role="tooltip"
              style={{ top: pos.top, left: pos.left }}
              className="fixed z-[300] w-72 max-w-[calc(100vw-1rem)] rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-[11px] leading-snug text-zinc-300 shadow-lg"
            >
              <GlossaryBody entry={entry} />
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}

export function IndicatorNameWithInfo({
  id,
  name,
  extra,
}: {
  id: string;
  name: string;
  extra?: ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <span>{name}</span>
      <InfoTooltip term={id} />
      {extra}
    </span>
  );
}
