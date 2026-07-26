import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { articleStructuredDataFields } from '@/lib/structured-data';
import '../english-seo.css';

const path = '/en/typescript-rpg-content-validation';
const title = 'Validate Data-Driven RPG Content in TypeScript';
const description =
  'Validate content-driven quests, dialogue, items, and achievements in TypeScript with JSON Schema, cross-reference checks, registry validation, CI gates, and safe hot reloads.';

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

const faq = [
  {
    question: 'Why validate game content when it is already written in TypeScript?',
    answer:
      'TypeScript checks source during compilation, then erases its types. Remote JSON, editor exports, mod files, cached packs, and stale deployments still arrive as runtime values. Validate every untrusted boundary before treating its data as game content.',
  },
  {
    question: 'Should RPG content validation use Zod or JSON Schema?',
    answer:
      'Either can validate structure. JSON Schema is convenient for JSON editors, language-independent pipelines, and generated forms; a TypeScript-first validator can be convenient inside one codebase. Structural validation still needs domain checks for duplicate IDs, broken graph edges, and references across files.',
  },
  {
    question: 'What should make a content build fail?',
    answer:
      'Fail on content that cannot execute safely, such as invalid objective targets, missing start nodes, broken next links, duplicate IDs, or references to unknown quests. Keep suspicious but legal states, such as unreachable dialogue nodes, as warnings that teams can review separately.',
  },
  {
    question: 'Can validated content be hot-reloaded into a running game?',
    answer:
      'Yes, but validate the complete candidate pack before mutating any engine. If errors exist, retain the previous definitions. If validation passes, upsert the new definitions and preserve current runtime progress.',
  },
  {
    question: 'Does content validation replace save migrations?',
    answer:
      'No. Content validation proves that current definitions are internally usable. Save migrations transform persisted progress when IDs, versions, or state shapes change. A release that renames content usually needs both.',
  },
];

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
        'TypeScript game content validation',
        'data-driven RPG architecture',
        'JSON Schema game data',
        'quest validation',
        'dialogue validation',
        'content pipeline',
      ],
    },
    {
      '@type': 'FAQPage',
      '@id': `${absoluteUrl(path)}#faq`,
      mainEntity: faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
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

export default function TypeScriptRpgContentValidationGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>RPG content validation</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Content pipeline · TypeScript · renderer independent</p>
          <h1>Validate the whole RPG content graph, not just each JSON object.</h1>
          <p className="ow-en-deck">
            A quest can match its interface and still point at an event that never fires. A dialogue
            node can be well-shaped and still jump to a missing node. Use structural schemas at the
            file boundary, then run domain and cross-reference checks before content reaches a live
            engine.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Boundary</div>
          <div className="ow-en-copy">
            <h2>Compile-time types do not validate runtime content.</h2>
            <p>
              TypeScript improves authoring and catches mistakes in source, but its type annotations
              are erased from emitted JavaScript. The{' '}
              <a href="https://www.typescriptlang.org/docs/handbook/typescript-from-scratch#erased-types">
                TypeScript handbook
              </a>{' '}
              makes that boundary explicit. Treat imported JSON, network responses, editor exports,
              mods, caches, and hot updates as <code>unknown</code> until a runtime validator accepts
              them.
            </p>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>Shape</h3>
                <p>Are required fields present, values of the right type, and numeric constraints valid?</p>
              </article>
              <article className="ow-en-card">
                <h3>Local semantics</h3>
                <p>Are IDs unique, graph edges valid, targets positive, and start nodes reachable?</p>
              </article>
              <article className="ow-en-card">
                <h3>Cross references</h3>
                <p>Do dialogue effects reference real quests and prerequisites reference known definitions?</p>
              </article>
              <article className="ow-en-card">
                <h3>Runtime vocabulary</h3>
                <p>Are condition, effect, and event names implemented by the current game build?</p>
              </article>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Content pack</div>
          <div className="ow-en-copy">
            <h2>Package related definitions as one versioned validation unit.</h2>
            <pre className="ow-en-code"><code>{`import { defineContentPack } from '@overworld-engine/content'

export const town = defineContentPack({
  id: 'town',
  version: 3,
  dialogues: [{
    id: 'elder-intro',
    startNodeId: 'hello',
    nodes: [{
      id: 'hello',
      responses: [{
        id: 'accept',
        effects: [{
          type: 'quest.start',
          params: { questId: 'welcome' },
        }],
      }],
    }],
  }],
  quests: [{
    id: 'welcome',
    objectives: [{
      id: 'talk',
      target: 1,
      trigger: {
        event: 'dialogue:ended',
        filter: { dialogueId: 'elder-intro' },
      },
    }],
  }],
  items: [{ id: 'coin', name: 'Coin' }],
})`}</code></pre>
            <p>
              <code>defineContentPack</code> is an identity helper: it preserves the exact object
              while anchoring editor inference. The pack boundary is valuable because a dialogue
              that starts a quest and the quest it names can be checked together instead of passing
              two isolated file checks.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Structure</div>
          <div className="ow-en-copy">
            <h2>Use JSON Schema before domain validators touch external data.</h2>
            <pre className="ow-en-code"><code>{`import Ajv from 'ajv/dist/2020'
import {
  contentBundleSchema,
  schemaFor,
} from '@overworld-engine/devtools'

const ajv = new Ajv({ allErrors: true })
const validateBundle = ajv.compile(contentBundleSchema)
const validateQuestFile = ajv.compile(schemaFor('quests'))

const candidate: unknown = JSON.parse(source)

if (!validateBundle(candidate)) {
  console.error(validateBundle.errors)
  throw new Error('Invalid RPG content structure')
}`}</code></pre>
            <p>
              Overworld exports plain draft 2020-12 schemas and does not force a validator
              dependency into game bundles. Use the same schema in a JSON editor, build tool,
              server, or CI job. The{' '}
              <a href="https://json-schema.org/learn/getting-started-step-by-step">
                official JSON Schema guide
              </a>{' '}
              describes the model: a validator receives a schema and an instance and returns a
              validation result.
            </p>
            <p>
              Structural schemas deliberately permit additional fields because games extend
              definitions with presentation and product metadata. Do not confuse an open extension
              surface with missing validation: required engine fields and their constraints are
              still checked.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Semantics</div>
          <div className="ow-en-copy">
            <h2>Return precise issues instead of one generic “invalid content” error.</h2>
            <pre className="ow-en-code"><code>{`import {
  formatReport,
  validateContent,
} from '@overworld-engine/devtools'

const report = validateContent(
  {
    dialogues: town.dialogues,
    quests: town.quests,
    items: town.items,
  },
  {
    knownEvents: [
      'dialogue:ended',
      'item:added',
      'combat:enemy-defeated',
    ],
    effectTypes: effects.types(),
    conditionTypes: conditions.types(),
  },
)

console.log(formatReport(report))

if (!report.ok) {
  process.exitCode = 1
}`}</code></pre>
            <p>
              A validation report separates <code>errors</code> from <code>warnings</code>. Every
              issue carries a severity, source such as <code>dialogue:elder-intro</code>, a dotted
              path to the field, and a human-readable message. Errors make <code>ok</code> false;
              warnings remain visible without blocking a build.
            </p>
            <ul>
              <li>Dialogue checks cover duplicate IDs, missing start nodes, broken links, and unreachable nodes.</li>
              <li>Quest checks cover objective targets, duplicate objectives, prerequisites, chains, and trigger events.</li>
              <li>Item and achievement checks cover identifiers, stacking rules, rewards, triggers, and known reference types.</li>
              <li>Bundle checks resolve dialogue <code>quest.start</code> references against quests in the same candidate.</li>
            </ul>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Behavior registry</div>
          <div className="ow-en-copy">
            <h2>Validate named behavior against the code that is actually registered.</h2>
            <pre className="ow-en-code"><code>{`import {
  createConditionRegistry,
  createEffectRegistry,
} from '@overworld-engine/core'

const conditions = createConditionRegistry<GameContext>()
const effects = createEffectRegistry<GameContext>()

conditions.register('player.minLevel', ({ level }, ctx) =>
  ctx.player.level >= Number(level)
)

effects.register('wallet.addGold', ({ amount }, ctx) => {
  ctx.wallet.add(Number(amount))
})

const report = validateContent(content, {
  conditionTypes: conditions.types(),
  effectTypes: effects.types(),
})`}</code></pre>
            <p>
              Serializable content should name behavior, not contain functions. The composition root
              registers the implementation; validation compares content references with
              <code>registry.types()</code>. This catches a typo or a handler omitted from one
              platform build before a reward silently disappears at runtime.
            </p>
            <Link className="ow-en-link" href="/en/type-safe-event-bus-games-typescript">
              See how the same boundary applies to typed game events →
            </Link>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">06 / CI gate</div>
          <div className="ow-en-copy">
            <h2>Run one non-throwing report for review and one assertion for release gates.</h2>
            <pre className="ow-en-code"><code>{`import {
  assertValidContent,
  formatReport,
  validateContent,
} from '@overworld-engine/devtools'

const options = {
  knownEvents: Object.keys(EVENT_CONTRACT),
  effectTypes: effects.types(),
  conditionTypes: conditions.types(),
}

const report = validateContent(content, options)
console.info(formatReport(report))

// Throws only when report.errors is non-empty.
assertValidContent(content, options)`}</code></pre>
            <p>
              Put the assertion in unit tests and the release workflow. Keep the formatted report in
              local development so authors see all findings at once. Do not validate only the file
              changed in a pull request: references often cross dialogue, quest, item, and
              achievement boundaries.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">07 / Safe apply</div>
          <div className="ow-en-copy">
            <h2>Validate first, then apply every passing section as one candidate.</h2>
            <pre className="ow-en-code"><code>{`import {
  applyContentPack,
  createContentPackTracker,
} from '@overworld-engine/content'
import { formatReport } from '@overworld-engine/devtools'

const tracker = createContentPackTracker()

const result = applyContentPack(candidatePack, {
  dialogue,
  quest: quests,
  inventory,
  achievements,
}, {
  effectTypes: effects.types(),
  conditionTypes: conditions.types(),
  knownEvents: Object.keys(EVENT_CONTRACT),
})

if (result.ok) {
  tracker.record(candidatePack)
  console.info('Applied:', result.applied)
} else {
  // No section was registered; the current game stays usable.
  console.error(formatReport(result.report))
}`}</code></pre>
            <p>
              Validation failure returns <code>applied: []</code>, so an invalid hot update does not
              partially replace live definitions. Passing sections are upserted by ID; current
              quest, dialogue, inventory, and achievement progress remains in runtime state. The
              tracker warns when an older pack version arrives after a newer one.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">08 / Release discipline</div>
          <div className="ow-en-copy">
            <h2>Separate content validity, rollout order, and save compatibility.</h2>
            <ol>
              <li>Validate external structure before casting values into engine types.</li>
              <li>Validate the complete semantic graph against registered events and behavior.</li>
              <li>Reject a candidate atomically when errors exist; keep warnings observable.</li>
              <li>Track pack versions so stale or out-of-order updates are visible.</li>
              <li>Migrate saved progress when definition IDs or persisted meaning changes.</li>
              <li>Smoke-test the vertical slice that consumes the new content.</li>
            </ol>
            <div className="ow-en-grid">
              <Link className="ow-en-card" href="/en/headless-typescript-quest-system">
                <h3>Quest content</h3>
                <p>Model event-driven objectives, prerequisites, rewards, chains, persistence, and tests.</p>
              </Link>
              <Link className="ow-en-card" href="/en/typescript-dialogue-system">
                <h3>Dialogue content</h3>
                <p>Build serializable trees with conditional choices, declarative effects, and React UI.</p>
              </Link>
              <Link className="ow-en-card" href="/en/headless-typescript-inventory-system">
                <h3>Inventory content</h3>
                <p>Validate item definitions, stacking, capacity, overflow, use effects, and saves.</p>
              </Link>
              <Link className="ow-en-card" href="/en/typescript-game-save-system">
                <h3>Save migrations</h3>
                <p>Version persisted state, migrate old shapes, and recover crash-safe save files.</p>
              </Link>
            </div>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">09 / FAQ</div>
          <div className="ow-en-copy ow-en-faq">
            <h2>TypeScript RPG content-validation questions</h2>
            {faq.map((item) => (
              <div key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
            <div className="ow-en-next">
              <h2>Run a validated content graph in a complete gameplay slice</h2>
              <p>Inspect dialogue, quests, inventory, rewards, events, persistence, UI, and tests together.</p>
              <Link className="ow-en-link" href="/en/react-three-fiber-rpg-starter">
                Open the runnable React Three Fiber RPG starter →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
