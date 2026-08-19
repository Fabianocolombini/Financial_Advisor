import { HomingView } from "@/components/homing/HomingView";
import { loadHomingView } from "@/lib/homing/load-homing";
import { getServerUserId } from "@/lib/server-user";

export const dynamic = "force-dynamic";

export default async function HomingPage() {
  const userId = await getServerUserId();
  if (!userId) return null;

  const { view, snapshot } = await loadHomingView(userId);
  return <HomingView view={view} snapshot={snapshot} />;
}
