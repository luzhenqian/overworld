import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { articleStructuredDataFields } from '@/lib/structured-data';
import '../english-seo.css';

const path = '/en/typescript-game-ai-navigation-system';
const title = 'TypeScript Game AI and NPC Navigation';
const description =
  'Build deterministic TypeScript NPC AI with grid A*, hierarchical pathfinding, behavior trees, schedules, dynamic avoidance, and a thin React Three Fiber adapter.';

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
        'TypeScript game AI',
        'NPC navigation',
        'A* pathfinding',
        'behavior trees',
        'React Three Fiber',
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

export default function TypeScriptGameAiNavigationGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>Game AI and navigation</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">System guide · Headless TypeScript NPCs</p>
          <h1>TypeScript game AI with navigation that stays outside the render loop.</h1>
          <p className="ow-en-deck">
            Treat NPC intelligence as four cooperating layers: decisions choose an intention,
            pathfinding plans a route, locomotion advances a headless agent, and React Three Fiber
            presents the resulting position and heading.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Boundaries</div>
          <div className="ow-en-copy">
            <h2>Do not make one update function responsible for every kind of AI.</h2>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>Decision</h3>
                <p>A behavior tree or schedule chooses patrol, follow, go-to, wander, or idle.</p>
              </article>
              <article className="ow-en-card">
                <h3>Global navigation</h3>
                <p>A* finds a valid route around static walls. HPA* reduces search work on large grids.</p>
              </article>
              <article className="ow-en-card">
                <h3>Local locomotion</h3>
                <p>The agent consumes the route at a world-units-per-second speed and avoids moving obstacles.</p>
              </article>
              <article className="ow-en-card">
                <h3>Presentation</h3>
                <p>An R3F component copies position and heading into a group. It does not own the rules.</p>
              </article>
            </div>
            <p>
              This split lets the same NPC run in a browser, a deterministic test, or a Node.js
              simulation. It also makes failures diagnosable: a bad decision is different from an
              unreachable destination, a blocked crowd, or a model with the wrong forward axis.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Pathfinding</div>
          <div className="ow-en-copy">
            <h2>Build one navigation grid, then ask pure functions for routes.</h2>
            <p>
              Overworld&apos;s grid A* uses eight-direction movement, prevents diagonal
              corner-cutting, inflates circular obstacles by the agent radius, and smooths the
              result when line of sight permits.
            </p>
            <pre className="ow-en-code"><code>{`import {
  createNavGrid,
  findPath,
} from '@overworld-engine/ai'

const grid = createNavGrid({
  bounds: { minX: 0, maxX: 80, minZ: 0, maxZ: 80 },
  cellSize: 1,
  agentRadius: 0.45,
  obstacles: level.colliders.map(({ x, z, radius }) => ({
    x, z, radius,
  })),
})

const route = findPath(grid, [4, 6], [62, 51])
if (route === null) {
  showUnreachableFeedback()
}`}</code></pre>
            <p>
              Tile maps can use <code>createNavGridFromCells</code> so one wall value blocks
              exactly one cell. When doors or obstacles change, update the grid deliberately.
              A route is a snapshot of navigability, not a promise that the world will remain still.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Agent</div>
          <div className="ow-en-copy">
            <h2>Let a headless agent own movement state, not a mesh.</h2>
            <pre className="ow-en-code"><code>{`import { createAgent } from '@overworld-engine/ai'

const guard = createAgent({
  grid,
  position: [4, 6],
  speed: 1.8,
  random: seededRandom,
  avoid: {
    obstacles: () => crowdColliders,
    lookahead: 1.5,
    agentRadius: 0.4,
    stuckAfterMs: 1200,
  },
})

guard.patrol(
  [[4, 6], [20, 6], [20, 18]],
  { pauseMs: 800 },
)

// Browser, server, or test loop:
const status = guard.update(deltaMs)`}</code></pre>
            <p>
              The agent reports plain position, heading, movement state, behavior, and arrival
              events. Inject a random source for reproducible wandering. Pass elapsed time into
              <code>update</code> so movement stays frame-rate independent and can be replayed.
            </p>
            <p>
              Dynamic avoidance is a deterministic local steering layer. It deflects the current
              step around moving circles without rewriting the planned route. If every direction
              remains blocked, the agent can replan after a configured timeout.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Decisions</div>
          <div className="ow-en-copy">
            <h2>Compose intentions with a behavior tree and a shared blackboard.</h2>
            <pre className="ow-en-code"><code>{`import {
  createBehaviorTree,
  sequence,
  selector,
  condition,
  goToAction,
  patrolAction,
} from '@overworld-engine/ai'

const tree = createBehaviorTree(
  selector(
    sequence(
      condition(({ blackboard }) => blackboard.alert),
      goToAction(guard, alarmPosition),
    ),
    patrolAction(guard, patrolPoints, { pauseMs: 800 }),
  ),
  { alert: false },
)`}</code></pre>
            <p>
              Sequences and selectors remember a running child, while conditions can re-evaluate
              changing world facts. Keep perception and combat policy in your game layer; write
              those facts into the blackboard or expose them through conditions. The framework
              supplies composition and agent actions, not a universal enemy brain.
            </p>
            <p>
              For ambient NPCs, schedules can map phases such as day, dusk, and night to declarative
              behaviors. That is often clearer than forcing every shopkeeper into a combat-style
              decision tree.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / React Three Fiber</div>
          <div className="ow-en-copy">
            <h2>Use one driver and make the scene adapter visually thin.</h2>
            <pre className="ow-en-code"><code>{`import { NPCWalker } from '@overworld-engine/ai'

function Guard() {
  return (
    <NPCWalker
      agent={guard}
      tree={tree}
      rotationOffset={Math.PI}
    >
      <GuardModel />
    </NPCWalker>
  )
}`}</code></pre>
            <p>
              Passing the tree makes <code>NPCWalker</code> tick the decision tree and agent once per
              frame. Do not also call <code>agent.update</code> elsewhere or the NPC will
              double-step. If your simulation owns the clock, use <code>driven={'{false}'}</code>;
              the component will only mirror the latest position and heading.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">06 / Scale and tests</div>
          <div className="ow-en-copy">
            <h2>Scale route planning separately from NPC count.</h2>
            <p>
              For large grid worlds, <code>createHierarchicalGrid</code> builds an HPA*-style
              cluster graph. <code>findPathHierarchical</code> searches that smaller graph, refines
              each segment in bounded windows, and falls back to full-grid A* when needed. Rebuild
              the hierarchy after changing the underlying grid.
            </p>
            <ul>
              <li>Test blocked targets, narrow corners, unreachable regions, and dynamic doors.</li>
              <li>Inject time and randomness; assert plain agent status without mounting React.</li>
              <li>Measure visited nodes before adopting hierarchical navigation.</li>
              <li>Keep animation state derived from locomotion instead of feeding it back into AI.</li>
            </ul>
            <p>
              This package is grid navigation, behavior composition, schedules, and local
              avoidance. It is not a navmesh generator, crowd simulator, perception model,
              animation graph, or machine-learning runtime.
            </p>
            <div className="ow-en-next">
              <h2>Put AI inside a complete renderer-independent RPG architecture</h2>
              <p>Connect headless NPC state to quests, dialogue, networking, and an R3F scene.</p>
              <Link className="ow-en-link" href="/en/react-three-fiber-npc-interaction">
                Connect moving NPCs to proximity and interaction →
              </Link>
              <Link className="ow-en-link" href="/en/react-three-fiber-rpg-framework">
                Read the React Three Fiber RPG architecture guide →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
