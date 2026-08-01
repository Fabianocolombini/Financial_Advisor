import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-zinc-800 bg-black py-6 text-center text-xs text-zinc-500">
      <p className="mx-auto max-w-2xl px-4">
        Financial Advisor é uma ferramenta de organização financeira pessoal.{" "}
        <strong>Não constitui assessoria de investimentos</strong> nem
        recomendação de produtos financeiros regulados pela CVM ou outros
        órgãos. Use por sua conta e risco.
      </p>
      <nav className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1">
        <Link href="/legal/privacidade" className="underline hover:text-zinc-300">
          Privacidade
        </Link>
        <Link href="/legal/termos" className="underline hover:text-zinc-300">
          Termos
        </Link>
      </nav>
    </footer>
  );
}
