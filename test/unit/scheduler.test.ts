import { test } from "node:test";
import assert from "node:assert/strict";
import { schedule } from "../../src/session/scheduler";
import { listening } from "../../src/launch/readiness";
const idle = { due: () => false, run: async () => assert.fail() };
test(
  "scheduler serializes operations, refreshes topology, and stops without backlog",
  { timeout: 10000 },
  async () => {
    const abort = new AbortController();
    let reads = 0,
      snapshots = 0,
      active = 0;
    await schedule(
      abort.signal,
      async () => {
        assert.equal(active++, 0);
        reads++;
        if (snapshots) abort.abort();
        active--;
      },
      async () => {
        assert.equal(active++, 0);
        snapshots++;
        active--;
      },
      idle,
    );
    assert.ok(reads >= 1);
    assert.equal(snapshots, 1);
    await schedule(
      abort.signal,
      async () => assert.fail(),
      async () => assert.fail(),
      idle,
    );
  },
);
test("an in-flight TCP probe closes on cancellation", async () => {
  const abort = new AbortController();
  const pending = listening(4919, abort.signal);
  abort.abort();
  await assert.rejects(pending);
});
test(
  "a due renewal replaces a read, never overlaps one, and its failure ends the loop",
  { timeout: 10000 },
  async () => {
    const abort = new AbortController();
    let active = 0,
      reads = 0,
      renewals = 0,
      due = true;
    await assert.rejects(
      schedule(
        abort.signal,
        async () => {
          assert.equal(active++, 0);
          reads++;
          due = true;
          active--;
        },
        async () => assert.fail(),
        {
          due: () => due,
          run: async () => {
            assert.equal(active++, 0);
            due = false;
            active--;
            if (++renewals === 2) throw new Error("refused");
          },
        },
      ),
      /refused/,
    );
    assert.equal(renewals, 2);
    assert.equal(reads, 1);
  },
);
