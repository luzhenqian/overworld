// Headless engine
export { createEnvironment, DEFAULT_WEATHER_MIN_DURATION_MS } from './createEnvironment'
export type { Environment, EnvironmentConfig } from './createEnvironment'
export type {
  EnvironmentPersistConfig,
  EnvironmentPhase,
  EnvironmentState,
  PhaseBoundaries,
  WeatherDefinition,
} from './types'

// Pure helpers & presets
export {
  DEFAULT_PHASES,
  derivePhase,
  getDaylightFactor,
  validatePhaseBoundaries,
  wrapTimeOfDay,
} from './phase'
export { DEFAULT_WEATHERS } from './presets'

// R3F components
export { EnvironmentTick } from './EnvironmentTick'
export type { EnvironmentTickProps } from './EnvironmentTick'
export { DayNightLighting } from './DayNightLighting'
export type { DayNightLightingProps, DayNightValue } from './DayNightLighting'
export { RainParticles } from './RainParticles'
export type { RainParticlesProps } from './RainParticles'
export { SnowParticles } from './SnowParticles'
export type { SnowParticlesProps } from './SnowParticles'
export { WeatherVisuals } from './WeatherVisuals'
export type { WeatherVisualsProps } from './WeatherVisuals'
export { WorldEnvironment } from './WorldEnvironmentScene'
export type { WorldEnvironmentProps } from './WorldEnvironmentScene'
export {
  WORLD_ENV_PRESETS,
  resolvePreset,
  resolveLight,
  lerpColor,
  resolveExposure,
} from './worldEnvironment'
export type { WorldEnvironmentPreset, WorldEnvironmentPresetName } from './worldEnvironment'
