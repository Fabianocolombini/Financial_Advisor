export function GoogleSetupHelp() {
  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
      <p className="font-medium text-zinc-900 dark:text-zinc-50">
        Ativar login com Google
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>
          Abra{" "}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline dark:text-blue-400"
          >
            Google Cloud → Credenciais
          </a>{" "}
          (projeto com OAuth consent screen configurado).
        </li>
        <li>
          Crie <strong>ID do cliente OAuth</strong> → tipo{" "}
          <strong>Aplicativo da Web</strong>.
        </li>
        <li>
          Em <strong>URIs de redirecionamento autorizados</strong>, adicione
          exatamente:
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 font-mono text-xs dark:bg-zinc-950">
            http://localhost:3000/api/auth/callback/google
          </code>
          <span className="mt-2 block text-xs text-zinc-500">
            Na Vercel, inclua também a URL do deploy + o mesmo caminho{" "}
            <code className="font-mono">/api/auth/callback/google</code>.
          </span>
        </li>
        <li>
          Copie o <strong>ID do cliente</strong> e a <strong>chave secreta</strong>{" "}
          para <code className="font-mono text-xs">AUTH_GOOGLE_ID</code> e{" "}
          <code className="font-mono text-xs">AUTH_GOOGLE_SECRET</code> no{" "}
          <code className="font-mono text-xs">.env.local</code> e reinicie{" "}
          <code className="font-mono text-xs">npm run dev</code>.
        </li>
      </ol>
      <p className="mt-3 text-xs text-zinc-500">
        Guia completo no repositório:{" "}
        <code className="font-mono">docs/SETUP.md</code> (seção Google OAuth).
      </p>
    </div>
  );
}
