import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import '../english-seo.css';

const path = '/en/authoritative-multiplayer-typescript';
const title = 'Authoritative Multiplayer in TypeScript';
const description =
  'Build a TypeScript authoritative multiplayer loop with validated inputs, deterministic simulation, client prediction, reconciliation, snapshots, and WebSocket transport.';

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
      about: [
        'TypeScript',
        'authoritative multiplayer',
        'client prediction',
        'server reconciliation',
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

export default function AuthoritativeMultiplayerTypeScriptGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>Authoritative multiplayer</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Architecture guide · TypeScript game server</p>
          <h1>Authoritative multiplayer in TypeScript with prediction and reconciliation.</h1>
          <p className="ow-en-deck">
            Let clients send intentions, not trusted state. The server validates each input, advances
            the canonical simulation, and acknowledges processed sequence numbers while clients
            predict locally and replay unconfirmed inputs.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Choose a model</div>
          <div className="ow-en-copy">
            <h2>Presence, relay, and authority solve different problems.</h2>
            <p>
              Not every multiplayer feature needs an authoritative simulation. Use the least
              expensive model that preserves the integrity your game actually requires.
            </p>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>Presence</h3>
                <p>Share transforms and metadata so players see one another. Each client still owns its game.</p>
              </article>
              <article className="ow-en-card">
                <h3>Event relay</h3>
                <p>Broadcast social or gameplay facts through rooms without interpreting their payloads.</p>
              </article>
              <article className="ow-en-card">
                <h3>Per-player validation</h3>
                <p>Replay operations on a backend for anti-cheat saves while players remain independent.</p>
              </article>
              <article className="ow-en-card">
                <h3>Shared authority</h3>
                <p>One server owns contested world state, validates inputs, resolves conflicts, and sends snapshots.</p>
              </article>
            </div>
            <p>
              Overworld&apos;s relay is intentionally opaque and is not an authoritative server.
              The net package supplies transport, presence, input channels, prediction, and
              reconciliation primitives. Your game supplies the simulation and server rules.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Shared step</div>
          <div className="ow-en-copy">
            <h2>Put deterministic rules in a shared simulation function.</h2>
            <p>
              Prediction only converges when client and server apply the same input to the same state
              with the same elapsed time. Package that rule once and import it on both sides.
            </p>
            <pre className="ow-en-code"><code>{`export type MoveInput = { dx: number; dz: number }
export type PlayerState = { x: number; z: number }

export function step(
  state: PlayerState,
  input: MoveInput,
  dtMs: number,
): PlayerState {
  const seconds = dtMs / 1000
  return {
    x: state.x + input.dx * 5 * seconds,
    z: state.z + input.dz * 5 * seconds,
  }
}`}</code></pre>
            <p>
              Do not read wall-clock time or call <code>Math.random()</code> inside the step. Pass
              time explicitly and use a seeded random source when simulation requires randomness.
              Keep side effects such as analytics, database writes, and socket sends outside the
              pure state transition.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Server</div>
          <div className="ow-en-copy">
            <h2>Validate first, then advance the canonical state.</h2>
            <p>
              A client packet is untrusted. Verify its envelope, input shape, permissions, movement
              magnitude, rate, and time delta before applying it. Track the highest processed
              sequence number per player and include that acknowledgement with authoritative state.
            </p>
            <pre className="ow-en-code"><code>{`socket.on('message', (raw) => {
  const envelope = JSON.parse(raw.toString())
  const message = envelope.data
  if (message?.t !== 'input') return

  const input = validateAndClamp(message.input)
  const dtMs = clamp(Number(message.dtMs), 0, 100)

  world.players[peerId] = step(
    world.players[peerId],
    input,
    dtMs,
  )
  lastSeq[peerId] = Math.max(lastSeq[peerId] ?? 0, message.seq)
})

setInterval(() => {
  for (const [peerId, socket] of sockets) {
    send(socket, {
      t: 'state',
      state: viewFor(peerId, world),
      lastSeq: lastSeq[peerId] ?? 0,
    })
  }
}, 50) // 20 Hz acknowledgement`}</code></pre>
            <p>
              The server may send a player-specific view instead of the entire world. Interest
              management, matchmaking, persistence, and fleet orchestration remain product
              infrastructure decisions rather than hidden behavior in the client library.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / Client</div>
          <div className="ow-en-copy">
            <h2>Predict immediately, then replay inputs after each acknowledgement.</h2>
            <p>
              Waiting a full round trip before showing local movement feels sluggish. Client
              prediction applies input immediately and records it with a monotonically increasing
              sequence number. When the server responds, the client resets to authoritative state
              and replays every input whose sequence is greater than the acknowledged value.
            </p>
            <pre className="ow-en-code"><code>{`import {
  createInputChannel,
  createPredictedState,
  createWebSocketTransport,
} from '@overworld-engine/net'

const transport = createWebSocketTransport({
  url: 'wss://game.example/authority',
})
const channel = createInputChannel(transport)
const predicted = createPredictedState({
  initialState,
  step,
  maxPending: 128,
  onCorrection: (before, after) => {
    correctionBlend.start(before, after)
  },
})

channel.onServerState((state, lastSeq) =>
  predicted.onServerState(state, lastSeq)
)

const seq = predicted.applyInput(input, dtMs)
channel.sendInput(seq, input, dtMs)
render(predicted.state)`}</code></pre>
            <p>
              Ignore stale acknowledgements. Bound the pending-input queue. Use a domain-specific
              equality function with tolerances for floating-point state so harmless differences do
              not trigger visible corrections.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Remote players</div>
          <div className="ow-en-copy">
            <h2>Predict the local player; interpolate remote snapshots.</h2>
            <p>
              Local prediction minimizes input latency. Remote entities have no local input stream
              to replay, so render them from a short snapshot buffer. Sampling slightly behind real
              time gives the client two states to interpolate between and absorbs network jitter.
            </p>
            <ul>
              <li>Start near 1.5–2 times the snapshot interval for interpolation delay.</li>
              <li>Use the shortest angular path for rotations and explicit interpolation for custom state.</li>
              <li>Clamp at the newest snapshot when data stops instead of extrapolating forever.</li>
              <li>Keep visual smoothing separate from the canonical simulation state.</li>
            </ul>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">06 / Production boundary</div>
          <div className="ow-en-copy">
            <h2>Know what the framework does—and what your backend must do.</h2>
            <p>
              Overworld provides a stable JSON envelope, WebSocket transport, presence, rooms in the
              reference relay, input/state messages, predicted state, and a runnable authoritative
              server example. It does not claim to provide managed game-server fleets, databases,
              matchmaking, DDoS protection, or a universal conflict model.
            </p>
            <p>
              If you need a complete hosted multiplayer backend, evaluate that category directly.
              If you already own the TypeScript simulation and want transport-neutral primitives
              that also work with React Three Fiber, Overworld keeps the client/server boundary
              explicit.
            </p>
            <div className="ow-en-next">
              <h2>Keep rendering outside the server-safe core</h2>
              <p>
                Structure R3F as a presentation adapter over portable domain systems and
                authoritative snapshots.
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
