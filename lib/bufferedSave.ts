/** Coalesces edits and serializes writes, including navigation flushes and retries. */
export class BufferedSave<T> {
  private pending: T | undefined;
  private queue: Promise<void> = Promise.resolve();
  private revision = 0;

  private readonly save: (value: T) => Promise<void>;
  private readonly status: (state: "saving" | "saved" | "error") => void;

  constructor(
    save: (value: T) => Promise<void>,
    status: (state: "saving" | "saved" | "error") => void,
  ) {
    this.save = save;
    this.status = status;
  }

  update(value: T) {
    this.pending = value;
    this.status("saving");
  }

  flush(): Promise<void> {
    const snapshot = this.pending;
    if (snapshot === undefined) return this.queue;
    this.pending = undefined;
    const revision = ++this.revision;
    this.status("saving");
    this.queue = this.queue.then(() => this.save(snapshot)).then(() => {
      if (revision === this.revision && this.pending === undefined) this.status("saved");
    }).catch(() => {
      if (revision !== this.revision) return;
      if (this.pending === undefined) this.pending = snapshot;
      this.status("error");
    });
    return this.queue;
  }
}
