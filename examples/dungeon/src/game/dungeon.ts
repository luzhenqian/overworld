/**
 * 程序化地牢生成器 —— 纯函数,无 three.js / React 依赖,可单元测试。
 *
 * 网格约定:cols × rows 个 1×1 世界单位的格子,1 = 墙,0 = 地板。
 * 格子 (cx, cz) 的世界中心 = [minX + (cx + 0.5), minZ + (cz + 0.5)]。
 * 同一份格子数据同时喂给:
 *  - 场景碰撞(墙壳格 → SceneShell decorationCollisions 圆形碰撞体,半径 0.55)
 *  - @overworld/ai 的 NavGrid(墙格 → blockCircle,敌人寻路)
 *  - 小地图 / 引导路径(findPathHierarchical)
 */

export interface DungeonRoom {
  /** 左上角格子坐标(含)。 */
  cx: number
  cz: number
  /** 尺寸,单位:格。 */
  w: number
  h: number
}

export interface DungeonGuard {
  id: string
  /** 岗位(巡逻起点),世界坐标 [x, z]。 */
  post: [number, number]
  /** 巡逻路线,世界坐标。 */
  route: [number, number][]
}

export interface DungeonLayout {
  seed: number
  cols: number
  rows: number
  cellSize: number
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  /** cols × rows,1 = 墙,0 = 地板,下标 cz * cols + cx。 */
  cells: Uint8Array
  rooms: DungeonRoom[]
  /** 以下均为世界坐标 [x, z]。 */
  spawn: [number, number]
  npcPos: [number, number]
  keyPos: [number, number]
  chestPos: [number, number]
  coinSpots: [number, number][]
  guards: DungeonGuard[]
}

export interface GenerateOptions {
  /** 地牢边长,单位:格。@default 48 */
  size?: number
  /** 目标房间数上限。@default 9 */
  maxRooms?: number
}

/** 经典 mulberry32 —— 确定性 PRNG,同种子同序列。 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 从 location.search 解析 ?seed=,非法或缺省时用 fallback。 */
export function parseSeed(search: string, fallback = 42): number {
  const raw = new URLSearchParams(search).get('seed')
  if (raw === null || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) return fallback
  return Math.abs(Math.floor(n)) >>> 0
}

export function cellIndex(layout: Pick<DungeonLayout, 'cols'>, cx: number, cz: number): number {
  return cz * layout.cols + cx
}

export function isFloorCell(layout: DungeonLayout, cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= layout.cols || cz >= layout.rows) return false
  return layout.cells[cellIndex(layout, cx, cz)] === 0
}

/** 格子中心 → 世界坐标。 */
export function cellToWorld(layout: DungeonLayout, cx: number, cz: number): [number, number] {
  return [
    layout.bounds.minX + (cx + 0.5) * layout.cellSize,
    layout.bounds.minZ + (cz + 0.5) * layout.cellSize,
  ]
}

/** 世界坐标 → 格子坐标(越界时钳到边缘)。 */
export function worldToCell(layout: DungeonLayout, x: number, z: number): [number, number] {
  const clamp = (v: number, max: number) => (v < 0 ? 0 : v > max ? max : v)
  return [
    clamp(Math.floor((x - layout.bounds.minX) / layout.cellSize), layout.cols - 1),
    clamp(Math.floor((z - layout.bounds.minZ) / layout.cellSize), layout.rows - 1),
  ]
}

/** 世界坐标是否落在地板格上。 */
export function isFloorWorld(layout: DungeonLayout, x: number, z: number): boolean {
  if (
    x < layout.bounds.minX ||
    x >= layout.bounds.maxX ||
    z < layout.bounds.minZ ||
    z >= layout.bounds.maxZ
  ) {
    return false
  }
  const [cx, cz] = worldToCell(layout, x, z)
  return isFloorCell(layout, cx, cz)
}

/**
 * 从某格 BFS(四邻接)出发的最短步数;-1 = 不可达。
 * 用于:选钥匙/宝箱房(最远房间)与连通性测试。
 */
