import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import '../english-seo.css';

const path = '/en/headless-typescript-quest-system';
const title = 'Headless TypeScript Quest System Guide';
const description =
  'Build a headless TypeScript quest system with data-driven objectives, typed events, condition and effect registries, persistence, quest chains, and deterministic tests.';

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
      headline: title,
      description,
      url: absoluteUrl(path),
      inLanguage: 'en',
      author: { '@type': 'Organization', name: 'Overworld Engine contributors' },
      about: ['TypeScript', 'quest system', 'event-driven architecture', 'game development'],
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

export default function HeadlessQuestGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>Headless quest system</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Implementation guide · TypeScript quest engine</p>
          <h1>A headless TypeScript quest system built on events, not imports.</h1>
          <p className="ow-en-deck">
            Quest logic should not import combat, inventory, wallet, UI, or the renderer. Model
            objectives as data, progress them from typed events, and resolve prerequisites and
            rewards through registries owned by the game.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Failure mode</div>
          <div className="ow-en-copy">
            <h2>Direct imports turn quests into a dependency hub.</h2>
            <p>
              A typical first quest system switches on objective types and calls every gameplay
              store directly. It works for a prototype, but each new mechanic edits the central
              engine. The system becomes tied to one renderer, one save shape, and one game.
            </p>
            <p>
              A reusable quest engine only needs to understand lifecycle and progress. The game
              supplies meaning at the boundary: events report what happened, conditions answer
              questions, and effects perform rewards.
            </p>
            <ul>
              <li><strong>Objectives:</strong> target values plus the event that advances them.</li>
              <li><strong>Prerequisites:</strong> completed quest IDs and named condition references.</li>
              <li><strong>Rewards:</strong> named effect references with serializable parameters.</li>
              <li><strong>State:</strong> active progress, completed IDs, and registered definitions.</li>
            </ul>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Schema</div>
          <div className="ow-en-copy">
            <h2>Keep quest content serializable.</h2>
            <p>
              Functions inside content cannot be validated, sent over a network, edited safely, or
              compared in source control. Use references instead. They form a stable contract
              between authoring tools and runtime behavior.
            </p>
            <pre className="ow-en-code"><code>{`const walkTheCity = {
  id: 'walk-the-city',
  prerequisites: {
    conditions: [{ type: 'player.minLevel', params: { level: 2 } }],
  },
  objectives: [
    {
      id: 'distance',
      target: 100,
      trigger: { event: 'player:moved', amountFrom: 'distance' },
    },
    {
      id: 'meet-guide',
      target: 1,
      trigger: {
        event: 'dialogue:ended',
        filter: { dialogueId: 'city-guide' },
      },
    },
  ],
  rewards: [{ type: 'wallet.addGold', params: { amount: 100 } }],
  chainNext: ['visit-market'],
}`}</code></pre>
            <p>
              Filters match event payload fields, while <code>amountFrom</code> selects a numeric
              payload value. Without <code>amountFrom</code>, each matching event advances by one.
              This small vocabulary covers collection, travel, interaction, dialogue, combat, and
              many game-specific objectives without hard-coding their types.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Runtime</div>
          <div className="ow-en-copy">
            <h2>Subscribe only to events required by active objectives.</h2>
            <p>
              When a quest starts, the engine can derive the unique event set needed by unfinished
              objectives. It subscribes once per event, dispatches progress to matching objectives,
              and removes subscriptions as objectives and quests complete.
            </p>
            <pre className="ow-en-code"><code>{`const conditions = createConditionRegistry<GameContext>()
const effects = createEffectRegistry<GameContext>()

conditions.register('player.minLevel', (params, ctx) =>
  ctx.player.level >= Number(params.level)
)
effects.register('wallet.addGold', (params, ctx) =>
  ctx.wallet.add(Number(params.amount))
)

const quests = createQuestEngine({
  quests: [walkTheCity],
  conditions,
  effects,
  context: () => gameContext,
  events: gameEvents,
})

quests.startQuest('walk-the-city')
gameEvents.emit('player:moved', { distance: 12, position })`}</code></pre>
            <p>
              Completion follows an explicit order: clamp the objective to its target, emit
              objective completion, confirm all objectives, execute rewards, record the completed
              quest, emit quest completion, then evaluate chained quests. Documenting that order
              matters because UI, analytics, achievements, and replication may observe it.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Persistence</div>
          <div className="ow-en-copy">
            <h2>Persist progress, not executable behavior.</h2>
            <p>
              Save active objective values and completed quest IDs. Reload definitions and registry
              behavior from the current build. This keeps save data small and allows content fixes
              without serializing functions.
            </p>
            <p>
              Version the persisted shape and define migrations before release. On restore, validate
              unknown quest and objective IDs, clamp values to current targets, and rebuild event
              subscriptions from restored active state. A storage adapter should be injected so the
              same engine can use local storage, a desktop save file, a database, or an in-memory
              test implementation.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Testing</div>
          <div className="ow-en-copy">
            <h2>Drive tests with events and control every source of time.</h2>
            <p>
              Create a fresh event bus and in-memory storage for each test. Inject the clock when
              timestamps are recorded. Register spy effects, start a quest, emit facts, and assert
              both state and emitted lifecycle events.
            </p>
            <ol>
              <li>Verify irrelevant events and non-matching payloads do not advance progress.</li>
              <li>Verify progress clamps at the target and completion occurs exactly once.</li>
              <li>Verify rewards execute before observers receive quest completion if that is the contract.</li>
              <li>Verify restored quests re-subscribe and continue from saved progress.</li>
              <li>Verify disposal removes subscriptions for tests, hot reload, and room teardown.</li>
            </ol>
            <div className="ow-en-next">
              <h2>Use it with an R3F game</h2>
              <p>
                Keep interaction and animation in the scene, then connect them to this quest engine
                through typed domain events.
              </p>
              <Link className="ow-en-link" href="/en/react-three-fiber-rpg-framework">
                Read the React Three Fiber architecture guide →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
