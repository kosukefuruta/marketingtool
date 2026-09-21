export async function runWithConcurrency<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  if (!Number.isInteger(limit) || limit < 1) throw new Error("Concurrency limit must be a positive integer")
  let nextIndex = 0
  async function run(): Promise<void> {
    while (nextIndex < items.length) {
      const item = items[nextIndex]
      nextIndex += 1
      await worker(item)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => run()))
}
