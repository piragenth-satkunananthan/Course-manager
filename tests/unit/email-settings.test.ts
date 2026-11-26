import { describe, expect, it } from "vitest";
import { alertEmailed, ALERT_GROUPS, recipient } from "@/server/domain/email-settings";

describe("who emails go to (#82, U46)", () => {
  it("goes to the confirmed address, else the login email; an unconfirmed one is never used", () => {
    expect(recipient({ email: "login@example.com", notifyEmail: null })).toBe("login@example.com");
    expect(recipient({ email: "login@example.com", notifyEmail: "inbox@example.com" })).toBe("inbox@example.com");
  });
});

describe("which alerts email the Student (#82, U46)", () => {
  it("can turn off WhatsApp, AI and too-many-changes alerts", () => {
    expect(alertEmailed("whatsapp_logged_out", ["whatsapp"])).toBe(false);
    expect(alertEmailed("whatsapp_mismatch", ["whatsapp"])).toBe(false);
    expect(alertEmailed("ai_outage", ["ai"])).toBe(false);
    expect(alertEmailed("ai_auth", ["ai"])).toBe(false);
    expect(alertEmailed("ai_overflow", ["overflow"])).toBe(false);
    expect(alertEmailed("ai_outage", ["whatsapp"])).toBe(true);
  });

  it("never turns off 'a reminder couldn't be sent'", () => {
    expect(alertEmailed("final_reminder_undeliverable", ["whatsapp", "ai", "overflow"])).toBe(true);
    expect(Object.keys(ALERT_GROUPS)).toEqual(["whatsapp", "ai", "overflow"]);
  });
});
