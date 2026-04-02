import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos | Financial Advisor",
};

export default function TermosPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/auth/signin"
        className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-300"
      >
        ← Voltar
      </Link>
      <h1 className="mt-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Termos de uso
      </h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        <p>
          O Financial Advisor é oferecido como ferramenta de apoio à
          organização financeira. Os cálculos e exibições dependem dos dados
          que você informa e podem conter erros.
        </p>
        <p>
          <strong>Não somos instituição financeira nem assessores de
          investimento.</strong> Nada neste app deve ser interpretado como
          oferta de valores mobiliários, consultoria de investimentos ou
          planejamento tributário profissional.
        </p>
        <p>
          O uso é por sua conta e risco. Revise este texto com assessoria
          jurídica antes de disponibilizar o serviço ao público.
        </p>
      </div>
    </div>
  );
}