export function bfsDistances(layout: DungeonLayout, from: [number, number]): Int32Array {
  const dist = new Int32Array(layout.cols * layout.rows).fill(-1)
  const [fx, fz] = from
  if (!isFloorCell(layout, fx, fz)) return dist
  const queue: number[] = [cellIndex(layout, fx, fz)]
  dist[queue[0]!] = 0
  for (let head = 0; head < queue.length; head++) {
    const idx = queue[head]!
    const cx = idx % layout.cols
    const cz = (idx - cx) / layout.cols
    const d = dist[idx]!
    const neighbors: [number, number][] = [
      [cx + 1, cz],
      [cx - 1, cz],
      [cx, cz + 1],
      [cx, cz - 1],
    ]
    for (const [nx, nz] of neighbors) {
      if (!isFloorCell(layout, nx, nz)) continue
      const nIdx = cellIndex(layout, nx, nz)
      if (dist[nIdx] !== -1) continue
      dist[nIdx] = d + 1
      queue.push(nIdx)
    }
  }
  return dist
}

/** 与至少一个地板格(八邻接)相邻的墙格 —— 即需要渲染 + 碰撞的"墙壳"。 */
export function wallShellCells(layout: DungeonLayout): [number, number][] {
  const out: [number, number][] = []
  for (let cz = 0; cz < layout.rows; cz++) {
    for (let cx = 0; cx < layout.cols; cx++) {
      if (layout.cells[cellIndex(layout, cx, cz)] !== 1) continue
      let nearFloor = false
      for (let dz = -1; dz <= 1 && !nearFloor; dz++) {
        for (let dx = -1; dx <= 1 && !nearFloor; dx++) {
          if (dx === 0 && dz === 0) continue
          if (isFloorCell(layout, cx + dx, cz + dz)) nearFloor = true
        }
      }
      if (nearFloor) out.push([cx, cz])
    }
  }
  return out
}

/** 全部墙格(喂 NavGrid 用)。 */
export function allWallCells(layout: DungeonLayout): [number, number][] {
  const out: [number, number][] = []
  for (let cz = 0; cz < layout.rows; cz++) {
    for (let cx = 0; cx < layout.cols; cx++) {
      if (layout.cells[cellIndex(layout, cx, cz)] === 1) out.push([cx, cz])
    }
  }
  return out
}

const roomCenter = (room: DungeonRoom): [number, number] => [
  room.cx + Math.floor(room.w / 2),
  room.cz + Math.floor(room.h / 2),
]

/**
 * 生成地牢:随机撒房间(带间距的矩形)→ 依次用 2 格宽 L 形走廊串联 →
 * BFS 选出发/钥匙/宝箱房 → 摆守卫巡逻线与金币。
 * 走廊刻意 2 格宽:1 格走廊在半径 0.55 的墙碰撞圆挤压下玩家无法通过。
 */
