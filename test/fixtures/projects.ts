import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import recipes from "../../.tmp/artifacts/recipes.json";
export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) throw new Error();
      server.close(() => resolve(address.port));
    });
  });
}
export async function preparedProject(workspace = false): Promise<{
  root: string;
  port: number;
  appPort: number;
  siblingPort: number;
}> {
  await mkdir(".tmp", { recursive: true });
  const root = await mkdtemp(resolve(".tmp/application-"));
  const port = await freePort(),
    appPort = await freePort(),
    siblingPort = await freePort();
  const imports: Record<string, string> = {};
  const packages = resolve(".tmp/framework/packages");
  for (const name of await readdir(packages)) {
    try {
      const manifest = JSON.parse(
        await readFile(join(packages, name, "deno.json"), "utf8"),
      ) as { name: string; exports: string | Record<string, string> };
      if (typeof manifest.exports === "string")
        imports[manifest.name] = pathToFileURL(
          join(packages, name, manifest.exports),
        ).href;
      else
        for (const [key, path] of Object.entries(manifest.exports))
          imports[manifest.name + (key === "." ? "" : key.slice(1))] =
            pathToFileURL(join(packages, name, path)).href;
    } catch {
      /* Non-package directories have no manifest. */
    }
  }
  const config = (
    applicationPort: number,
  ) => `import { createApplication } from '@setu-ts/kernel';
import { RuntimePlugin } from '@setu-ts/runtime';
export async function createApp(_env, options = {}) {
 const app = createApplication({plugins:[RuntimePlugin(), ...(options.plugins ?? [])], ...(options.diagnostics ? {diagnostics:options.diagnostics} : {})});
 app.router.get('/ready', c => c.response.json({ready:true, credentialPresent: Boolean(Deno.env.get('SETU_DEVTOOL_SESSION_KEY'))}));
 app.router.get('/items', c => c.response.json({items:[1]}));
 return app;
}
// Fixture application port: ${applicationPort}
`;
  const task = recipes.tasks[1]!;
  if (workspace) {
    await mkdir(join(root, "scripts"), { recursive: true });
    await writeFile(join(root, "scripts/dev.ts"), recipes.runner[0]!);
    await writeFile(
      join(root, "setu.workspace.json"),
      JSON.stringify({
        version: 1,
        basePort: appPort,
        runtime: "deno",
        transport: "http",
        members: [
          { name: "api", port: appPort, devtoolPort: port },
          { name: "worker", port: siblingPort, dependsOn: ["api"] },
        ],
      }),
    );
    await writeFile(
      join(root, "deno.json"),
      JSON.stringify({
        imports,
        workspace: ["apps/api", "apps/worker"],
        tasks: { dev: recipes.rootTask },
      }),
    );
    for (const [name, number] of [
      ["api", appPort],
      ["worker", siblingPort],
    ] as const) {
      const dir = join(root, "apps", name);
      await mkdir(join(dir, "src/discovery"), { recursive: true });
      await writeFile(
        join(dir, "src/discovery/services.ts"),
        `export const SERVICE_PORT = ${number};\n`,
      );
      await writeFile(
        join(dir, "deno.json"),
        JSON.stringify({
          tasks: { start: task.replace("main.dev.ts", "main.ts"), dev: task },
        }),
      );
      await writeFile(join(dir, "setu.config.ts"), config(number));
      await writeFile(
        join(dir, "main.dev.ts"),
        recipes.member[0]!.replace("port: 49191,", `port: ${port},`),
      );
      await writeFile(
        join(dir, "main.ts"),
        `import { createApp } from './setu.config.ts';const app=await createApp();await app.start({port:${number}});Deno.addSignalListener('SIGTERM',()=>{void app.stop().then(()=>Deno.exit());});`,
      );
    }
  } else {
    await writeFile(
      join(root, "deno.json"),
      JSON.stringify({
        imports,
        tasks: { dev: task, start: task.replace("main.dev.ts", "main.ts") },
      }),
    );
    await writeFile(join(root, "setu.config.ts"), config(appPort));
    await writeFile(
      join(root, "main.dev.ts"),
      recipes.standalone[0]!.replace("port: 49191,", `port: ${port},`),
    );
  }
  return { root, port, appPort, siblingPort };
}
