export function GoogleSetupHelp() {
  return (
    <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-300">
      <p className="font-medium text-zinc-900 dark:text-zinc-50">
        Enable Google sign-in
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-5">
        <li>
          Open{" "}
          <a
            href="https://console.cloud.google.com/apis/credentials"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline dark:text-blue-400"
          >
            Google Cloud → Credentials
          </a>{" "}
          (project with the OAuth consent screen configured).
        </li>
        <li>
          Create an <strong>OAuth client ID</strong> → type{" "}
          <strong>Web application</strong>.
        </li>
        <li>
          Under <strong>Authorized redirect URIs</strong>, add exactly:
          <code className="mt-1 block break-all rounded bg-white px-2 py-1 font-mono text-xs dark:bg-zinc-950">
            http://localhost:3000/api/auth/callback/google
          </code>
          <span className="mt-2 block text-xs text-zinc-500">
            On Vercel, also include the deploy URL + the same path{" "}
            <code className="font-mono">/api/auth/callback/google</code>.
          </span>
        </li>
        <li>
          Copy the <strong>Client ID</strong> and the <strong>client secret</strong>{" "}
          into <code className="font-mono text-xs">AUTH_GOOGLE_ID</code> and{" "}
          <code className="font-mono text-xs">AUTH_GOOGLE_SECRET</code> in{" "}
          <code className="font-mono text-xs">.env.local</code> and restart{" "}
          <code className="font-mono text-xs">npm run dev</code>.
        </li>
      </ol>
      <p className="mt-3 text-xs text-zinc-500">
        Full guide in the repository:{" "}
        <code className="font-mono">docs/SETUP.md</code> (Google OAuth section).
      </p>
    </div>
  );
}
