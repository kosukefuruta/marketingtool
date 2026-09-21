export function retryDelayMs(attemptCount: number): number {
  return attemptCount <= 1 ? 30_000 : 2 * 60_000
}

export function shouldRetry(attemptCount: number): boolean {
  return attemptCount < 3
}

export const MAX_CONSECUTIVE_INFRASTRUCTURE_FAILURES = 10

export function shouldStopWorker(infrastructureFailures: number): boolean {
  return infrastructureFailures >= MAX_CONSECUTIVE_INFRASTRUCTURE_FAILURES
}
