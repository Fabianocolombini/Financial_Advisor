import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms | Atlas",
};

export default function TermosPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <Link
        href="/auth/signin"
        className="text-sm text-zinc-500 underline hover:text-zinc-800 dark:hover:text-zinc-300"
      >
        ← Back
      </Link>
      <h1 className="mt-6 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
        Terms of use
      </h1>
      <div className="mt-6 space-y-4 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
        <p>
          Atlas is offered as a tool to help with personal financial
          organization. Calculations and displays depend on the data you enter
          and may contain errors.
        </p>
        <p>
          <strong>We are not a financial institution or investment
          advisers.</strong> Nothing in this app should be interpreted as an
          offer of securities, investment advice, or professional tax planning.
        </p>
        <p>
          Use is at your own risk. Review this text with legal counsel before
          making the service available to the public.
        </p>
      </div>
    </div>
  );
}
