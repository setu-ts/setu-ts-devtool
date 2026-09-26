/** At most one scan plus one pending follow-up; invalidate before disposal/context changes. */
export class RefreshQueue<T> {
  private running = false;
  private pending = false;
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
  async request(): Promise<void> {
    if (this.disposed) return;
    if (this.running) {
      this.pending = true;
      return;
    }
    this.running = true;
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
    }
  }
  dispose(): void {
    this.disposed = true;
    this.pending = false;
    this.invalidate();
  }
}
