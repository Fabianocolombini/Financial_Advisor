import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacidade | Financial Advisor",
};

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/auth/signin"
        className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-300"
      >
        ← Voltar
      </Link>
      <h1 className="mt-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Privacidade e dados
      </h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        <p>
          Este aplicativo armazena dados que você cadastra (metas, patrimônio,
          orçamento e transações) associados à sua conta de autenticação
          (Google OAuth). Os dados ficam no provedor de banco de dados
          configurado pelo responsável pela instalação (por exemplo PostgreSQL
          na Neon).
        </p>
        <p>
          Não vendemos seus dados. O uso do login Google segue as políticas do
          Google e do provedor OAuth. Para exercer direitos previstos na LGPD
          (acesso, correção, exclusão), entre em contato com quem opera esta
          instância do aplicativo.
        </p>
        <p>
          Texto informativo genérico — ajuste conforme seu DPO e política
          corporativa antes de uso em produção com usuários externos.
        </p>
      </div>
    </div>
  );
}
