import { auth } from "@/auth";
import { authEnabled } from "@/lib/auth-mode";
import { loadLandingView } from "@/lib/landing/load-view";
import { LandingView } from "@/components/landing/LandingView";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atlas",
  description:
    "Macro signals, technicals, and portfolio decisions across 17 asset classes.",
};

export default async function LandingPage() {
  const [data, session] = await Promise.all([loadLandingView(), auth()]);
  const googleConfigured =
    Boolean(process.env.AUTH_GOOGLE_ID) && Boolean(process.env.AUTH_GOOGLE_SECRET);

  return (
    <LandingView
      data={data}
      signedIn={Boolean(session?.user)}
      authEnabled={authEnabled}
      googleConfigured={googleConfigured}
    />
  );
}
