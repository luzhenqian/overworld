import type { WeatherDefinition } from './types'

/**
 * Optional starter weather set. Purely a convenience preset — the engine
 * itself knows nothing about these ids; pass your own definitions (and map
 * ids to visuals via `<WeatherVisuals/>`) for full control.
 */
export const DEFAULT_WEATHERS: WeatherDefinition[] = [
  { id: 'clear', weight: 5, minDurationMs: 120_000, maxDurationMs: 300_000 },
  { id: 'cloudy', weight: 3, minDurationMs: 90_000, maxDurationMs: 240_000 },
  { id: 'rain', weight: 2, minDurationMs: 60_000, maxDurationMs: 180_000 },
  { id: 'fog', weight: 2, minDurationMs: 90_000, maxDurationMs: 240_000 },
  { id: 'snow', weight: 1, minDurationMs: 60_000, maxDurationMs: 180_000 },
]
