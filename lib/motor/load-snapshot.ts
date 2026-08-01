import type { MotorDashboardSnapshot } from "./snapshot-types";
import { readFile } from "fs/promises";
import path from "path";

const BLOB_PATH = process.env.MOTOR_SNAPSHOT_BLOB_PATH ?? "motor/dashboard-snapshot.json";
const LOCAL_PATH = path.join(
  process.cwd(),
  "motor/data/dashboard-snapshot.json",
);

export async function loadMotorDashboardSnapshot(): Promise<MotorDashboardSnapshot | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (token) {
    try {
      const res = await fetch(`https://blob.vercel-storage.com/${BLOB_PATH}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "x-api-version": "7",
        },
        next: { revalidate: 300 },
      });
      if (res.ok) {
        return (await res.json()) as MotorDashboardSnapshot;
      }
    } catch {
      // fall through to local file
    }
  }

  try {
    const raw = await readFile(LOCAL_PATH, "utf-8");
    return JSON.parse(raw) as MotorDashboardSnapshot;
  } catch {
    return null;
  }
}
