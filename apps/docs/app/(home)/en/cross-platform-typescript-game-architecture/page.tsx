import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { articleStructuredDataFields } from '@/lib/structured-data';
import '../english-seo.css';

const path = '/en/cross-platform-typescript-game-architecture';
const title = 'Cross-Platform TypeScript Game Architecture';
const description =
  'Share TypeScript game rules across the web, Tauri, Capacitor, WeChat, Telegram, and Node by isolating rendering, storage, lifecycle, and platform capabilities.';

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
      about: ['TypeScript', 'cross-platform games', 'Tauri', 'Capacitor', 'WeChat Mini Game'],
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

export default function CrossPlatformTypeScriptGameArchitecture() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>Cross-platform architecture</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Architecture guide · Six runtime targets</p>
          <h1>Cross-platform TypeScript games without platform checks in every system.</h1>
          <p className="ow-en-deck">
            Share content and game rules across browser, desktop, mobile, mini apps, and Node.
            Keep each delivery shell small by putting storage, lifecycle, input, networking, and
            rendering differences behind explicit capabilities.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / The boundary</div>
          <div className="ow-en-copy">
            <h2>Share rules and content—not every line of application code.</h2>
            <p>
              Cross-platform architecture works when the portable layer has no dependency on a DOM,
              WebGL context, native SDK, or component lifecycle. Quest objectives, dialogue choices,
              inventory operations, achievements, and validated content can then run in a browser,
              a test process, or an authoritative Node server.
            </p>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>Portable domain core</h3>
                <p>Serializable content, state machines, typed events, conditions, and effects.</p>
              </article>
              <article className="ow-en-card">
                <h3>Composition root</h3>
                <p>Creates engines, selects adapters, registers game-specific rules, and wires events.</p>
              </article>
              <article className="ow-en-card">
                <h3>Presentation</h3>
                <p>R3F or Three.js renders the world; React, WXML, or another UI projects state.</p>
              </article>
              <article className="ow-en-card">
                <h3>Platform shell</h3>
                <p>Owns native SDKs, app lifecycle, storage, safe areas, back buttons, and distribution.</p>
              </article>
            </div>
            <p>
              The goal is not “100% shared code.” The goal is one authoritative implementation of
              game rules, with replaceable delivery edges.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Capability bridge</div>
          <div className="ow-en-copy">
            <h2>Ask for capabilities instead of branching on platform names.</h2>
            <p>
              A quest engine needs storage; it does not need to know whether that storage is
              localStorage, a Tauri file, or WeChat storage. Application code chooses the adapter
              once and injects the narrow interface.
            </p>
            <pre className="ow-en-code"><code>{`import { createBridge } from '@overworld-engine/platform'
import { gameEvents } from '@overworld-engine/core'
import { createQuestEngine } from '@overworld-engine/quest'

const bridge = createBridge()
const unbindLifecycle = bridge.bindLifecycle(gameEvents)

const quests = createQuestEngine({
  quests: QUESTS,
  conditions,
  effects,
  events: gameEvents,
  persist: { storage: () => bridge.storage() },
})

// UI handles app:back according to current state.
gameEvents.on('app:back', () => {
  if (dialogue.getState().activeDialogue) dialogue.end()
})`}</code></pre>
            <p>
              Keep SDK imports in the shell or adapter package. That prevents a native dependency
              from leaking into domain bundles and makes unsupported capabilities visible during
              composition rather than at an arbitrary call site.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Target matrix</div>
          <div className="ow-en-copy">
            <h2>Choose the shell that matches the distribution target.</h2>
            <div className="ow-en-table-wrap">
              <table className="ow-en-table">
                <thead><tr><th>Target</th><th>Rendering host</th><th>Platform edge</th><th>Reference</th></tr></thead>
                <tbody>
                  <tr><td>Web</td><td>R3F Canvas</td><td>Browser APIs</td><td><Link href="/docs/starter">Starter</Link></td></tr>
                  <tr><td>Telegram Mini App</td><td>WebView</td><td>Telegram bridge</td><td>Repository example</td></tr>
                  <tr><td>macOS / Windows</td><td>Tauri WebView</td><td>File storage and native lifecycle</td><td>Repository example</td></tr>
                  <tr><td>iOS / Android</td><td>Capacitor WebView</td><td>Safe areas and app lifecycle</td><td>Repository example</td></tr>
                  <tr><td>WeChat Mini Game</td><td>R3F createRoot</td><td>Canvas, pointer, audio, socket adapters</td><td>Repository example</td></tr>
                  <tr><td>Node</td><td>None</td><td>Server transport and persistence</td><td><Link href="/docs/guides/authoritative-multiplayer">Authority guide</Link></td></tr>
                </tbody>
              </table>
            </div>
            <p>
              A WeChat Mini Program without a 3D canvas can still run the headless systems and
              render state with WXML. A WeChat Mini Game needs a canvas and SDK-specific adapters.
              Treat those as different products even though they share domain packages.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Input and lifecycle</div>
          <div className="ow-en-copy">
            <h2>Normalize intentions, not raw device events.</h2>
            <p>
              Keyboard keys, touch sticks, controller axes, and native back buttons should become
              domain-level intentions such as move, interact, pause, and back. Input priority can
              then block movement while dialogue or a modal is active without platform-specific
              conditionals in the player controller.
            </p>
            <ul>
              <li>Bind visibility, activation, focus, and native app callbacks to pause/resume events.</li>
              <li>Route the back action through the UI state stack before allowing the shell to exit.</li>
              <li>Choose quality presets from device capabilities, then let players override them.</li>
              <li>Keep safe-area CSS and native permissions in the platform shell.</li>
            </ul>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Verification</div>
          <div className="ow-en-copy">
            <h2>Test the shared core once, then test every adapter seam.</h2>
            <p>
              Unit tests should inject storage, clocks, event buses, and seeded randomness into the
              portable core. Integration tests should verify that each shell forwards lifecycle,
              input, and persistence correctly. A successful browser build does not prove that
              touch, native resume, or a mini-game pointer bridge works.
            </p>
            <pre className="ow-en-code"><code>{`// Domain test: no renderer and no native shell.
const events = new EventBus()
const game = createEngines({
  events,
  rng: createSeededRng(42),
  storage: createMemoryStorage(),
})

events.emit('item:collected', { itemId: 'crystal', quantity: 1 })
expect(game.quests.getState().active).toMatchObject({
  collect_crystals: { progress: 1 },
})`}</code></pre>
            <div className="ow-en-next">
              <h2>See the boundary in a complete R3F slice</h2>
              <p>Run the repository starter, then trace one interaction across scene, systems, reward, and HUD.</p>
              <Link className="ow-en-link" href="/en/react-three-fiber-rpg-starter">
                Open the React Three Fiber RPG starter guide →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