export function generateDungeon(seed: number, options: GenerateOptions = {}): DungeonLayout {
  const size = options.size ?? 48
  const maxRooms = options.maxRooms ?? 9
  const cols = size
  const rows = size
  const rng = mulberry32(seed)
  const cells = new Uint8Array(cols * rows).fill(1)

  const layout: DungeonLayout = {
    seed,
    cols,
    rows,
    cellSize: 1,
    bounds: { minX: -cols / 2, maxX: cols / 2, minZ: -rows / 2, maxZ: rows / 2 },
    cells,
    rooms: [],
    spawn: [0, 0],
    npcPos: [0, 0],
    keyPos: [0, 0],
    chestPos: [0, 0],
    coinSpots: [],
    guards: [],
  }

  const carve = (cx: number, cz: number): void => {
    if (cx <= 0 || cz <= 0 || cx >= cols - 1 || cz >= rows - 1) return
    cells[cz * cols + cx] = 0
  }

  // ---- 房间:带 2 格间距的不重叠矩形 -------------------------------------
  const rooms: DungeonRoom[] = []
  for (let attempt = 0; attempt < 90 && rooms.length < maxRooms; attempt++) {
    const w = 4 + Math.floor(rng() * 5) // 4..8
    const h = 4 + Math.floor(rng() * 5)
    const cx = 2 + Math.floor(rng() * (cols - w - 4))
    const cz = 2 + Math.floor(rng() * (rows - h - 4))
    const candidate: DungeonRoom = { cx, cz, w, h }
    const overlaps = rooms.some(
      (r) =>
        cx - 2 < r.cx + r.w &&
        cx + w + 2 > r.cx &&
        cz - 2 < r.cz + r.h &&
        cz + h + 2 > r.cz
    )
    if (overlaps) continue
    rooms.push(candidate)
    for (let z = cz; z < cz + h; z++) {
      for (let x = cx; x < cx + w; x++) carve(x, z)
    }
  }
  layout.rooms = rooms
  if (rooms.length < 2) {
    throw new Error(`[dungeon] seed ${seed} 只生成了 ${rooms.length} 个房间`)
  }

  // ---- 走廊:相邻(生成序)房间中心之间的 2 格宽 L 形通道 -----------------
  const carveH = (x0: number, x1: number, z: number): void => {
    const [a, b] = x0 < x1 ? [x0, x1] : [x1, x0]
    for (let x = a; x <= b; x++) {
      carve(x, z)
      carve(x, z + 1)
    }
  }
  const carveV = (z0: number, z1: number, x: number): void => {
    const [a, b] = z0 < z1 ? [z0, z1] : [z1, z0]
    for (let z = a; z <= b; z++) {
      carve(x, z)
      carve(x + 1, z)
    }
  }
  for (let i = 1; i < rooms.length; i++) {
    const [ax, az] = roomCenter(rooms[i - 1]!)
    const [bx, bz] = roomCenter(rooms[i]!)
    if (rng() < 0.5) {
      carveH(ax, bx, az)
      carveV(az, bz, bx)
    } else {
      carveV(az, bz, ax)
      carveH(ax, bx, bz)
    }
  }

  // ---- 关键点:BFS 距离选最远的房间放钥匙,其次放宝箱 ---------------------
  const spawnRoom = rooms[0]!
  const spawnCell = roomCenter(spawnRoom)
  const dist = bfsDistances(layout, spawnCell)
  const distAtCenter = (room: DungeonRoom): number => {
    const [cx, cz] = roomCenter(room)
    return dist[cellIndex(layout, cx, cz)] ?? -1
  }
  const byDistanceDesc = rooms
    .slice(1)
    .filter((room) => distAtCenter(room) >= 0)
    .sort((a, b) => distAtCenter(b) - distAtCenter(a))
  if (byDistanceDesc.length < 2) {
    throw new Error(`[dungeon] seed ${seed} 连通房间不足`)
  }
  const keyRoom = byDistanceDesc[0]!
  const chestRoom = byDistanceDesc[1]!

  layout.spawn = cellToWorld(layout, spawnCell[0], spawnCell[1])
  layout.keyPos = cellToWorld(layout, ...roomCenter(keyRoom))
  layout.chestPos = cellToWorld(layout, ...roomCenter(chestRoom))
  // 幽灵向导站在出生点旁(出生房 ≥ 4×4,中心 +1 一定还在房内)
  layout.npcPos = cellToWorld(layout, spawnCell[0] + 1, spawnCell[1] + 1)

  // ---- 守卫:钥匙房、宝箱房、以及次远的一间,各一条房内对角巡逻线 ---------
  const guardRooms = [keyRoom, chestRoom, ...byDistanceDesc.slice(2, 3)]
  layout.guards = guardRooms.map((room, i) => {
    const a = cellToWorld(layout, room.cx + 1, room.cz + 1)
    const b = cellToWorld(layout, room.cx + room.w - 2, room.cz + room.h - 2)
    return { id: `skeleton-${i + 1}`, post: a, route: [a, b] }
  })

  // ---- 金币:非出生房里的随机地板格(避开钥匙/宝箱所在格) ----------------
  const taken = new Set<number>([
    cellIndex(layout, ...roomCenter(keyRoom)),
    cellIndex(layout, ...roomCenter(chestRoom)),
  ])
  const coinRooms = rooms.slice(1)
  const coins: [number, number][] = []
  for (let i = 0; i < 24 && coins.length < 5 && coinRooms.length > 0; i++) {
    const room = coinRooms[Math.floor(rng() * coinRooms.length)]!
    const cx = room.cx + 1 + Math.floor(rng() * Math.max(1, room.w - 2))
    const cz = room.cz + 1 + Math.floor(rng() * Math.max(1, room.h - 2))
    const idx = cellIndex(layout, cx, cz)
    if (taken.has(idx) || !isFloorCell(layout, cx, cz)) continue
    taken.add(idx)
    coins.push(cellToWorld(layout, cx, cz))
  }
  layout.coinSpots = coins

  return layout
}
