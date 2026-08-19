import type { MotorDashboardSnapshot } from "./snapshot-types";
import { head } from "@vercel/blob";
import { readFile } from "fs/promises";
import path from "path";

const BLOB_PATH = process.env.MOTOR_SNAPSHOT_BLOB_PATH ?? "motor/dashboard-snapshot.json";
const PREV_BLOB_PATH = "motor/dashboard-snapshot.prev.json";
const LOCAL_PATH = path.join(
  process.cwd(),
  "motor/data/dashboard-snapshot.json",
);
const LOCAL_PREV_PATH = path.join(
  process.cwd(),
  "motor/data/dashboard-snapshot.prev.json",
);

async function loadSnapshotFromBlob(
  blobPath: string,
): Promise<MotorDashboardSnapshot | null> {
  const token = process.env.BLOB_READ_WRITE_TOKEN?.trim();
  if (!token) return null;
  try {
    const meta = await head(blobPath, { token });
    const res = await fetch(meta.url, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as MotorDashboardSnapshot;
  } catch {
    return null;
  }
}

async function loadSnapshotFromFile(
  filePath: string,
): Promise<MotorDashboardSnapshot | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as MotorDashboardSnapshot;
  } catch {
    return null;
  }
}

export async function loadMotorDashboardSnapshot(): Promise<MotorDashboardSnapshot | null> {
  return (
    (await loadSnapshotFromBlob(BLOB_PATH)) ??
    (await loadSnapshotFromFile(LOCAL_PATH))
  );
}

export async function loadMotorPreviousSnapshot(): Promise<MotorDashboardSnapshot | null> {
  return (
    (await loadSnapshotFromBlob(PREV_BLOB_PATH)) ??
    (await loadSnapshotFromFile(LOCAL_PREV_PATH))
  );
}
