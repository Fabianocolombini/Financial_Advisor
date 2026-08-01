"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/auth/signin" })}
      className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-900 hover:text-white"
    >
      Sair
    </button>
  );
}
