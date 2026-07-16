// Navigation grid
export { createNavGrid, collidersToObstacles } from './grid'
export type { NavGrid, NavGridBounds, NavGridConfig, Obstacle } from './grid'

// A* pathfinding + smoothing (pure)
export { findPath, smoothPath, hasLineOfSight, nearestWalkableCell } from './astar'
export type { FindPathOptions, PathPoint } from './astar'

// Steering behaviors (headless)
export { createAgent } from './behaviors'
export type {
  Agent,
  AgentBehaviorName,
  AgentConfig,
  AgentStatus,
  FollowOptions,
  FollowTarget,
  PatrolOptions,
  WanderOptions,
} from './behaviors'

// R3F components
export { NPCWalker, useAgentDriver } from './NPCWalker'
export type { AgentDriverOptions, NPCWalkerProps } from './NPCWalker'
