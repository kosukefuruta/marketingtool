export type RatePrior = { low: number; median: number; high: number }
export type RateEstimate = { median: number; low: number; high: number; observed: number | null; successes: number; trials: number }

const GRID_SIZE = 8001
const LOGIT_LIMIT = 20
const NORMAL_P15 = -1.036433389
const TRANSITION_WIDTH = 0.1

function logit(value: number): number { return Math.log(value / (1 - value)) }
function logistic(value: number): number { return 1 / (1 + Math.exp(-value)) }

function priorShape(prior: RatePrior): { center: number; meanScale: number; skewScale: number } {
  const quantileDistance = -NORMAL_P15
  const center = logit(prior.median)
  const leftDistance = center - logit(prior.low)
  const rightDistance = logit(prior.high) - center
  const bend = TRANSITION_WIDTH * Math.log(Math.cosh(quantileDistance / TRANSITION_WIDTH))
  return {
    center,
    meanScale: (leftDistance + rightDistance) / (2 * quantileDistance),
    skewScale: (rightDistance - leftDistance) / (2 * bend),
  }
}

function validatedPriorShape(prior: RatePrior): ReturnType<typeof priorShape> | null {
  if (!(Number.isFinite(prior.low) && Number.isFinite(prior.median) && Number.isFinite(prior.high)
    && 0 < prior.low && prior.low < prior.median && prior.median < prior.high && prior.high < 1)) return null
  const shape = priorShape(prior)
  return shape.meanScale > Math.abs(shape.skewScale) ? shape : null
}

function transformedLogit(z: number, shape: ReturnType<typeof priorShape>): number {
  return shape.center + shape.meanScale * z + shape.skewScale * TRANSITION_WIDTH * Math.log(Math.cosh(z / TRANSITION_WIDTH))
}

function priorLogDensity(y: number, shape: ReturnType<typeof priorShape>): number {
  let low = -30; let high = 30
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = (low + high) / 2
    if (transformedLogit(middle, shape) < y) low = middle
    else high = middle
  }
  const z = (low + high) / 2
  const derivative = shape.meanScale + shape.skewScale * Math.tanh(z / TRANSITION_WIDTH)
  return -0.5 * z ** 2 - Math.log(derivative)
}

export function priorFromThreePoints(low: number, median: number, high: number): RatePrior {
  const prior = { low, median, high }
  if (!(Number.isFinite(low) && Number.isFinite(median) && Number.isFinite(high)
    && 0 < low && low < median && median < high && high < 1)) throw new Error("Rate prior points must be ordered probabilities")
  if (!validatedPriorShape(prior)) throw new Error("Rate prior points are too asymmetric")
  return prior
}

function quantiles(weights: number[], probabilities: number[]): number[] {
  const results: number[] = []
  let cumulative = 0
  let targetIndex = 0
  for (let index = 0; index < weights.length && targetIndex < probabilities.length; index += 1) {
    cumulative += weights[index]
    while (targetIndex < probabilities.length && cumulative >= probabilities[targetIndex]) {
      results.push(logistic(-LOGIT_LIMIT + index * (2 * LOGIT_LIMIT / (GRID_SIZE - 1))))
      targetIndex += 1
    }
  }
  return results
}

export function updateRate(successes: number, trials: number, prior?: RatePrior): RateEstimate | null {
  if (!Number.isFinite(successes) || !Number.isFinite(trials) || trials < 0 || successes < 0 || successes > trials) return null
  const shape = prior ? validatedPriorShape(prior) : null
  if (prior && !shape) return null
  const logWeights = new Array<number>(GRID_SIZE)
  let maximum = -Infinity

  for (let index = 0; index < GRID_SIZE; index += 1) {
    const y = -LOGIT_LIMIT + index * (2 * LOGIT_LIMIT / (GRID_SIZE - 1))
    const probability = logistic(y)
    let logPrior: number
    if (shape) {
      logPrior = priorLogDensity(y, shape)
    } else {
      // Jeffreys Beta(1/2, 1/2), converted to mass on an evenly spaced logit grid.
      logPrior = 0.5 * Math.log(probability) + 0.5 * Math.log1p(-probability)
    }
    const weight = logPrior + successes * Math.log(probability) + (trials - successes) * Math.log1p(-probability)
    logWeights[index] = weight
    if (weight > maximum) maximum = weight
  }

  const weights = logWeights.map((weight) => Math.exp(weight - maximum))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  if (!Number.isFinite(total) || total <= 0) return null
  for (let index = 0; index < weights.length; index += 1) weights[index] /= total
  const [low, median, high] = quantiles(weights, [0.15, 0.5, 0.85])
  return { low, median, high, observed: trials ? successes / trials : null, successes, trials }
}
