/** At most one scan plus one pending follow-up; invalidate before disposal/context changes. */
export class RefreshQueue<T> {
  private running = false;
  private pending = false;
  private current: Promise<void> | undefined;
  private disposed = false;
  private generation = 0;
  constructor(
    private readonly scan: () => Promise<T>,
    private readonly accept: (value: T) => void,
    private readonly failed: () => void,
  ) {}
  invalidate(): void {
    this.generation++;
    this.pending = false;
  }
  request(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    if (this.running) {
      this.pending = true;
      return this.current!;
    }
    this.running = true;
    const current = (async () => {
      try {
        do {
          this.pending = false;
          const generation = this.generation;
          try {
            const value = await this.scan();
            if (!this.disposed && generation === this.generation)
              this.accept(value);
          } catch {
            if (!this.disposed && generation === this.generation) this.failed();
          }
        } while (this.pending && !this.disposed);
      } finally {
        this.running = false;
        this.current = undefined;
      }
    })();
    this.current = current;
    return current;
  }
  dispose(): void {
    this.disposed = true;
    this.pending = false;
    this.invalidate();
  }
}
