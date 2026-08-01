import type { MotorDashboardSnapshot } from "./snapshot-types";

const AS_OF_LABEL = "Previous day close (EOD)";

export function formatMotorAsOfDate(asOf: string): string {
  const d = new Date(`${asOf}T12:00:00`);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatMotorUpdatedAt(updatedAt: string): string {
  const d = new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return updatedAt;
  return d.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export function motorFreshnessLines(snapshot: MotorDashboardSnapshot | null): {
  primary: string | null;
  secondary: string | null;
} {
  if (!snapshot?.asOf) {
    return {
      primary: "Model not updated yet",
      secondary: "Daily run uses previous day close (EOD).",
    };
  }

  const asOfFormatted = formatMotorAsOfDate(snapshot.asOf);
  const primary = `Data as of ${asOfFormatted} · ${AS_OF_LABEL}`;

  let secondary: string | null = null;
  if (snapshot.updatedAt) {
    secondary = `Model updated ${formatMotorUpdatedAt(snapshot.updatedAt)} UTC`;
  }

  return { primary, secondary };
}
