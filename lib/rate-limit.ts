export class SlidingWindowLimiter {
  private readonly logs = new Map<string, number[]>()
  private lastSweepAt = 0

  constructor(private readonly windowMs: number, private readonly max: number) {}

  checkAndRecord(key: string, now = Date.now()): { allowed: true } | { allowed: false; retryAfter: number } {
    const log = this.logs.get(key) ?? []
    while (log.length && now - log[0] >= this.windowMs) log.shift()
    if (log.length >= this.max) {
      return { allowed: false, retryAfter: Math.ceil((log[0] + this.windowMs - now) / 1000) }
    }
    log.push(now)
    this.logs.set(key, log)
    if (now - this.lastSweepAt >= this.windowMs) {
      for (const [entryKey, entries] of this.logs) {
        while (entries.length && now - entries[0] >= this.windowMs) entries.shift()
        if (entries.length === 0) this.logs.delete(entryKey)
      }
      this.lastSweepAt = now
    }
    return { allowed: true }
  }

  reset(): void {
    this.logs.clear()
    this.lastSweepAt = 0
  }
}
