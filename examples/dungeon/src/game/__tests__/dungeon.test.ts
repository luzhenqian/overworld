import { describe, expect, it } from 'vitest'
import {
  allWallCells,
  bfsDistances,
  cellIndex,
  generateDungeon,
  isFloorWorld,
  mulberry32,
  parseSeed,
  wallShellCells,
  worldToCell,
  type DungeonLayout,
} from '../dungeon'

const SEEDS = [42, 1, 7, 123, 2024, 99999]

/** 世界坐标点是否可从出生点走到(四邻接 BFS)。 */
function reachable(layout: DungeonLayout, dist: Int32Array, point: [number, number]): boolean {
  const [cx, cz] = worldToCell(layout, point[0], point[1])
  return (dist[cellIndex(layout, cx, cz)] ?? -1) >= 0
}

describe('mulberry32 / parseSeed', () => {
  it('同种子产生完全相同的序列', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 100; i++) expect(a()).toBe(b())
  })

  it('parseSeed 解析 ?seed=,非法值回退默认', () => {
    expect(parseSeed('?seed=123')).toBe(123)
    expect(parseSeed('?foo=1&seed=7')).toBe(7)
    expect(parseSeed('')).toBe(42)
    expect(parseSeed('?seed=abc')).toBe(42)
    expect(parseSeed('?seed=-5')).toBe(5)
  })
})

describe('generateDungeon — 确定性', () => {
  it('同种子生成完全一致的布局,不同种子生成不同布局', () => {
    const a = generateDungeon(42)
    const b = generateDungeon(42)
    expect(Array.from(a.cells)).toEqual(Array.from(b.cells))
    expect(a.spawn).toEqual(b.spawn)
    expect(a.keyPos).toEqual(b.keyPos)
    expect(a.chestPos).toEqual(b.chestPos)
    expect(a.guards).toEqual(b.guards)
    expect(a.coinSpots).toEqual(b.coinSpots)

    const c = generateDungeon(43)
    expect(Array.from(c.cells)).not.toEqual(Array.from(a.cells))
  })
})

describe('generateDungeon — 连通性与摆放', () => {
  it.each(SEEDS)('种子 %i:出生点可达钥匙、宝箱、NPC、守卫岗位与全部金币', (seed) => {
    const layout = generateDungeon(seed)
    const dist = bfsDistances(layout, worldToCell(layout, ...layout.spawn))
    expect(reachable(layout, dist, layout.keyPos)).toBe(true)
    expect(reachable(layout, dist, layout.chestPos)).toBe(true)
    expect(reachable(layout, dist, layout.npcPos)).toBe(true)
    for (const guard of layout.guards) {
      expect(reachable(layout, dist, guard.post)).toBe(true)
      for (const waypoint of guard.route) expect(reachable(layout, dist, waypoint)).toBe(true)
    }
    for (const coin of layout.coinSpots) expect(reachable(layout, dist, coin)).toBe(true)
  })

  it.each(SEEDS)('种子 %i:关键点都落在地板格上,且互不重叠', (seed) => {
    const layout = generateDungeon(seed)
    for (const point of [layout.spawn, layout.keyPos, layout.chestPos, layout.npcPos]) {
      expect(isFloorWorld(layout, point[0], point[1])).toBe(true)
    }
    // 钥匙与宝箱不在同一个位置(分属两个不同的最远房间)
    expect(layout.keyPos).not.toEqual(layout.chestPos)
    expect(layout.keyPos).not.toEqual(layout.spawn)
    expect(layout.guards.length).toBeGreaterThanOrEqual(2)
    expect(layout.guards.length).toBeLessThanOrEqual(3)
  })
})

describe('generateDungeon — 网格形态', () => {
  it.each(SEEDS)('种子 %i:墙密度合理,外圈全是墙', (seed) => {
    const layout = generateDungeon(seed)
    const walls = allWallCells(layout).length
    const total = layout.cols * layout.rows
    const density = walls / total
    // 房间 + 走廊之外全是实心墙:密度应显著高于 40%、低于 95%
    expect(density).toBeGreaterThan(0.4)
    expect(density).toBeLessThan(0.95)

    for (let cx = 0; cx < layout.cols; cx++) {
      expect(layout.cells[cellIndex(layout, cx, 0)]).toBe(1)
      expect(layout.cells[cellIndex(layout, cx, layout.rows - 1)]).toBe(1)
    }
    for (let cz = 0; cz < layout.rows; cz++) {
      expect(layout.cells[cellIndex(layout, 0, cz)]).toBe(1)
      expect(layout.cells[cellIndex(layout, layout.cols - 1, cz)]).toBe(1)
    }
  })

  it('墙壳(渲染 + 碰撞用)是全部墙格的子集,且数量少得多', () => {
    const layout = generateDungeon(42)
    const shell = wallShellCells(layout)
    const all = new Set(allWallCells(layout).map(([x, z]) => `${x},${z}`))
    expect(shell.length).toBeGreaterThan(0)
    expect(shell.length).toBeLessThan(all.size)
    for (const [x, z] of shell) expect(all.has(`${x},${z}`)).toBe(true)
  })
})
