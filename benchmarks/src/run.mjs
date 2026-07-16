/**
 * Run every benchmark suite, print an aligned table, write
 * `results/latest.json`, and compare against `baseline.json` when present.
 *
 *   node src/run.mjs                  # run + compare vs baseline
 *   node src/run.mjs --update-baseline  # additionally copy latest -> baseline
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as events from './suites/events.mjs'
import * as registry from './suites/registry.mjs'
import * as pathfinding from './suites/pathfinding.mjs'
import * as agents from './suites/agents.mjs'
import * as quest from './suites/quest.mjs'
import * as collision from './suites/collision.mjs'
import * as net from './suites/net.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RESULTS_DIR = join(ROOT, 'results')
const LATEST_PATH = join(RESULTS_DIR, 'latest.json')
const BASELINE_PATH = join(ROOT, 'baseline.json')

const SUITES = [events, registry, pathfinding, agents, quest, collision, net]

function formatOps(value) {
  if (!value) return '-'
  if (value >= 1e6) return `${(value / 1e6).toFixed(2)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}k`
  return value.toFixed(1)
}

function formatMeta(meta) {
  if (!meta) return ''
  return Object.entries(meta)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
}

function loadBaseline() {
  if (!existsSync(BASELINE_PATH)) return null
  try {
    const parsed = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
    const map = new Map()
    for (const suite of parsed.results ?? []) {
      for (const result of suite.results ?? []) {
        map.set(`${suite.name}/${result.name}`, result)
      }
    }
    return map
  } catch {
    console.warn('[bench] baseline.json is unreadable; skipping comparison')
    return null
  }
}

function main() {
  const updateBaseline = process.argv.includes('--update-baseline')
  const baseline = loadBaseline()

  console.log(`overworld benchmarks — node ${process.version}\n`)

  const suiteResults = []
  for (const suite of SUITES) {
    const result = suite.run()
    suiteResults.push(result)
    process.stdout.write(`ran ${result.name} (${result.results.length} benches)\n`)
  }

  // Build table rows.
  const rows = []
  for (const suite of suiteResults) {
    for (const result of suite.results) {
      const key = `${suite.name}/${result.name}`
      let delta = ''
      const base = baseline?.get(key)
      if (base && base.opsPerSec > 0 && result.opsPerSec > 0) {
        const pct = ((result.opsPerSec - base.opsPerSec) / base.opsPerSec) * 100
        delta = `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
      }
      rows.push({
        suite: suite.name,
        name: result.name,
        ops: formatOps(result.opsPerSec),
        mean: result.meanMs ? `${result.meanMs.toFixed(4)} ms` : '-',
        delta,
        meta: formatMeta(result.meta),
      })
    }
  }

  const headers = { suite: 'suite', name: 'benchmark', ops: 'ops/sec', mean: 'mean', delta: 'Δ ops/s', meta: 'meta' }
  const cols = ['suite', 'name', 'ops', 'mean', 'delta', 'meta']
  const widths = {}
  for (const col of cols) {
    widths[col] = Math.max(headers[col].length, ...rows.map((r) => r[col].length))
  }
  const line = (row) => cols.map((c) => row[c].padEnd(widths[c])).join('  ')
  console.log()
  console.log(line(headers))
  console.log(cols.map((c) => '-'.repeat(widths[c])).join('  '))
  for (const row of rows) console.log(line(row))

  // Persist latest.json.
  mkdirSync(RESULTS_DIR, { recursive: true })
  const payload = {
    timestamp: new Date().toISOString(),
    node: process.version,
    results: suiteResults,
  }
  writeFileSync(LATEST_PATH, `${JSON.stringify(payload, null, 2)}\n`)
  console.log(`\nwrote ${LATEST_PATH}`)

  if (updateBaseline) {
    copyFileSync(LATEST_PATH, BASELINE_PATH)
    console.log(`updated ${BASELINE_PATH}`)
  } else if (!baseline) {
    console.log('no baseline.json — run with --update-baseline to create one')
  }
}

main()
