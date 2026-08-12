/**
 * Optional daily email. Uses Resend when RESEND_API_KEY is set; otherwise the
 * cron still writes the in-app alert and the dock shows it as a badge.
 */

export async function sendWalletAlertEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<{ sent: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.WALLET_ALERT_FROM?.trim() || "My Wallet <noreply@financial-advisor.local>";
  if (!key) return { sent: false };

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      return { sent: false, error: body.slice(0, 300) };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "send failed" };
  }
}
