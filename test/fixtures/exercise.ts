import assert from "node:assert/strict";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { preparedProject } from "./projects";
import { discover } from "../../src/discovery/discover";
import { prepareLaunch } from "../../src/launch/preflight";
import { resolveDeno, verifyDeno } from "../../src/launch/executable";
import { SessionController } from "../../src/session/controller";
import { listening } from "../../src/launch/readiness";
export async function exerciseConnection(workspace: boolean): Promise<void> {
  const fixture = await preparedProject(workspace);
  const previous = process.env.PORT;
  process.env.PORT = String(fixture.appPort);
  const session = new SessionController(
    resolve("dist/supervisor.mjs"),
    () => {},
  );
  try {
    const project = (await discover([fixture.root])).projects[0];
    assert.ok(project);
    const descriptor = await prepareLaunch(project, fixture.port);
    const executable = await resolveDeno(undefined, [fixture.root]);
    await verifyDeno(executable);
    await session.start(async () => ({ descriptor, executable }));
    assert.equal(session.status().state, "Live");
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try {
        if (
          (
            await fetch(
              `http://127.0.0.1:${workspace ? fixture.siblingPort : fixture.appPort}/ready`,
            )
          ).ok
        ) {
          ready = true;
          break;
        }
      } catch {}
      await delay(100);
    }
    assert.ok(ready);
    if (workspace) {
      const body = (await (
        await fetch(`http://127.0.0.1:${fixture.siblingPort}/ready`)
      ).json()) as { credentialPresent: boolean };
      assert.equal(body.credentialPresent, false);
    }
    const before = session.status().events;
    await fetch(`http://127.0.0.1:${fixture.appPort}/items`);
    for (let i = 0; i < 40 && session.status().events <= before; i++)
      await delay(100);
    assert.ok(session.status().events > before);
    session.clear();
    assert.equal(session.status().events, 0);
    await session.stop();
    assert.equal(session.status().state, "Idle");
    assert.equal(session.status().events, 0);
    assert.equal(
      await listening(fixture.port, new AbortController().signal),
      false,
    );
    assert.equal(
      await listening(fixture.appPort, new AbortController().signal),
      false,
    );
    if (workspace)
      assert.equal(
        await listening(fixture.siblingPort, new AbortController().signal),
        false,
      );
  } finally {
    await session.stop();
    if (previous === undefined) delete process.env.PORT;
    else process.env.PORT = previous;
    await rm(fixture.root, { recursive: true, force: true });
  }
}
