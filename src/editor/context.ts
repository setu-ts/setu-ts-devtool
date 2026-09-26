export interface HostContext {
  readonly trusted: boolean;
  readonly desktop: boolean;
  readonly remote: boolean;
  readonly platform: string;
  readonly schemes: readonly string[];
}
export function refusal(context: HostContext): string | undefined {
  if (!context.trusted)
    return "Trust this workspace before discovering projects.";
  if (
    !context.desktop ||
    context.remote ||
    context.schemes.some((s) => s !== "file")
  )
    return "Use a local desktop workspace for this preview.";
  if (context.platform !== "linux")
    return "This preview is currently qualified on Linux only.";
  if (context.schemes.length > 16)
    return "Select at most 16 workspace folders.";
  return undefined;
}
