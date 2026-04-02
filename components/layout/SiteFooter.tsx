import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-200 bg-zinc-50/80 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-400">
      <p className="mx-auto max-w-2xl px-4">
        Financial Advisor é uma ferramenta de organização financeira pessoal.{" "}
        <strong>Não constitui assessoria de investimentos</strong> nem
        recomendação de produtos financeiros regulados pela CVM ou outros
        órgãos. Use por sua conta e risco.
      </p>
      <nav className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/legal/privacidade" className="underline hover:text-zinc-800 dark:hover:text-zinc-200">
          Privacidade
        </Link>
        <Link href="/legal/termos" className="underline hover:text-zinc-800 dark:hover:text-zinc-200">
          Termos
        </Link>
      </nav>
    </footer>
  );
}
