import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { SymbolSearchTrigger } from "@/components/catalog/SymbolSearchTrigger";
import { WalletDock } from "@/components/wallet/WalletDock";
import { APP_NAME } from "@/lib/brand";
import { SignOutButton } from "./SignOutButton";

const nav = [
  { href: "/homing", label: "Homing" },
  { href: "/markets", label: "Markets" },
  { href: "/wallet", label: "My Wallet" },
  { href: "/budget", label: "Budget" },
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
    <div className="flex min-h-full bg-black text-white">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-[100] border-b border-zinc-800 bg-black backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
            <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/homing"
              className="font-title flex shrink-0 items-center gap-1.5 text-sm tracking-tight text-white"
            >
              <Image
                src="/atlas-logo.jpg"
                alt=""
                width={24}
                height={24}
                className="h-6 w-6 rounded-full object-cover object-top"
              />
              {APP_NAME}
            </Link>
              <div className="hidden min-w-0 flex-1 sm:flex">
                <SymbolSearchTrigger />
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Link
                  href="/wallet"
                  className="hidden rounded-md p-2 text-zinc-400 transition-colors hover:bg-zinc-900 hover:text-white sm:inline-flex"
                  title="My Wallet"
                  aria-label="My Wallet"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9.75A2.25 2.25 0 0018.75 7.5H5.25A2.25 2.25 0 003 9.75v2.25"
                    />
                  </svg>
                </Link>
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
      <WalletDock />
    </div>
  );
}
