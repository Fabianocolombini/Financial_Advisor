import { describe, expect, it } from "vitest";
import {
  hasDeliverableEmail,
  isDigestMailRecipient,
  shouldSkipDigestSend,
} from "@/lib/homing/digest-mail";

describe("digest mail protocol", () => {
  it("requires an explicit allow and a real email", () => {
    expect(
      isDigestMailRecipient({
        dailyDigestEmail: true,
        email: "colombini.fb@gmail.com",
      }),
    ).toBe(true);
    expect(
      isDigestMailRecipient({
        dailyDigestEmail: false,
        email: "colombini.fb@gmail.com",
      }),
    ).toBe(false);
    expect(isDigestMailRecipient({ dailyDigestEmail: true, email: null })).toBe(
      false,
    );
  });

  it("does not mail the local dev placeholder address", () => {
    expect(hasDeliverableEmail("dev@local.financial-advisor")).toBe(false);
  });

  it("retries when the last attempt never delivered", () => {
    expect(shouldSkipDigestSend(null)).toBe(false);
  });

  it("skips only after a successful send inside the window", () => {
    const now = new Date("2026-08-19T21:30:00.000Z");
    expect(
      shouldSkipDigestSend(new Date("2026-08-19T18:00:00.000Z"), now),
    ).toBe(true);
    expect(
      shouldSkipDigestSend(new Date("2026-08-18T12:00:00.000Z"), now),
    ).toBe(false);
  });
});
