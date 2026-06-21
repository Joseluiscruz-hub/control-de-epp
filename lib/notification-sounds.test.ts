import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { notificationSoundPattern, type NotificationSoundType } from "./notification-sounds";

describe("notification sounds", () => {
  it("define un patron audible para cada tipo de alerta", () => {
    const types: NotificationSoundType[] = [
      "solped",
      "critical",
      "warning",
      "budget",
      "sync_error",
      "success",
    ];

    for (const type of types) {
      const pattern = notificationSoundPattern(type);
      assert.ok(pattern.length > 0);
      assert.ok(pattern.every((step) => step.frequency > 0 && step.durationMs > 0));
    }
  });
});
