import type { DiagnosticsSessionLifetime } from "@setu-ts/diagnostics-plugin";
/** Local monotonic times (`performance.now()`) derived from one lifetime. */
export interface LifetimePlan {
  readonly deadline: number;
  readonly renewAt: number | null;
  readonly maxDeadline: number | null;
}
export interface LifetimeView {
  readonly remainingMs: number;
  readonly renewable: boolean;
  readonly maxRemainingMs: number | null;
}
/**
 * `sentAt` is read before the request is queued, so the server measured its
 * values no earlier and the local deadline is never later than the server's.
 * Renew at half the remaining window, and only while renewing can extend it.
 */
export function planLifetime(
  sentAt: number,
  lifetime: DiagnosticsSessionLifetime,
): LifetimePlan {
  const max = lifetime.renewal?.maxRemainingMs ?? null;
  return Object.freeze({
    deadline: sentAt + lifetime.expiresInMs,
    renewAt:
      max !== null && max > lifetime.expiresInMs
        ? sentAt + Math.floor(lifetime.expiresInMs / 2)
        : null,
    maxDeadline: max === null ? null : sentAt + max,
  });
}
export function viewLifetime(plan: LifetimePlan, now: number): LifetimeView {
  return Object.freeze({
    remainingMs: Math.max(0, Math.floor(plan.deadline - now)),
    renewable: plan.renewAt !== null,
    maxRemainingMs:
      plan.maxDeadline === null
        ? null
        : Math.max(0, Math.floor(plan.maxDeadline - now)),
  });
}
/** Whole minutes, rounded down: "12 min", "7 h 52 min". */
export function duration(ms: number): string {
  const minutes = Math.floor(ms / 60000);
  return minutes >= 60
    ? `${Math.floor(minutes / 60)} h ${minutes % 60} min`
    : `${minutes} min`;
}
