import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import '../english-seo.css';

const path = '/en/typescript-rpg-framework-comparison';
const title = 'Choosing a TypeScript RPG Framework';
const description =
  'Compare TypeScript RPG technology by layer: React Three Fiber rendering, modular RPG systems, full game frameworks, 2D engines, and authoritative multiplayer backends.';

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
      about: ['TypeScript RPG framework', 'React Three Fiber', 'game engine comparison'],
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

export default function TypeScriptRpgFrameworkComparison() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>Framework comparison</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Decision guide · Compare responsibilities</p>
          <h1>Choose a TypeScript RPG framework by the layer you need to own.</h1>
          <p className="ow-en-deck">
            A renderer, RPG systems library, full game framework, and managed multiplayer backend
            are not interchangeable. Start with the missing responsibility in your stack, then
            evaluate tools inside that category.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Categories</div>
          <div className="ow-en-copy">
            <h2>Compare like with like before comparing feature lists.</h2>
            <div className="ow-en-table-wrap">
              <table className="ow-en-table">
                <thead><tr><th>Layer</th><th>Primary responsibility</th><th>Examples</th></tr></thead>
                <tbody>
                  <tr><td>Renderer</td><td>3D scene graph, cameras, materials, and frames</td><td><a href="https://r3f.docs.pmnd.rs/">React Three Fiber</a>, Three.js</td></tr>
                  <tr><td>RPG systems layer</td><td>Quests, dialogue, inventory, AI, events, saves, and UI state</td><td>Overworld Engine</td></tr>
                  <tr><td>R3F game framework</td><td>World generation and integrated game architecture around R3F</td><td><a href="https://strata.game/">Strata</a></td></tr>
                  <tr><td>RPG framework</td><td>Integrated browser RPG/MMORPG development workflow</td><td><a href="https://docs.rpgjs.dev/">RPGJS</a></td></tr>
                  <tr><td>2D TypeScript engine</td><td>Rendering, scenes, input, physics, and engine loop</td><td><a href="https://excaliburjs.com/">Excalibur</a></td></tr>
                  <tr><td>Multiplayer backend</td><td>Rooms, authority, server runtime, or managed services</td><td><a href="https://docs.colyseus.io/">Colyseus</a>, <a href="https://heroiclabs.com/docs/nakama/">Nakama</a></td></tr>
                </tbody>
              </table>
            </div>
            <p>
              This table describes public product boundaries, not a winner. Projects can compose
              layers—for example React Three Fiber for rendering, Overworld for portable RPG rules,
              and a Colyseus room for authoritative session ownership.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Choose Overworld when</div>
          <div className="ow-en-copy">
            <h2>You already own rendering and want portable RPG systems.</h2>
            <p>
              Overworld is a fit when React Three Fiber or Three.js already matches your visual
              stack, but quests, dialogue, inventory, AI, saves, multiplayer primitives, and UI
              state are accumulating inside scene components. Its packages are independently
              adoptable and its headless systems can run without WebGL.
            </p>
            <ul>
              <li>You need the same game rules in R3F, tests, native webview shells, and Node.</li>
              <li>You want serializable content and explicit condition/effect registries.</li>
              <li>You prefer an application-owned composition root over a framework-owned singleton.</li>
              <li>You are comfortable selecting rendering, backend hosting, and production infrastructure separately.</li>
            </ul>
            <p>
              Overworld is not a renderer, asset pipeline, hosted backend, matchmaking service, or
              complete editor-driven engine. Those boundaries are deliberate and should be part of
              the adoption decision.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Choose an integrated stack when</div>
          <div className="ow-en-copy">
            <h2>You want the framework to make more decisions for you.</h2>
            <p>
              Evaluate an integrated RPG or game framework when you want conventions for the render
              loop, world format, server workflow, editor, or genre-specific project structure.
              Evaluate a full engine when 2D/3D rendering, physics, asset import, and deployment
              should come from one toolchain.
            </p>
            <div className="ow-en-grid">
              <article className="ow-en-card"><h3>RPGJS</h3><p>Consider it for a browser RPG/MMORPG workflow with a more integrated framework model.</p></article>
              <article className="ow-en-card"><h3>Strata</h3><p>Consider it when an R3F-centered framework and procedural world systems match the game.</p></article>
              <article className="ow-en-card"><h3>Excalibur</h3><p>Consider it when a TypeScript-first 2D engine should own rendering and the game loop.</p></article>
              <article className="ow-en-card"><h3>Native or WASM engines</h3><p>Consider them when native runtime targets and engine-owned rendering outweigh direct web integration.</p></article>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Multiplayer</div>
          <div className="ow-en-copy">
            <h2>Treat networking primitives and backend operations as separate decisions.</h2>
            <p>
              Overworld provides transport-neutral presence, rooms in a reference relay,
              input/state messages, prediction, and reconciliation helpers. It does not replace
              managed infrastructure, databases, fleet orchestration, or a product-specific
              authoritative simulation.
            </p>
            <p>
              Choose Colyseus when its room and server-state model matches your TypeScript backend.
              Evaluate Nakama when you need its broader server and social feature set. You can still
              keep portable domain rules separate from either backend so tests and clients share
              schemas without trusting client-owned state.
            </p>
            <Link className="ow-en-link" href="/en/authoritative-multiplayer-typescript">
              Design an authoritative TypeScript loop →
            </Link>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Evaluation checklist</div>
          <div className="ow-en-copy">
            <h2>Prototype the riskiest boundary, not the prettiest demo.</h2>
            <ol>
              <li>Write down which tool owns rendering, game rules, content, persistence, authority, and deployment.</li>
              <li>Build one complete interaction → quest → reward → UI flow with real save data.</li>
              <li>Run the rule layer without a renderer and verify deterministic tests.</li>
              <li>Test the actual target device, lifecycle, input method, and network conditions.</li>
              <li>Measure bundle size, update cadence, migration cost, license, and operational ownership.</li>
            </ol>
            <div className="ow-en-next">
              <h2>Try the architecture before choosing it</h2>
              <p>The repository starter turns the evaluation checklist into a runnable R3F vertical slice.</p>
              <Link className="ow-en-link" href="/en/react-three-fiber-rpg-starter">
                Run the React Three Fiber RPG starter →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
