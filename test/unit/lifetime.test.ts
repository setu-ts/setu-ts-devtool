import { test } from "node:test";
import assert from "node:assert/strict";
import type { DiagnosticsSessionLifetime } from "@setu-ts/diagnostics-plugin";
import { lifetimeProjection } from "../../src/diagnostics/validate";
import {
  duration,
  planLifetime,
  viewLifetime,
} from "../../src/session/lifetime";
import { statusDisplay } from "../../src/editor/connection";
import type { SessionController } from "../../src/session/controller";

const lifetime = (
  expiresInMs: number,
  maxRemainingMs: number | null,
): DiagnosticsSessionLifetime => ({
  expiresInMs,
  renewal: maxRemainingMs === null ? null : { maxRemainingMs },
});

test("the projection keeps only contract-shaped lifetimes as fresh frozen copies", () => {
  for (const value of [
    lifetime(0, null),
    lifetime(3_600_000, null),
    lifetime(900000, 900000),
    lifetime(900000, 43_200_000),
  ]) {
    const copy = lifetimeProjection(value);
    assert.deepEqual(copy, value);
    assert.notEqual(copy, value);
    assert.ok(Object.isFrozen(copy));
    if (copy.renewal) {
      assert.notEqual(copy.renewal, value.renewal);
      assert.ok(Object.isFrozen(copy.renewal));
    }
  }
  const refused: unknown[] = [
    lifetime(-1, null),
    lifetime(1.5, null),
    lifetime(3_600_001, null),
    lifetime(Number.NaN, null),
    lifetime(Number.POSITIVE_INFINITY, null),
    lifetime(900000, 899999),
    lifetime(900000, 43_200_001),
    lifetime(900000, 1e6 + 0.5),
    { expiresInMs: 900000, renewal: { maxRemainingMs: 1e6, extra: 1 } },
    { expiresInMs: 900000, renewal: "yes" },
    { expiresInMs: 900000, renewal: null, extra: true },
    { expiresInMs: 900000 },
  ];
  for (const value of refused)
    assert.throws(
      () => lifetimeProjection(value as DiagnosticsSessionLifetime),
      /^Error: CONNECTION_FAILED$/,
    );
});

test("the plan renews at half the window only while renewal can extend it", () => {
  assert.deepEqual(planLifetime(1000, lifetime(900000, 28_800_000)), {
    deadline: 901000,
    renewAt: 451000,
    maxDeadline: 28_801_000,
  });
  assert.deepEqual(planLifetime(0, lifetime(901, 5000)).renewAt, 450);
  // Capped: renewing could not move the deadline.
  assert.equal(planLifetime(0, lifetime(4000, 4000)).renewAt, null);
  assert.deepEqual(planLifetime(10, lifetime(2000, null)), {
    deadline: 2010,
    renewAt: null,
    maxDeadline: null,
  });
});

test("views count down from local times and never go negative", () => {
  const plan = planLifetime(0, lifetime(900000, 28_800_000));
  assert.deepEqual(viewLifetime(plan, 100.5), {
    remainingMs: 899899,
    renewable: true,
    maxRemainingMs: 28_799_899,
  });
  assert.deepEqual(viewLifetime(plan, 30_000_000), {
    remainingMs: 0,
    renewable: true,
    maxRemainingMs: 0,
  });
  assert.deepEqual(viewLifetime(planLifetime(0, lifetime(2000, null)), 0), {
    remainingMs: 2000,
    renewable: false,
    maxRemainingMs: null,
  });
  assert.equal(duration(59_999), "0 min");
  assert.equal(duration(12 * 60000 + 59_999), "12 min");
  assert.equal(duration(60 * 60000), "1 h 0 min");
  assert.equal(duration(28_320_000), "7 h 52 min");
});

type Status = ReturnType<SessionController["status"]>;
const status = (overrides: Partial<Status>): Status => ({
  state: "Live",
  application: "running",
  events: 3,
  lost: 0,
  evicted: 0,
  dropped: 0,
  exitCode: null,
  lifetime: null,
  ended: null,
  ...overrides,
});

test("the status bar states renewal, a fixed deadline, and a deadline stop", () => {
  assert.deepEqual(
    statusDisplay(
      status({
        lifetime: {
          remainingMs: 600000,
          renewable: true,
          maxRemainingMs: 28_320_000,
        },
      }),
    ),
    {
      text: "Setu: Live",
      tooltip:
        "Application: running; 3 events. Session renews automatically; up to 7 h 52 min left in total. Stop ends the whole launch.",
    },
  );
  assert.deepEqual(
    statusDisplay(
      status({
        lifetime: {
          remainingMs: 720000,
          renewable: false,
          maxRemainingMs: null,
        },
      }),
    ),
    {
      text: "Setu: Live · 12 min left",
      tooltip:
        "Application: running; 3 events. Session ends in 12 min and cannot be renewed. Launch again to continue. Stop ends the whole launch.",
    },
  );
  assert.equal(
    statusDisplay(status({})).tooltip,
    "Application: running; 3 events. Stop ends the whole launch.",
  );
  assert.deepEqual(
    statusDisplay(status({ state: "Failed", ended: "deadline" })),
    {
      text: "Setu: Failed",
      tooltip: "Session ended at its deadline. Launch again to continue.",
    },
  );
  assert.equal(
    statusDisplay(status({ state: "Failed" })).tooltip,
    "Setu-TS local diagnostics",
  );
  assert.match(
    statusDisplay(status({ state: "Cleanup required" })).tooltip,
    /Recheck Cleanup/,
  );
});
