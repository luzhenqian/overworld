import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { articleStructuredDataFields } from '@/lib/structured-data';
import '../english-seo.css';

const path = '/en/typescript-game-save-system';
const title = 'TypeScript Game Save System Architecture';
const description =
  'Design a TypeScript game save system with versioned migrations, named slots, storage adapters, atomic desktop files, backup recovery, and explicit cloud authority.';

export const metadata: Metadata = {
  title: { absolute: `${title} | Overworld Engine` },
  description,
  alternates: { canonical: path },
  openGraph: {
    type: 'article',
    url: path,
    title,
    description,
    locale: 'en_US',
    siteName: siteConfig.name,
    images: [{ url: '/og/home', width: 1200, height: 630, alt: title }],
  },
};

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'TechArticle',
      '@id': `${absoluteUrl(path)}#article`,
      ...articleStructuredDataFields(path),
      headline: title,
      description,
      url: absoluteUrl(path),
      inLanguage: 'en',
      author: { '@type': 'Organization', name: 'Overworld Engine contributors' },
      about: [
        'TypeScript game save system',
        'save migration',
        'cross-platform game saves',
        'Tauri',
        'cloud saves',
      ],
    },
    {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Overworld Engine', item: absoluteUrl('/en') },
        { '@type': 'ListItem', position: 2, name: title, item: absoluteUrl(path) },
      ],
    },
  ],
};

export default function TypeScriptGameSaveSystemGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>Game save architecture</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Architecture guide · Cross-platform persistence</p>
          <h1>A TypeScript game save system that survives new releases and interrupted writes.</h1>
          <p className="ow-en-deck">
            A save feature is not one serialization call. Separate the state you persist, the
            schema version you migrate, the slots players manage, the storage backend you write,
            and the server authority your client must never impersonate.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Layers</div>
          <div className="ow-en-copy">
            <h2>Treat save compatibility and storage durability as different problems.</h2>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>State selection</h3>
                <p>Persist durable gameplay facts, not React nodes, scene objects, sockets, or caches.</p>
              </article>
              <article className="ow-en-card">
                <h3>Schema evolution</h3>
                <p>Stamp a version and migrate every supported historical payload into today&apos;s shape.</p>
              </article>
              <article className="ow-en-card">
                <h3>Storage durability</h3>
                <p>Use a backend appropriate to Web, desktop, mobile, mini games, or a remote service.</p>
              </article>
              <article className="ow-en-card">
                <h3>Authority</h3>
                <p>Decide which state the client may own and which economy or multiplayer facts require a server.</p>
              </article>
            </div>
            <p>
              A migration fixes a valid old payload whose shape changed. Backup recovery finds a
              physically intact generation after corruption or an interrupted write. Neither one
              replaces authentication, conflict resolution, or authoritative backend validation.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Versioning</div>
          <div className="ow-en-copy">
            <h2>Make every schema change an explicit, ordered migration.</h2>
            <pre className="ow-en-code"><code>{`import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  defineMigrations,
  persistOptions,
} from '@overworld-engine/core'

const migrate = defineMigrations({
  1: (state) => ({
    ...state,
    gold: state.coins ?? 0,
  }),
  2: (state) => ({
    ...state,
    gold: Number(state.gold),
  }),
})

export const useWallet = create<WalletState>()(
  persist(
    initializer,
    persistOptions({
      name: 'wallet',
      version: 2,
      migrate,
    }),
  ),
)`}</code></pre>
            <p>
              Migration keys are target versions and run in ascending order above the stored
              version. Keep them pure, preserve unknown data deliberately, and test direct upgrades
              from every version you still support—not only from the immediately previous release.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Named slots</div>
          <div className="ow-en-copy">
            <h2>Copy a consistent live-save namespace into player-facing slots.</h2>
            <pre className="ow-en-code"><code>{`import {
  createSaveSlots,
  fromWebStorage,
} from '@overworld-engine/core'

const slots = createSaveSlots({
  storage: fromWebStorage(localStorage),
  prefix: 'overworld',
})

slots.saveTo('manual-1')
slots.saveTo('checkpoint')

const saves = slots.listSlots()
const restored = slots.loadFrom('manual-1')
if (restored) {
  window.location.reload()
}`}</code></pre>
            <p>
              The slot manager snapshots all live keys under the shared prefix while excluding its
              own slot namespace. Restoring rewrites storage; already-hydrated Zustand stores must
              reload or call their persist rehydration methods before the restored state becomes
              visible in memory.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Desktop durability</div>
          <div className="ow-en-copy">
            <h2>Commit desktop files through a verified temporary generation.</h2>
            <pre className="ow-en-code"><code>{`import { createTauriSaveFileBackend }
  from '@overworld-engine/adapters-savefile'
import {
  commitSlot,
  recoverSlot,
} from '@overworld-engine/core'

const backend = createTauriSaveFileBackend()

await commitSlot(
  backend,
  'saves/slot-1',
  encodedPayload,
  { backupCount: 2 },
)

const outcome = await recoverSlot(backend, 'saves/slot-1', {
  backupCount: 2,
  isValid: validateGameSave,
})`}</code></pre>
            <p>
              The commit sequence is temporary write, filesystem sync, read-back verification,
              oldest-first backup rotation, then atomic rename. Recovery scans current, backup 1,
              backup 2, and later generations until both the physical envelope and your optional
              business validator pass.
            </p>
            <p>
              The adapter treats payloads as opaque bytes. Your game still owns fields such as
              schema version, build compatibility, content revision, random roots, and any
              domain-level checksum. Browser storage has no equivalent to a real filesystem sync,
              so do not claim identical durability across platforms.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Cross-platform</div>
          <div className="ow-en-copy">
            <h2>Keep one save model and swap the platform boundary.</h2>
            <ul>
              <li>Web: localStorage or another enumerable browser storage for local progress and settings.</li>
              <li>Tauri desktop: an atomic file backend with real fsync and rotating backups.</li>
              <li>Capacitor, WeChat, Telegram, and Steam: adapters that preserve the same persistence contracts.</li>
              <li>Node and tests: memory or application-owned storage with injected clocks.</li>
            </ul>
            <p>
              A REST storage adapter can synchronize non-authoritative snapshots such as settings,
              unlocked local content, or single-player progress. Flush pending writes at lifecycle
              boundaries, authenticate every request, and define conflict behavior explicitly.
              Last-write-wins is a policy, not an inevitable property of cloud saves.
            </p>
            <p>
              Currency, paid inventory, competitive progression, and shared-world state should not
              become authoritative merely because a client uploaded JSON. Store or reconstruct
              those facts on a trusted backend and validate client operations there.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">06 / Verification</div>
          <div className="ow-en-copy">
            <h2>Test the failure matrix before players create irreplaceable saves.</h2>
            <ul>
              <li>Load every supported historical version and compare the migrated semantic state.</li>
              <li>Reject malformed JSON, invalid headers, incompatible content, and impossible values.</li>
              <li>Interrupt commits at each operation and confirm recovery returns an intact generation.</li>
              <li>Exercise quota exhaustion, permission denial, offline writes, retry, and account switching.</li>
              <li>Test two devices editing the same cloud snapshot and surface the chosen conflict policy.</li>
              <li>Record which backup was used so support can diagnose silent corruption and recovery.</li>
            </ul>
            <p>
              Overworld supplies persistence conventions, sequential migrations, named snapshots,
              REST-compatible storage, atomic file orchestration, and platform adapters. Your game
              defines the save schema, retention policy, cloud service, authorization model, and
              domain validation.
            </p>
            <div className="ow-en-next">
              <h2>Share the game rules, not platform APIs</h2>
              <p>See how the same domain systems run across Web, desktop, mobile, mini apps, and Node.</p>
              <Link className="ow-en-link" href="/en/cross-platform-typescript-game-architecture">
                Read the cross-platform architecture guide →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
