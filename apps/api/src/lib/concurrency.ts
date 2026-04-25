/**
 * Limite la concurrence d'execution d'un set de taches asynchrones.
 * Inspire de p-limit, mais zero-dep.
 *
 * Usage :
 *   const tasks = items.map((item) => () => doSomething(item));
 *   const results = await runWithConcurrency(tasks, 20);
 */
export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<Array<{ ok: true; value: T } | { ok: false; error: Error }>> {
  const results: Array<{ ok: true; value: T } | { ok: false; error: Error }> =
    new Array(tasks.length);

  let cursor = 0;

  async function worker(): Promise<void> {
    while (true) {
      const i = cursor++;
      if (i >= tasks.length) return;
      try {
        const value = await tasks[i]();
        results[i] = { ok: true, value };
      } catch (err) {
        results[i] = {
          ok: false,
          error: err instanceof Error ? err : new Error(String(err)),
        };
      }
    }
  }

  const workers: Promise<void>[] = [];
  const n = Math.min(Math.max(1, concurrency), tasks.length);
  for (let i = 0; i < n; i++) workers.push(worker());

  await Promise.all(workers);
  return results;
}
