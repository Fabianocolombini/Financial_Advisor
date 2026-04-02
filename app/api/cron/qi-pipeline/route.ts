import { spawnSync } from "child_process";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Optional full QI pipeline (Python): ingest → universe → analysis.
 * Requires Python + `analytics/requirements.txt` on the host.
 *
 * - Auth: `Authorization: Bearer $CRON_SECRET`
 * - Enable: `QI_RUN_PYTHON=true`
 * - Binary: `QI_PYTHON_BIN` (default `python3`)
 * - Job: `QI_JOB` = `ingest` | `universe` | `analysis` | `all` (default `all`)
 *
 * On Vercel serverless, Python is usually unavailable — run jobs via GitHub Actions,
 * a small VM, or locally: `npm run qi:ingest` etc.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  if (process.env.QI_RUN_PYTHON !== "true") {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: "Set QI_RUN_PYTHON=true to spawn Python jobs from this route.",
    });
  }

  const root = process.cwd();
  const analyticsDir = `${root}/analytics`;
  const py = process.env.QI_PYTHON_BIN || "python3";
  const job = process.env.QI_JOB || "all";
  const modules: string[] =
    job === "ingest"
      ? ["qi.jobs.run_ingest_daily"]
      : job === "universe"
        ? ["qi.jobs.run_universe_weekly"]
        : job === "analysis"
          ? ["qi.jobs.run_analysis"]
          : [
              "qi.jobs.run_ingest_daily",
              "qi.jobs.run_universe_weekly",
              "qi.jobs.run_analysis",
            ];

  const env = {
    ...process.env,
    PYTHONPATH: analyticsDir,
  };

  const results: {
    module: string;
    status: number | null;
    error?: string;
    stdout: string;
    stderr: string;
  }[] = [];

  for (const mod of modules) {
    const r = spawnSync(py, ["-m", mod], {
      cwd: root,
      env,
      encoding: "utf-8",
      maxBuffer: 10 * 1024 * 1024,
    });
    results.push({
      module: mod,
      status: r.status,
      error: r.error?.message,
      stdout: (r.stdout ?? "").slice(0, 8000),
      stderr: (r.stderr ?? "").slice(0, 8000),
    });
  }

  const ok = results.every((x) => x.status === 0);
  return NextResponse.json({ ok, results }, { status: ok ? 200 : 500 });
}
