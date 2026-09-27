import type { LaunchDescriptor } from "../launch/preflight";
import type { Executable } from "../launch/executable";
import { credentials } from "../launch/credentials";
import { launchOwned, type OwnedLaunch } from "../launch/launcher";
import { listening, waitForListener } from "../launch/readiness";
import { coreClient, type CoreClient } from "../diagnostics/client";
import { Capture } from "../model/capture";
import { schedule } from "./scheduler";
export type SessionState =
  | "Idle"
  | "Preparing"
  | "Starting"
  | "Pairing"
  | "Live"
  | "Stopping"
  | "Failed"
  | "Cleanup required";
export interface Prepared {
  readonly descriptor: LaunchDescriptor;
  readonly executable: Executable;
}
export interface SessionPorts {
  launch: typeof launchOwned;
  listening: typeof listening;
  ready: typeof waitForListener;
  client: typeof coreClient;
  schedule: typeof schedule;
}
const defaults: SessionPorts = {
  launch: launchOwned,
  listening,
  ready: waitForListener,
  client: coreClient,
  schedule,
};
export class SessionController {
  private state: SessionState = "Idle";
  private abort = new AbortController();
  private owned: OwnedLaunch | undefined;
  private client: CoreClient | undefined;
  private setup: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private capture = new Capture();
  private root: string | undefined;
  private exitCode: number | null = null;
  constructor(
    private readonly supervisor: string,
    private readonly changed: () => void,
    private readonly ports: SessionPorts = defaults,
    private readonly allowed: () => boolean = () => true,
  ) {}
  get busy(): boolean {
    return !["Idle", "Failed"].includes(this.state);
  }
  get activeRoot(): string | undefined {
    return this.root;
  }
  status(): Readonly<{
    state: SessionState;
    application: string | null;
    events: number;
    lost: number;
    evicted: number;
    dropped: number;
    exitCode: number | null;
  }> {
    return Object.freeze({
      state: this.state,
      application: this.capture.snapshot?.state ?? null,
      events: this.capture.events.length,
      lost: this.capture.lost,
      evicted: this.capture.evicted,
      dropped: this.capture.snapshot?.droppedEvents ?? 0,
      exitCode: this.exitCode,
    });
  }
  private transition(state: SessionState): void {
    this.state = state;
    this.changed();
  }
  async start(
    prepare: (signal: AbortSignal) => Promise<Prepared | undefined>,
  ): Promise<void> {
    if (this.busy || !this.allowed()) return;
    this.stopping = undefined;
    this.owned = undefined;
    this.exitCode = null;
    this.abort = new AbortController();
    const signal = this.abort.signal;
    this.transition("Preparing");
    this.setup = (async () => {
      const prepared = await cancellablePreparation(prepare(signal), signal);
      this.checkContext(signal);
      if (!prepared) return;
      const { descriptor, executable } = prepared;
      this.root = descriptor.root;
      if (await this.ports.listening(descriptor.port, signal))
        throw new Error("PORT_OCCUPIED");
      this.checkContext(signal);
      const pair = credentials();
      try {
        this.transition("Starting");
        // Include supervisor startup so the local limit is conservative.
        this.timer = setTimeout(() => {
          void this.stop("Failed");
        }, 900000);
        try {
          this.owned = await this.ports.launch(
            descriptor,
            executable,
            this.supervisor,
            pair.id,
            pair.encoded,
            signal,
          );
        } catch (error) {
          if (typeof error === "object" && error !== null && "owned" in error)
            this.owned = error.owned as OwnedLaunch;
          throw error;
        }
        void this.owned.exited.then((code) => {
          if (!signal.aborted) {
            this.exitCode = code;
            void this.stop("Failed");
          }
        });
        this.checkContext(signal);
        await this.ports.ready(descriptor.port, signal);
        this.checkContext(signal);
        this.transition("Pairing");
        this.client = this.ports.client(
          descriptor.port,
          pair.id,
          pair.key,
          signal,
        );
        const snapshot = await this.client.snapshot();
        this.checkContext(signal);
        this.capture.setSnapshot(snapshot);
        this.transition("Live");
        const client = this.client;
        void this.ports
          .schedule(
            signal,
            async () => {
              this.checkContext(signal);
              const revision = this.capture.revision;
              const batch = await client.read(this.capture.cursor);
              if (signal.aborted) return;
              this.checkContext(signal);
              this.capture.append(batch, revision);
              this.changed();
              if (batch.closed) void this.stop();
            },
            async () => {
              this.checkContext(signal);
              const value = await client.snapshot();
              if (!signal.aborted) {
                this.checkContext(signal);
                this.capture.setSnapshot(value);
                this.changed();
              }
            },
          )
          .catch(() => {
            if (!signal.aborted) void this.stop("Failed");
          });
      } finally {
        pair.key.fill(0);
        pair.encoded = "";
        pair.id = "";
      }
    })();
    try {
      await this.setup;
      if (this.state === "Preparing") this.transition("Idle");
    } catch {
      // An external stop/root exit may already own cleanup; await it as well.
      await this.stop("Failed");
    }
  }
  private checkContext(signal: AbortSignal): void {
    signal.throwIfAborted();
    if (!this.allowed()) throw new Error("CONTEXT_REFUSED");
  }
  clear(): void {
    this.capture.clear();
    this.changed();
  }
  stop(destination: "Idle" | "Failed" = "Idle"): Promise<void> {
    if (this.state === "Cleanup required") return Promise.resolve();
    return (this.stopping ??= (async () => {
      this.abort.abort();
      this.client?.close();
      this.capture.reset();
      this.transition("Stopping");
      await this.setup?.catch(() => {});
      this.client?.close();
      this.client = undefined;
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      this.capture.reset();
      const clean = this.owned
        ? await this.owned.stop().catch(() => false)
        : true;
      if (clean) {
        this.owned = undefined;
        this.root = undefined;
        this.transition(destination);
      } else this.transition("Cleanup required");
    })());
  }
  async recheck(): Promise<void> {
    if (
      this.state === "Cleanup required" &&
      (await this.owned?.recheck().catch(() => false))
    ) {
      this.owned = undefined;
      this.root = undefined;
      this.stopping = undefined;
      this.transition("Idle");
    }
  }
}

function cancellablePreparation<T>(
  pending: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(new Error("CANCELLED"));
    };
    signal.addEventListener("abort", abort, { once: true });
    pending.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
    if (signal.aborted) abort();
  });
}
