/**
 * Dispatch GitHub Actions motor-symbol workflow when user stars a symbol.
 */

export async function dispatchMotorSymbol(
  symbol: string,
  classId: string,
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.GITHUB_MOTOR_DISPATCH_TOKEN?.trim();
  const repo = process.env.GITHUB_REPO?.trim();
  if (!token || !repo) {
    return {
      ok: false,
      error: "Motor on-demand not configured (GITHUB_MOTOR_DISPATCH_TOKEN / GITHUB_REPO)",
    };
  }

  const [owner, name] = repo.split("/");
  if (!owner || !name) {
    return { ok: false, error: "Invalid GITHUB_REPO" };
  }

  const normalized = symbol.trim().toUpperCase();
  const url = `https://api.github.com/repos/${owner}/${name}/actions/workflows/motor-symbol.yml/dispatches`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ref: "main",
      inputs: {
        symbol: normalized,
        class_id: classId,
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return {
      ok: false,
      error: `GitHub dispatch ${res.status}: ${detail.slice(0, 300)}`,
    };
  }

  return { ok: true };
}
