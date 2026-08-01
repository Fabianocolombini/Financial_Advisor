import Link from "next/link";
import type { ReactNode } from "react";
import { SymbolSearchTrigger } from "@/components/catalog/SymbolSearchTrigger";
import { SignOutButton } from "./SignOutButton";

const nav = [
  { href: "/", label: "Home" },
  { href: "/patrimonio", label: "Net Worth" },
  { href: "/objetivos", label: "Goals" },
  { href: "/orcamento", label: "Budget" },
  { href: "/mercado", label: "Markets" },
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
  const label = user.name ?? user.email ?? "Account";

  return (
    <div className="flex min-h-full flex-col bg-black text-white">
      <header className="sticky top-0 z-[60] border-b border-zinc-800 bg-black backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="font-title shrink-0 text-sm tracking-tight text-white"
            >
              Financial Advisor
            </Link>
            <div className="hidden min-w-0 flex-1 sm:flex">
              <SymbolSearchTrigger />
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span
                className="hidden max-w-[12rem] truncate text-xs text-zinc-500 lg:inline"
                title={user.email ?? undefined}
              >
                {label}
              </span>
              {showSignOut ? <SignOutButton /> : null}
            </div>
          </div>
          <div className="sm:hidden">
            <SymbolSearchTrigger />
          </div>
          <nav className="flex flex-wrap items-center gap-1 text-sm">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-2 py-1.5 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
