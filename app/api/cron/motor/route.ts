import { unauthorizedCronResponse } from "@/lib/cron-auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * Dispara o workflow GitHub Actions `motor-daily.yml` (ingestão + pipeline Python).
 * O motor não roda na Vercel — apenas orquestra via GitHub API.
 *
 * Auth: `Authorization: Bearer $CRON_SECRET`
 * Secrets Vercel: `GITHUB_MOTOR_DISPATCH_TOKEN`, `GITHUB_REPO` (ex. `owner/repo`)
 */
export async function GET(request: Request) {
  const denied = unauthorizedCronResponse(request);
  if (denied) return denied;

  const token = process.env.GITHUB_MOTOR_DISPATCH_TOKEN;
  const repo = process.env.GITHUB_REPO;
  if (!token || !repo) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Configure GITHUB_MOTOR_DISPATCH_TOKEN e GITHUB_REPO na Vercel para disparar o workflow.",
        hint: "O schedule principal está em .github/workflows/motor-daily.yml (06:00 UTC).",
      },
      { status: 503 },
    );
  }

  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    return NextResponse.json(
      { ok: false, error: "GITHUB_REPO inválido — use formato owner/repo" },
      { status: 500 },
    );
  }

  const url = `https://api.github.com/repos/${owner}/${name}/actions/workflows/motor-daily.yml/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: "main" }),
  });

  if (!res.ok) {
    const body = await res.text();
    return NextResponse.json(
      {
        ok: false,
        error: `GitHub API ${res.status}`,
        detail: body.slice(0, 500),
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "Workflow motor-daily disparado",
    repo,
    workflow: "motor-daily.yml",
  });
}
