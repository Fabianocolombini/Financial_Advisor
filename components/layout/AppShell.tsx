import Link from "next/link";
import type { ReactNode } from "react";
import { SignOutButton } from "./SignOutButton";

const nav = [
  { href: "/", label: "Início" },
  { href: "/patrimonio", label: "Patrimônio" },
  { href: "/objetivos", label: "Objetivos" },
  { href: "/orcamento", label: "Orçamento" },
  { href: "/mercado", label: "Mercado" },
] as const;

type UserBar = {
  name?: string | null;
  email?: string | null;
};

export function AppShell({
  children,
  user,
  showSignOut = false,
}: {
  children: ReactNode;
  user: UserBar;
  showSignOut?: boolean;
}) {
  const label = user.name ?? user.email ?? "Conta";

  return (
    <div className="flex min-h-full flex-col">
      <header className="border-b border-zinc-200 bg-white/80 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/80">
        <div className="mx-auto flex min-h-14 w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-2 sm:px-6 sm:py-0">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50"
            >
              Financial Advisor
            </Link>
            <span
              className="hidden max-w-[12rem] truncate text-xs text-zinc-500 sm:inline dark:text-zinc-400"
              title={user.email ?? undefined}
            >
              {label}
            </span>
            {showSignOut ? <SignOutButton /> : null}
          </div>
          <nav className="flex flex-wrap items-center justify-end gap-1 text-sm sm:gap-3">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-1.5 text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-50"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
