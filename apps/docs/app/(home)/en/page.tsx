import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import './english-seo.css';

const title = 'TypeScript RPG Framework for React Three Fiber';
const description =
  'A modular TypeScript RPG systems framework for React Three Fiber and Three.js: quests, dialogue, inventory, AI, multiplayer, UI, persistence, and cross-platform adapters.';

export const metadata: Metadata = {
  title: { absolute: `${title} | Overworld Engine` },
  description,
  alternates: {
    canonical: '/en',
    languages: {
      'zh-CN': '/',
      en: '/en',
      'x-default': '/en',
    },
  },
  openGraph: {
    type: 'website',
    url: '/en',
    title,
    description,
    locale: 'en_US',
    siteName: siteConfig.name,
    images: [{ url: '/og/home', width: 1200, height: 630, alt: title }],
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
    images: ['/og/home'],
  },
};

const faq = [
  {
    question: 'Is Overworld a renderer or a replacement for React Three Fiber?',
    answer:
      'No. React Three Fiber and Three.js own rendering. Overworld supplies renderer-independent RPG systems and the contracts that connect them to your scene and React UI.',
  },
  {
    question: 'Can I adopt only the quest or dialogue system?',
    answer:
      'Yes. Packages are independently published and most domain packages depend only on the small core package. You can begin with one vertical slice instead of migrating an entire game.',
  },
  {
    question: 'Does the same game logic run on a server?',
    answer:
      'Yes. Headless domain systems can run in Node.js without a DOM or WebGL context. That makes authoritative simulation, deterministic tests, and shared validation practical.',
  },
];

const structuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'SoftwareSourceCode',
      '@id': absoluteUrl('/en#software'),
      name: siteConfig.name,
      description,
      url: absoluteUrl('/en'),
      codeRepository: siteConfig.repositoryUrl,
      programmingLanguage: 'TypeScript',
      runtimePlatform: ['Web', 'Node.js', 'Tauri', 'Capacitor', 'WeChat Mini Game'],
      license: siteConfig.licenseUrl,
      isAccessibleForFree: true,
    },
    {
      '@type': 'FAQPage',
      '@id': absoluteUrl('/en#faq'),
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    },
  ],
};

