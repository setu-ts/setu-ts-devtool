import type { LaunchDescriptor } from "../launch/preflight";
import type { Executable } from "../launch/executable";
import { credentials } from "../launch/credentials";
import { launchOwned, type OwnedLaunch } from "../launch/launcher";
import { listening, waitForListener } from "../launch/readiness";
import { coreClient, type CoreClient } from "../diagnostics/client";
import { Capture } from "../model/capture";
import { schedule } from "./scheduler";
import {
  planLifetime,
  viewLifetime,
  type LifetimePlan,
  type LifetimeView,
} from "./lifetime";
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
  plan: typeof planLifetime;
}
const defaults: SessionPorts = {
  launch: launchOwned,
  listening,
  ready: waitForListener,
  client: coreClient,
  schedule,
  plan: planLifetime,
};
/** A session cannot pair after its initial TTL, the generated default. */
const STARTUP_LIMIT_MS = 900000;
export class SessionController {
  private state: SessionState = "Idle";
  private abort = new AbortController();
  private owned: OwnedLaunch | undefined;
  private client: CoreClient | undefined;
  private setup: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  private rechecking: Promise<void> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private capture = new Capture();
  private root: string | undefined;
  private exitCode: number | null = null;
  private lifetime: LifetimePlan | undefined;
  private ended: "deadline" | null = null;
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
  get displayCapture(): Capture {
    return this.capture;
  }
  status(): Readonly<{
    state: SessionState;
    application: string | null;
    events: number;
    lost: number;
    evicted: number;
    dropped: number;
    exitCode: number | null;
    lifetime: LifetimeView | null;
    ended: "deadline" | null;
  }> {
    return Object.freeze({
      state: this.state,
      application: this.capture.snapshot?.state ?? null,
      events: this.capture.events.length,
      lost: this.capture.lost,
      evicted: this.capture.evicted,
      dropped: this.capture.snapshot?.droppedEvents ?? 0,
      exitCode: this.exitCode,
      lifetime:
        this.lifetime === undefined
          ? null
          : viewLifetime(this.lifetime, performance.now()),
      ended: this.ended,
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
    this.ended = null;
    this.lifetime = undefined;
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
        this.arm(STARTUP_LIMIT_MS);
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
        const client = this.client;
        // Pairing yields the authenticated lifetime, which replaces the bound.
        this.adopt(performance.now(), await client.session(), signal);
        const snapshot = await client.snapshot();
        this.checkContext(signal);
        this.capture.setSnapshot(snapshot);
        this.transition("Live");
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
            {
              due: () =>
                this.lifetime?.renewAt != null &&
                performance.now() >= this.lifetime.renewAt,
              run: async () => {
                this.checkContext(signal);
                const sentAt = performance.now();
                // A failure rejects the scheduler and stops; never retried.
                const renewed = await client.renew();
                if (signal.aborted) return;
                this.adopt(sentAt, renewed, signal);
                this.changed();
              },
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
  /** One timer: the startup bound, then each authenticated deadline. */
  private arm(ms: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (this.stopping) return;
      this.ended = "deadline";
      void this.stop("Failed");
    }, ms);
  }
  private adopt(
    sentAt: number,
    lifetime: Parameters<typeof planLifetime>[1],
    signal: AbortSignal,
  ): void {
    this.checkContext(signal);
    this.lifetime = this.ports.plan(sentAt, lifetime);
    this.arm(this.lifetime.deadline - performance.now());
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
      if (this.timer) clearTimeout(this.timer);
      this.timer = undefined;
      this.lifetime = undefined;
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
    const owned = this.owned;
    const generation = this.abort;
    if (this.state !== "Cleanup required" || !owned) return;
    if (this.rechecking) return this.rechecking;
    const pending = (async () => {
      const clean = await owned.recheck().catch(() => false);
      // A disappearance result belongs only to the session that requested it.
      if (
        !clean ||
        this.state !== "Cleanup required" ||
        this.owned !== owned ||
        this.abort !== generation
      )
        return;
      this.owned = undefined;
      this.root = undefined;
      this.stopping = undefined;
      this.transition("Idle");
    })();
    this.rechecking = pending;
    try {
      await pending;
    } finally {
      if (this.rechecking === pending) this.rechecking = undefined;
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
