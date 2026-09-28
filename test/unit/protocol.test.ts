import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "../../src/presentation/protocol";

const generation = "panel-1";
const valid = {
  kind: "filter",
  version: 1,
  generation,
  text: "hello",
  eventPage: 0,
  nodePage: 0,
};

test("renderer protocol accepts only exact bounded requests for its panel", () => {
  assert.deepEqual(request(valid, generation), valid);
  assert.deepEqual(
    request({ kind: "clear", version: 1, generation }, generation),
    {
      kind: "clear",
      version: 1,
      generation,
    },
  );
  assert.equal(request({ ...valid, generation: "old" }, generation), undefined);
  assert.equal(
    request({ ...valid, url: "https://example.test" }, generation),
    undefined,
  );
  assert.equal(request({ ...valid, eventPage: -1 }, generation), undefined);
  assert.equal(
    request({ ...valid, text: "x".repeat(257) }, generation),
    undefined,
  );
  assert.equal(
    request(
      {
        kind: "documentation",
        version: 1,
        generation,
        topic: "https://example.test",
      },
      generation,
    ),
    undefined,
  );
});

test("renderer protocol refuses deep, cyclic and oversized values", () => {
  let deep: unknown = { leaf: true };
  for (let index = 0; index < 10; index++) deep = { deep };
  assert.equal(request(deep, generation), undefined);
  const cyclic: {
    kind: string;
    version: number;
    generation: string;
    self?: unknown;
  } = {
    kind: "ready",
    version: 1,
    generation,
  };
  cyclic.self = cyclic;
  assert.equal(request(cyclic, generation), undefined);
  assert.equal(
    request({ ...valid, text: "x".repeat(9000) }, generation),
    undefined,
  );
});

test("renderer protocol admits every allowlisted action", () => {
  assert.deepEqual(
    request({ kind: "ready", version: 1, generation: "" }, generation),
    { kind: "ready", version: 1, generation },
  );
  assert.equal(
    request(
      { kind: "acknowledge", version: 1, generation, frame: 4 },
      generation,
    )?.kind,
    "acknowledge",
  );
  assert.equal(
    request({ kind: "select", version: 1, generation, id: null }, generation)
      ?.kind,
    "select",
  );
  for (const kind of ["clear", "stop"] as const)
    assert.equal(
      request({ kind, version: 1, generation }, generation)?.kind,
      kind,
    );
  for (const topic of [
    "architecture",
    "security",
    "framework-contract",
  ] as const)
    assert.equal(
      request(
        { kind: "documentation", version: 1, generation, topic },
        generation,
      )?.kind,
      "documentation",
    );
  for (const invalid of [
    null,
    [],
    { kind: "acknowledge", version: 1, generation, frame: 1.5 },
    { kind: "select", version: 1, generation, id: "x".repeat(257) },
  ])
    assert.equal(request(invalid, generation), undefined);
  assert.equal(
    request({ kind: "ready", version: 1, generation, extra: true }, generation),
    undefined,
  );
  assert.equal(
    request({ kind: "clear", version: 1, generation, extra: true }, generation),
    undefined,
  );
  assert.equal(
    request({ kind: "unknown", version: 1, generation }, generation),
    undefined,
  );
  const jsonFailure = {
    kind: "ready",
    version: 1,
    generation,
    toJSON: () => {
      throw new Error("synthetic");
    },
  };
  assert.equal(request(jsonFailure, generation), undefined);
});
