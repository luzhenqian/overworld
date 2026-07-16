// Navigation grid
export { createNavGrid, collidersToObstacles } from './grid'
export type { NavGrid, NavGridBounds, NavGridConfig, Obstacle } from './grid'

// A* pathfinding + smoothing (pure)
export { findPath, smoothPath, hasLineOfSight, nearestWalkableCell } from './astar'
export type { FindPathOptions, PathPoint } from './astar'

// Hierarchical pathfinding (HPA*-style, for large maps)
export { createHierarchicalGrid, findPathHierarchical } from './hpa'
export type {
  AbstractEdge,
  HierarchicalGrid,
  HierarchicalGridOptions,
  TransitionNode,
} from './hpa'

// Behavior trees (tick-driven decision logic + agent-flavored leaves)
export {
  action,
  alwaysSucceed,
  condition,
  createBehaviorTree,
  goToAction,
  idleAction,
  invert,
  isNearCondition,
  parallel,
  patrolAction,
  repeat,
  selector,
  sequence,
  tickTreeWithAgent,
  wait,
} from './behaviorTree'
export type { BTContext, BTNode, BTStatus, BehaviorTree } from './behaviorTree'

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

// Dynamic obstacle avoidance (pure geometry + steering)
export { segmentHitsCircle, deflect, steerStep } from './avoidance'
export type { AvoidOptions } from './avoidance'

// NPC schedules (phase name -> behavior, optionally bus-driven)
export { createSchedule, bindScheduleToBus } from './schedule'
export type {
  BindScheduleOptions,
  Schedule,
  ScheduleBehavior,
  ScheduleBusLike,
  ScheduleConfig,
} from './schedule'

// R3F components
export { NPCWalker, useAgentDriver } from './NPCWalker'
export type { AgentDriverOptions, NPCWalkerProps } from './NPCWalker'
