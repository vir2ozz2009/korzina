import { afterEach, beforeEach, vi } from "vitest";

export function beforeFrozenClock() {
  beforeEach(() => vi.useFakeTimers({ now: new Date("2026-11-19T06:00:00Z"), toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());
}
