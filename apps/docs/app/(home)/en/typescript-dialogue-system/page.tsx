import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import '../english-seo.css';

const path = '/en/typescript-dialogue-system';
const title = 'TypeScript Dialogue System for Branching RPGs';
const description =
  'Build a headless TypeScript dialogue system with serializable trees, conditional choices, declarative effects, localization keys, persistence, and React UI bindings.';

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
      about: ['TypeScript', 'branching dialogue', 'RPG dialogue system', 'game development'],
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

export default function TypeScriptDialogueSystemGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>TypeScript dialogue system</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Implementation guide · Branching RPG dialogue</p>
          <h1>A headless TypeScript dialogue system for choices, conditions, and effects.</h1>
          <p className="ow-en-deck">
            Keep conversation flow as serializable data and game-specific behavior in registries.
            The same dialogue state machine can then drive React UI, a Three.js scene, automated
            tests, or a server without importing any of them.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Boundary</div>
          <div className="ow-en-copy">
            <h2>The dialogue runtime should not own presentation.</h2>
            <p>
              A dialogue system decides which node is active, which responses are currently
              available, what happens after a choice, and when a conversation ends. It should not
              decide whether text appears in a speech bubble, a visual-novel panel, subtitles, or
              an accessibility transcript.
            </p>
            <p>
              This boundary matters in React Three Fiber games because conversation state often
              outlives scene components. A camera cut or route transition should not destroy
              relationship values, completed conversations, or the rules that filter a response.
              Keep those facts in a vanilla store and let UI subscribe through narrow selectors.
            </p>
            <ul>
              <li><strong>Content owns:</strong> speakers, text keys, nodes, choices, and references.</li>
              <li><strong>Runtime owns:</strong> transitions, filtering, completion, and dialogue history.</li>
              <li><strong>Game owns:</strong> condition checks, effects, localization, audio, and rendering.</li>
            </ul>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Content model</div>
          <div className="ow-en-copy">
            <h2>Represent branching conversations as data.</h2>
            <p>
              Serializable trees are reviewable in source control, validatable in CI, editable by
              tools, and safe to ship over a content pipeline. Conditions and effects remain named
              references rather than embedded functions.
            </p>
            <pre className="ow-en-code"><code>{`const guideIntro = {
  id: 'guide-intro',
  startNodeId: 'welcome',
  nodes: [
    {
      id: 'welcome',
      speaker: 'guide',
      text: 'dialogue.guide.welcome',
      responses: [
        {
          id: 'ask-market',
          text: 'dialogue.guide.askMarket',
          conditions: [
            { type: 'quest.completed', params: { id: 'first-steps' } },
          ],
          effects: [
            { type: 'map.reveal', params: { markerId: 'market' } },
          ],
          next: 'market-directions',
        },
        {
          id: 'leave',
          text: 'dialogue.common.goodbye',
        },
      ],
    },
    {
      id: 'market-directions',
      speaker: 'guide',
      text: 'dialogue.guide.marketDirections',
      endsDialogue: true,
    },
  ],
}`}</code></pre>
            <p>
              Linear nodes may use a single <code>next</code> transition and advance on player
              input. Choice nodes expose only responses whose conditions all pass. A response with
              no next node ends the conversation.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Runtime</div>
          <div className="ow-en-copy">
            <h2>Register behavior once at the composition root.</h2>
            <p>
              The dialogue package does not import a quest store, wallet, map, or reputation
              system. Your application registers those meanings and supplies a context when the
              runtime evaluates them.
            </p>
            <pre className="ow-en-code"><code>{`import {
  createConditionRegistry,
  createEffectRegistry,
} from '@overworld-engine/core'
import { createDialogueEngine } from '@overworld-engine/dialogue'

const conditions = createConditionRegistry<GameContext>()
const effects = createEffectRegistry<GameContext>()

conditions.register('quest.completed', ({ id }, ctx) =>
  ctx.quests.isCompleted(String(id))
)
effects.register('map.reveal', ({ markerId }, ctx) =>
  ctx.map.reveal(String(markerId))
)

const dialogue = createDialogueEngine({
  dialogues: [guideIntro],
  conditions,
  effects,
  context: () => gameContext,
  persist: true,
})

dialogue.start('guide-intro', 'guide')
dialogue.choose('ask-market')`}</code></pre>
            <p>
              The runtime emits <code>dialogue:started</code> and{' '}
              <code>dialogue:ended</code>. Quests, analytics, audio, and achievements can observe
              those facts without either package importing the other.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / React UI</div>
          <div className="ow-en-copy">
            <h2>Render the current node as a projection.</h2>
            <p>
              A React component only needs the active node and filtered responses. It does not need
              to duplicate transition rules or evaluate conditions during render.
            </p>
            <pre className="ow-en-code"><code>{`import { useStore } from 'zustand'

function DialoguePanel() {
  const node = useStore(dialogue.store, (state) => state.currentNode)
  const responses = useStore(
    dialogue.store,
    (state) => state.availableResponses
  )

  if (!node) return null
  return (
    <section aria-label="Dialogue">
      <p>{translate(node.text)}</p>
      {responses.map((response) => (
        <button
          key={response.id}
          onClick={() => dialogue.choose(response.id)}
        >
          {translate(response.text)}
        </button>
      ))}
    </section>
  )
}`}</code></pre>
            <p>
              Store localization keys rather than final copy when dialogue ships in multiple
              languages. The runtime treats text as opaque, so the UI may select locale, typography,
              voice-over, and accessibility behavior independently.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Persistence</div>
          <div className="ow-en-copy">
            <h2>Persist history, not an interrupted presentation state.</h2>
            <p>
              Overworld persists relationships, seen dialogue IDs, and completed dialogue IDs when
              persistence is enabled. An in-progress conversation is deliberately not saved. On
              restore, the game returns to an intentional entry point instead of resuming halfway
              through an effect or animation.
            </p>
            <p>
              Test the runtime with an isolated condition registry, effect spies, and a fresh store.
              Verify hidden choices stay hidden, effects run once, terminal nodes complete the tree,
              and the emitted end event contains the final node and NPC identifiers.
            </p>
            <div className="ow-en-next">
              <h2>Connect dialogue to quest progression</h2>
              <p>
                A quest objective can listen for <code>dialogue:ended</code> and advance without a
                direct dialogue dependency.
              </p>
              <Link className="ow-en-link" href="/en/headless-typescript-quest-system">
                Read the headless quest system guide →
              </Link>
            </div>
          </div>
        </section>
      </article>
    </main>
  );
}
