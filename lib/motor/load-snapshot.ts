import type { MotorDashboardSnapshot } from "./snapshot-types";
import { head } from "@vercel/blob";
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
      const meta = await head(BLOB_PATH, { token });
      const res = await fetch(meta.url, { next: { revalidate: 300 } });
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
