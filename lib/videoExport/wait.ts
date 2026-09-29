/** Bounds browser operations that may otherwise never settle, and removes listeners on every path. */
export function exportWait<T>(work: Promise<T>, signal: AbortSignal | undefined, label: string, timeoutMs = 60_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (error?: unknown, value?: T) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(value as T);
    };
    const abort = () => finish(new DOMException("Export cancelled", "AbortError"));
    const timer = setTimeout(() => finish(new Error(`${label} timed out. Check your media or try a lower resolution.`)), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    work.then((value) => finish(undefined, value), (error) => finish(error));
    if (signal?.aborted) abort();
  });
}
