import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-800 bg-black py-6 text-center text-xs text-zinc-500">
      <p className="mx-auto max-w-2xl px-4">
        Financial Advisor is a personal finance organization tool.{" "}
        <strong>It is not regulated investment advice</strong> or a recommendation
        of financial products. Use at your own risk.
      </p>
      <nav className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/legal/privacidade" className="underline hover:text-zinc-300">
          Privacy
        </Link>
        <Link href="/legal/termos" className="underline hover:text-zinc-300">
          Terms
        </Link>
      </nav>
    </footer>
  );
}
