import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy | Atlas",
};

export default function PrivacidadePage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/auth/signin"
        className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-300"
      >
        ← Back
      </Link>
      <h1 className="mt-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Privacy and data
      </h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        <p>
          This app stores data you enter (goals, net worth, budget, and
          transactions) associated with your authentication account (Google
          OAuth). The data lives in the database provider configured by whoever
          operates the installation (for example PostgreSQL on Neon).
        </p>
        <p>
          We do not sell your data. Google sign-in follows Google and the OAuth
          provider policies. To exercise privacy rights (access, correction,
          deletion), contact whoever operates this instance of the app.
        </p>
        <p>
          Generic informational text — adjust it with your DPO and corporate
          policy before using it in production with external users.
        </p>
      </div>
    </div>
  );
}
