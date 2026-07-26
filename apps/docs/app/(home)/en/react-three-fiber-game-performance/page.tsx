import type { Metadata } from 'next';
import Link from 'next/link';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { articleStructuredDataFields } from '@/lib/structured-data';
import '../english-seo.css';

const path = '/en/react-three-fiber-game-performance';
const title = 'React Three Fiber Game Performance';
const description =
  'Optimize React Three Fiber game performance with measurement, frame-loop boundaries, instancing, LOD, adaptive quality, asset manifests, and zone loading.';

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
    question: 'Does React Three Fiber make Three.js games slow?',
    answer:
      'Not by itself. Performance depends on the work performed by your scene, frame loop, React subscriptions, shaders, assets, and device. Profile the running build before choosing an optimization.',
  },
  {
    question: 'Should an RPG use on-demand rendering?',
    answer:
      'Only when the visible scene can genuinely rest. Menus, editors, paused views, and turn-based scenes may benefit. A world with continuous animation, movement, particles, or simulation normally needs continuous rendering.',
  },
  {
    question: 'When should I use instancing in React Three Fiber?',
    answer:
      'Use instancing for many objects that share geometry and material, such as trees, lamps, rocks, and street furniture. Separate materials or independently skinned characters need different strategies.',
  },
  {
    question: 'What belongs inside useFrame?',
    answer:
      'Keep interpolation, camera movement, animation advancement, and direct visual mutation in useFrame. Durable quests, inventory, dialogue, saves, and broad React state updates should react to meaningful events instead.',
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
        'React Three Fiber performance',
        'Three.js optimization',
        'WebGL instancing',
        'level of detail',
        'game asset loading',
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

export default function ReactThreeFiberGamePerformanceGuide() {
  return (
    <main className="ow-en" lang="en">
      <JsonLd data={structuredData} />
      <article className="ow-en-shell">
        <nav className="ow-en-breadcrumb" aria-label="Breadcrumb">
          <Link href="/en">Overworld Engine</Link><span>/</span><span>R3F game performance</span>
        </nav>
        <header className="ow-en-hero">
          <p className="ow-en-eyebrow">Performance guide · React Three Fiber + Three.js</p>
          <h1>Optimize React Three Fiber game performance by removing the right work.</h1>
          <p className="ow-en-deck">
            A slow frame is not one problem. It may be React work, JavaScript simulation, draw-call
            overhead, GPU fill rate, asset transfer, or garbage collection. Measure the production
            build, classify the bottleneck, then apply the smallest optimization that addresses it.
          </p>
        </header>

        <section className="ow-en-section">
          <div className="ow-en-section-label">01 / Baseline</div>
          <div className="ow-en-copy">
            <h2>Record a reproducible baseline before changing the scene.</h2>
            <p>
              Test a production build on each device tier you intend to support. Capture frame time,
              dropped frames, draw calls, triangles, JavaScript heap behavior, asset transfer, and
              time to a usable first frame. Use the browser performance panel, the R3F performance
              monitor, and Three.js renderer statistics to locate the expensive phase.
            </p>
            <div className="ow-en-grid">
              <article className="ow-en-card">
                <h3>CPU and React</h3>
                <p>Long scripts, wide subscriptions, frequent reconciliation, AI, physics, pathfinding, and per-frame allocations.</p>
              </article>
              <article className="ow-en-card">
                <h3>Renderer submission</h3>
                <p>Too many draw calls, material switches, individual props, shadow casters, and uncached scene construction.</p>
              </article>
              <article className="ow-en-card">
                <h3>GPU</h3>
                <p>High DPR, overdraw, expensive shaders, large shadow maps, post-processing, particles, and excessive geometry.</p>
              </article>
              <article className="ow-en-card">
                <h3>Loading</h3>
                <p>Large GLBs and textures, eager world loading, parse stalls, compilation hitches, and no staged first-frame target.</p>
              </article>
            </div>
            <p>
              Keep a stable camera path or scripted interaction for comparisons. An average FPS
              number without the same scene, build, device, temperature, and input is not a useful
              regression signal.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">02 / Frame loop</div>
          <div className="ow-en-copy">
            <h2>Keep durable game state out of the hot path.</h2>
            <pre className="ow-en-code"><code>{`const target = useRef(new THREE.Vector3())
const velocity = useRef(new THREE.Vector3())
const mesh = useRef<THREE.Group>(null)

useEffect(() => movementStore.subscribe((state) => {
  target.current.set(state.target.x, state.target.y, state.target.z)
}), [])

useFrame((_, delta) => {
  if (!mesh.current) return
  velocity.current.subVectors(target.current, mesh.current.position)
  mesh.current.position.addScaledVector(velocity.current, Math.min(delta * 8, 1))
})`}</code></pre>
            <p>
              Reuse vectors and mutate visual objects directly inside <code>useFrame</code>. Read
              low-frequency goals from a store subscription, use the supplied delta, and emit one
              transition when gameplay meaning changes. Do not call React <code>setState</code> on
              every frame merely to move one mesh.
            </p>
            <p>
              Quest, dialogue, inventory, achievement, persistence, and analytics systems usually
              belong behind events or explicit clocks. The{' '}
              <Link href="/en/react-three-fiber-game-state-management">
                R3F game state management guide
              </Link>{' '}
              shows the complete store, ref, selector, and authority boundary.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">03 / Instancing</div>
          <div className="ow-en-copy">
            <h2>Batch repeated world props that share geometry and material.</h2>
            <pre className="ow-en-code"><code>{`import {
  Decorations,
  type DecorationSet,
} from '@overworld-engine/scene'

const lamps: DecorationSet = {
  id: 'village-lamps',
  modelPath: '/models/lamp.glb',
  instances: [
    { position: [4, 0, 2] },
    { position: [4, 0, 8], rotation: [0, Math.PI, 0] },
  ],
  collision: { radius: 0.4 },
}

<Decorations sets={[lamps]} />`}</code></pre>
            <p>
              Overworld creates one <code>InstancedMesh</code> per source mesh and derives
              colliders from the same instance list. That removes a class of duplicate transforms
              while reducing renderer submissions for dense trees, rocks, lamps, benches, and
              similar set dressing.
            </p>
            <p>
              Instancing is not a universal merge button. Objects with different materials become
              separate batches, and independently animated or skinned characters need another
              design. Re-measure draw calls and GPU time after each batch instead of assuming a
              larger batch is always faster.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">04 / LOD and quality</div>
          <div className="ow-en-copy">
            <h2>Reduce distant detail and cap quality conservatively.</h2>
            <pre className="ow-en-code"><code>{`import {
  ApplyQuality,
  Lod,
  detectQualityPreset,
  qualityToLodCap,
  useQualityStore,
} from '@overworld-engine/scene'

const preset = detectQualityPreset()
useQualityStore.getState().setPreset(preset)

function WorldTree() {
  const active = useQualityStore((state) => state.preset)
  const deviceCap = qualityToLodCap(active === 'custom' ? 'high' : active)

  return (
    <>
      <ApplyQuality />
      <Lod
        position={[20, 0, 10]}
        deviceCap={deviceCap}
        levels={[
          { distance: 0, modelPath: '/models/tree-high.glb' },
          { distance: 35, modelPath: '/models/tree-mid.glb' },
          { distance: 75, modelPath: '/models/tree-low.glb' },
        ]}
        render={(modelPath) => <Tree url={modelPath} />}
      />
    </>
  )
}`}</code></pre>
            <p>
              <code>Lod</code> changes only when the selected level changes, uses hysteresis to
              avoid boundary flicker, and preloads nearby levels. Built-in quality presets adjust
              DPR and shadows through <code>ApplyQuality</code>, and expose hints for shadow-map
              size and particle count.
            </p>
            <p>
              Device detection uses browser, memory, CPU, pointer, and optional renderer hints. It
              is a starting point, not a benchmark. Persist an explicit player override and consider
              lowering quality after measured frame regression rather than locking users to a
              guessed tier.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">05 / Assets</div>
          <div className="ow-en-copy">
            <h2>Load the next useful assets, not the entire world.</h2>
            <pre className="ow-en-code"><code>{`import {
  defineAssetManifest,
  preloadManifest,
  useZoneStreaming,
} from '@overworld-engine/loading'
import { playerPositionRef } from '@overworld-engine/scene'

const village = defineAssetManifest({
  models: ['/models/guide.glb', '/models/village-props.glb'],
  images: ['/maps/village.webp'],
  audio: ['/audio/village.ogg'],
})

const zones = [{
  id: 'village',
  priority: 10,
  bounds: { minX: -40, maxX: 40, minZ: -40, maxZ: 40 },
  manifest: village,
}]

preloadManifest(village, { categories: ['models'] })
const loading = useZoneStreaming(zones, playerPositionRef)`}</code></pre>
            <p>
              Asset manifests are plain data, so scenes can compose and deduplicate them. Zone
              streaming orders higher-priority zones first and uses distance within each priority
              bucket. It starts work without blocking the current render and exposes failures for
              retry.
            </p>
            <p>
              Be precise about progress: <code>useGLTF.preload</code> has no real completion event.
              Overworld counts a model as started when it enters the loader cache; images and audio
              can report settlement. Use <code>useSceneLoadProgress</code> after the Canvas mounts
              for Three.js loading-manager progress, and treat “usable first frame” as a separate
              milestone from “every optional asset loaded.”
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">06 / Rendering policy</div>
          <div className="ow-en-copy">
            <h2>Choose a render policy that matches what can actually stop.</h2>
            <p>
              R3F supports on-demand rendering for scenes that remain visually identical until an
              input or state change invalidates them. That can fit paused games, inventory previews,
              map screens, editors, or turn-based scenes. A continuously animated RPG world
              generally needs the default continuous loop.
            </p>
            <p>
              Adaptive quality can be more useful than changing the whole render policy. Reduce DPR,
              shadows, particles, post-processing, or the most detailed LOD after sustained
              regression, then recover gradually. Avoid oscillating quality on a single slow frame.
            </p>
            <p>
              The official R3F documentation covers{' '}
              <a href="https://r3f.docs.pmnd.rs/advanced/scaling-performance">
                scaling performance, instancing, LOD, and adaptive quality
              </a>{' '}
              and its{' '}
              <a href="https://r3f.docs.pmnd.rs/advanced/pitfalls">performance pitfalls</a>.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">07 / Regression budget</div>
          <div className="ow-en-copy">
            <h2>Turn performance into a release constraint.</h2>
            <ul>
              <li>Define target device tiers and a stable production-build test route for each.</li>
              <li>Track frame-time percentiles and long frames, not only average FPS.</li>
              <li>Record draw calls, triangles, texture memory, transfer size, and first usable frame.</li>
              <li>Exercise movement, camera rotation, combat effects, UI overlays, and zone transitions.</li>
              <li>Fail review when a repeatable regression exceeds the budget or lacks an explicit exception.</li>
            </ul>
            <p>
              Overworld provides boundaries and primitives; it does not optimize your shaders,
              texture formats, physics engine, post-processing chain, or authored geometry. Those
              remain game-owned and should be inspected with renderer, browser, and device-specific
              profilers.
            </p>
          </div>
        </section>

        <section className="ow-en-section">
          <div className="ow-en-section-label">08 / FAQ</div>
          <div className="ow-en-copy ow-en-faq">
            <h2>React Three Fiber game performance questions</h2>
            {faq.map((item) => (
              <div key={item.question}>
                <h3>{item.question}</h3>
                <p>{item.answer}</p>
              </div>
            ))}
            <div className="ow-en-next">
              <h2>Place performance boundaries inside a complete R3F architecture</h2>
              <p>Connect the render loop, headless systems, assets, platform adapters, tests, and server authority.</p>
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
