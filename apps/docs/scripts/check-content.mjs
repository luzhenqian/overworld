import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(docsRoot, '../..')
const contentRoot = path.join(docsRoot, 'content/docs')
const packagesRoot = path.join(repoRoot, 'packages')

function filesUnder(root, accept) {
  const result = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(target)
      else if (accept(target)) result.push(target)
    }
  }
  visit(root)
  return result
}

const failures = []
const packageNames = fs
  .readdirSync(packagesRoot)
  .filter((name) => fs.existsSync(path.join(packagesRoot, name, 'package.json')))
  .sort()

const packageDocs = fs
  .readdirSync(path.join(contentRoot, 'packages'))
  .filter((name) => name.endsWith('.mdx') && name !== 'index.mdx')
  .map((name) => name.slice(0, -4))
  .sort()

for (const name of packageNames) {
  if (!packageDocs.includes(name)) failures.push(`missing package reference: ${name}`)
}
for (const name of packageDocs) {
  if (!packageNames.includes(name)) failures.push(`orphan package reference: ${name}`)
}

// Every runtime value exported from a package entry must be discoverable on
// that package's reference page. Type exports may be documented through their
// owning API instead of receiving one row each, so this guard intentionally
// checks runtime exports only.
for (const name of packageNames) {
  const indexPath = path.join(packagesRoot, name, 'src/index.ts')
  const docPath = path.join(contentRoot, 'packages', `${name}.mdx`)
  if (!fs.existsSync(indexPath) || !fs.existsSync(docPath)) continue

  const source = fs
    .readFileSync(indexPath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
  const document = fs.readFileSync(docPath, 'utf8')
  const exported = new Set()

  for (const match of source.matchAll(/export\s+(?!type\b)\{([\s\S]*?)\}\s+from/g)) {
    for (const specifier of match[1].split(',')) {
      const publicName = specifier.trim().split(/\s+as\s+/).at(-1)
      if (/^[A-Za-z_$][\w$]*$/.test(publicName ?? '')) exported.add(publicName)
    }
  }

  for (const publicName of exported) {
    if (!document.includes(publicName)) {
      failures.push(`${name}: runtime export is undocumented: ${publicName}`)
    }
  }
}

const contentFiles = filesUnder(contentRoot, (file) => /\.(md|mdx)$/.test(file))
const routes = new Set(
  contentFiles.map((file) => {
    const relative = path.relative(contentRoot, file).replaceAll(path.sep, '/')
    return `/docs/${relative.replace(/\.(md|mdx)$/, '').replace(/\/index$/, '')}`
  }),
)
routes.add('/docs')

for (const file of contentFiles) {
  const document = fs.readFileSync(file, 'utf8')
  for (const match of document.matchAll(/\]\((\/docs(?:\/[a-z0-9-]+)*)\)/g)) {
    if (!routes.has(match[1])) {
      failures.push(`${path.relative(repoRoot, file)}: broken internal link: ${match[1]}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`Documentation content check failed (${failures.length}):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log(
  `Documentation content check passed: ${packageNames.length} package references, ` +
    `${contentFiles.length} content pages, all runtime exports discoverable.`,
)