export default function EnglishHomePage() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <div className="ow-en-shell">
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Modular RPG systems · TypeScript · MIT</p>
          <h1>A TypeScript RPG framework that works with your renderer.</h1>
          <p className="ow-en-deck">
            Overworld Engine gives React Three Fiber and Three.js games the systems around the
            scene: quests, dialogue, inventory, AI, multiplayer, UI, persistence, and platform
            adapters. Keep rendering in R3F. Keep game rules portable and testable.
          </p>
          <div className="ow-en-actions">
            <Link href="/docs">Start with the quickstart →</Link>
            <Link href="/en/react-three-fiber-rpg-framework">Read the R3F architecture guide</Link>
            <a href={siteConfig.repositoryUrl}>View source on GitHub</a>
          </div>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Positioning</div>
          <div className="ow-en-copy">
            <h2>RPG systems, without a monolithic engine singleton.</h2>
            <p>
              A renderer solves cameras, materials, meshes, and frames. An RPG also needs long-lived
              state, content schemas, objectives, rewards, saves, input arbitration, networking, and
              UI projections. Putting all of that inside React components or scene objects makes
              those rules difficult to test and impossible to reuse on a server.
            </p>
            <p>
              Overworld separates <strong>serializable content</strong>,{' '}
              <strong>headless state machines</strong>, and <strong>rendering adapters</strong>.
              Your application remains the composition root. There is no global engine object that
              has to own the render loop, routing, or product-specific game rules.
            </p>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>Renderer-independent</h3>
                <p>Use React Three Fiber, vanilla Three.js, another renderer, or no renderer at all.</p>
              </article>
              <article className="ow-en-card">
                <h3>Event-driven</h3>
                <p>Typed facts connect quests, achievements, audio, analytics, and UI without imports.</p>
              </article>
              <article className="ow-en-card">
                <h3>Incrementally adoptable</h3>
                <p>Install one system for the slice you are building instead of taking a full stack.</p>
              </article>
              <article className="ow-en-card">
                <h3>Cross-platform</h3>
                <p>Keep domain logic shared while bridges isolate Web, desktop, mobile, and mini-game APIs.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Integration</div>
          <div className="ow-en-copy">
            <h2>Connect a scene event to a complete gameplay flow.</h2>
            <p>
              Scene code emits a typed fact. The quest engine advances matching objectives, runs a
              registered reward, and emits completion. React UI subscribes to stores or events. No
              system needs to import the others.
            </p>
            <pre className="ow-en-code"><code>{`import { gameEvents } from '@overworld-engine/core'
import { createQuestEngine } from '@overworld-engine/quest'

const quests = createQuestEngine({
  quests: QUESTS,
  conditions,
  effects,
  events: gameEvents,
})

// Called from an R3F controller, Three.js system, or server simulation:
gameEvents.emit('player:moved', { position, distance: 1.4 })

// quest objective → reward effect → quest:completed → React UI`}</code></pre>
            <p>
              This boundary also makes automated tests cheap: inject an event bus, storage adapter,
              clock, and random source; drive the system with events; assert against plain state.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Use cases</div>
          <div className="ow-en-copy">
            <h2>Choose the systems your game needs now.</h2>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>Quest and narrative games</h3>
                <p>Data-driven quest chains, dialogue sessions, conditions, effects, tutorials, and achievements.</p>
              </article>
              <article className="ow-en-card">
                <h3>Open and dense worlds</h3>
                <p>Scene entities, environment simulation, minimaps, loading boundaries, AI, and navigation.</p>
              </article>
              <article className="ow-en-card">
                <h3>Multiplayer RPGs</h3>
                <p>Headless server execution, transport-neutral networking, relay support, and shared schemas.</p>
              </article>
              <article className="ow-en-card">
                <h3>Multi-platform releases</h3>
                <p>Shared game rules with explicit adapters for save files, Steam, WeChat, Tauri, and Capacitor.</p>
              </article>
            </div>
            <h3>Start from the problem, not the package list</h3>
            <p>
              If rendering and game state are becoming entangled, begin with the{' '}
              <Link href="/en/react-three-fiber-rpg-framework">React Three Fiber RPG architecture guide</Link>.
              If quest logic imports the wallet, inventory, combat, and UI directly, use the{' '}
              <Link href="/en/headless-typescript-quest-system">headless TypeScript quest system guide</Link>.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / System guides</div>
          <div className="ow-en-copy">
            <h2>Build one renderer-independent system at a time.</h2>
            <p>
              Each guide follows a real vertical slice from serializable content or validated input
              through runtime state, events, UI, persistence, and server boundaries.
            </p>
            <div className="ow-en-grid">
              <Link className="ow-en-card" href="/en/headless-typescript-quest-system">
                <h3>Headless quest system</h3>
                <p>Event-driven objectives, conditions, rewards, chains, persistence, and testing.</p>
              </Link>
              <Link className="ow-en-card" href="/en/typescript-dialogue-system">
                <h3>TypeScript dialogue system</h3>
                <p>Serializable trees, conditional choices, declarative effects, localization, and React UI.</p>
              </Link>
              <Link className="ow-en-card" href="/en/headless-typescript-inventory-system">
                <h3>Headless inventory system</h3>
                <p>Item definitions, stacking, capacity, overflow, effects, events, and save state.</p>
              </Link>
              <Link className="ow-en-card" href="/en/authoritative-multiplayer-typescript">
                <h3>Authoritative multiplayer</h3>
                <p>Validated inputs, deterministic simulation, prediction, reconciliation, and snapshots.</p>
              </Link>
              <Link className="ow-en-card" href="/en/typescript-game-ai-navigation-system">
                <h3>Game AI and NPC navigation</h3>
                <p>Grid A*, behavior trees, headless agents, schedules, avoidance, and R3F presentation.</p>
              </Link>
              <Link className="ow-en-card" href="/en/typescript-game-save-system">
                <h3>Game save architecture</h3>
                <p>Versioned migrations, named slots, atomic files, recovery, and cloud authority.</p>
              </Link>
              <Link className="ow-en-card" href="/en/react-three-fiber-game-state-management">
                <h3>R3F game state management</h3>
                <p>Zustand stores, frame-local refs, typed events, selectors, saves, and authority.</p>
              </Link>
              <Link className="ow-en-card" href="/en/react-three-fiber-game-performance">
                <h3>R3F game performance</h3>
                <p>Profiling, frame loops, instancing, LOD, adaptive quality, and staged asset loading.</p>
              </Link>
              <Link className="ow-en-card" href="/en/react-three-fiber-npc-interaction">
                <h3>R3F NPC interaction</h3>
                <p>Proximity targets, keyboard and touch actions, dialogue, quests, input locks, and tests.</p>
              </Link>
              <Link className="ow-en-card" href="/en/type-safe-event-bus-games-typescript">
                <h3>Type-safe game event bus</h3>
                <p>Payload contracts, commands versus facts, lifecycles, delivery order, tests, and safe relays.</p>
              </Link>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / FAQ</div>
          <div className="ow-en-copy">
            <h2>Choose an architecture, then ship a complete slice.</h2>
            <div className="ow-en-grid">
              <Link className="ow-en-card" href="/en/react-three-fiber-rpg-starter">
                <h3>R3F RPG starter</h3>
                <p>Run movement, dialogue, quests, inventory, rewards, HUD, AI, and tests.</p>
              </Link>
              <Link className="ow-en-card" href="/en/cross-platform-typescript-game-architecture">
                <h3>Cross-platform architecture</h3>
                <p>Share domain rules across Web, desktop, mobile, mini apps, and Node.</p>
              </Link>
              <Link className="ow-en-card" href="/en/typescript-rpg-framework-comparison">
                <h3>Framework comparison</h3>
                <p>Compare renderers, RPG systems, integrated frameworks, engines, and backends.</p>
              </Link>
              <Link className="ow-en-card" href="/docs/package-selection">
                <h3>Package selection</h3>
                <p>Install only the Overworld packages needed by the first gameplay slice.</p>
              </Link>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">06 / FAQ</div>
          <div className="ow-en-copy ow-en-faq">
            <h2>Questions before adopting Overworld</h2>
            {faq.map((item) => (
              <div key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
