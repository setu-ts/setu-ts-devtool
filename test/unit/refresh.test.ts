import { test } from "node:test";
import assert from "node:assert/strict";
import { RefreshQueue } from "../../src/editor/refresh";
test("refresh floods coalesce to one follow-up and stale scans cannot commit", async () => {
  let count = 0;
  const releases: ((n: number) => void)[] = [],
    values: number[] = [];
  const queue = new RefreshQueue(
    () => {
      count++;
      return new Promise<number>((resolve) => releases.push(resolve));
    },
    (n) => values.push(n),
    () => assert.fail(),
  );
  const running = queue.request();
  for (let i = 0; i < 100; i++) void queue.request();
  assert.equal(count, 1);
  queue.invalidate();
  void queue.request(); // Only a newly requested scan survives invalidation.
  releases[0]?.(1);
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(count, 2);
  assert.deepEqual(values, []);
  releases[1]?.(2);
  await running;
  assert.deepEqual(values, [2]);
  queue.dispose();
  await queue.request();
  assert.equal(count, 2);
});
test("disposal discards results and pending requests, errors are contained", async () => {
  let release: (() => void) | undefined;
  const queue = new RefreshQueue(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
    () => assert.fail(),
    () => assert.fail(),
  );
  const run = queue.request();
  void queue.request();
  queue.dispose();
  release?.();
  await run;
  let errors = 0;
  const failure = new RefreshQueue(
    async () => {
      throw new Error("synthetic-secret");
    },
    () => assert.fail(),
    () => errors++,
  );
  await failure.request();
  assert.equal(errors, 1);
  failure.dispose();
});
