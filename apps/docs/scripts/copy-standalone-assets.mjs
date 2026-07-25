import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const standaloneRoot = path.join(docsRoot, '.next/standalone/apps/docs')
const publicSource = path.join(docsRoot, 'public')

if (!fs.existsSync(standaloneRoot)) {
  throw new Error(`Next.js standalone output is missing: ${standaloneRoot}`)
}

if (fs.existsSync(publicSource)) {
  fs.cpSync(publicSource, path.join(standaloneRoot, 'public'), {
    recursive: true,
    force: true,
  })
}

console.log('Copied public assets into the standalone documentation bundle.')
