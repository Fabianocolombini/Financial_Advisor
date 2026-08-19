const RECENT_MS = 20 * 60 * 60 * 1000;

export function hasDeliverableEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.includes("@") && !email.endsWith("@local.financial-advisor"));
}

export function isDigestMailRecipient(user: {
  dailyDigestEmail: boolean;
  email: string | null | undefined;
}): boolean {
  return user.dailyDigestEmail && hasDeliverableEmail(user.email);
}

/** Skip only after a successful send. Failed attempts must retry. */
export function shouldSkipDigestSend(
  lastEmailedAt: Date | null | undefined,
  now = new Date(),
): boolean {
  if (lastEmailedAt == null) return false;
  return now.getTime() - lastEmailedAt.getTime() < RECENT_MS;
}
