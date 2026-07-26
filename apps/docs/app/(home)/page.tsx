import Link from 'next/link';
import { highlight } from 'fumadocs-core/highlight';
import { InstallCommand } from './install-command';
import { HomeMotion } from './motion';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';

const installCommand = 'pnpm add @overworld-engine/core @overworld-engine/quest';

const heroCode = `import {
  createConditionRegistry,
  createEffectRegistry,
  gameEvents,
} from '@overworld-engine/core'
import { createQuestEngine } from '@overworld-engine/quest'

const conditions = createConditionRegistry()
const effects = createEffectRegistry()

effects.register('wallet.addGold', ({ amount }) => {
  wallet.add(Number(amount))
})

export const quests = createQuestEngine({
  quests: QUESTS,
  conditions,
  effects,
  events: gameEvents,
})`;

const packageLayers = [
  {
    number: '01',
    title: '基础与世界',
    packages: 'core · content · scene · environment · loading · minimap',
    description: '事件、注册表、内容清单、玩家相机、环境模拟与区域加载。',
  },
  {
    number: '02',
    title: '玩法状态机',
    packages: 'dialogue · quest · inventory · achievements · tutorial · ai',
    description: '与视觉实现无关的内容引擎、进度系统、寻路与角色行为。',
  },
  {
    number: '03',
    title: '运行与交付',
    packages: 'input · audio · net · relay · analytics · platform · notifications',
    description: '输入仲裁、音频总线、多人同步、遥测、平台生命周期与反馈。',
  },
  {
    number: '04',
    title: '界面、工具与适配',
    packages: 'ui · devtools · editor · inspector · test-kit · adapters-savefile · adapters-steam · adapters-weapp',
    description: '游戏 HUD、内容校验、场景编辑、测试，以及存档、Steam 和微信适配。',
  },
];

const readingPaths = [
  {
    index: 'A',
    title: '第一次装配',
    description: '从安装到“移动—任务—奖励—UI”闭环。',
    href: '/docs',
    label: '快速开始',
  },
  {
    index: 'B',
    title: '理解边界',
    description: '公开依赖方向、事件总线与组合根。',
    href: '/docs/architecture',
    label: '架构说明',
  },
  {
    index: 'C',
    title: '按目标选包',
    description: '只安装当前垂直切片真正需要的能力。',
    href: '/docs/package-selection',
    label: '包选择指南',
  },
  {
    index: 'D',
    title: '交付到目标平台',
    description: 'Web、桌面、移动、微信与 Telegram。',
    href: '/docs/guides/platforms',
    label: '多端支持',
  },
];

const homeStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': absoluteUrl('/#organization'),
      name: siteConfig.name,
      alternateName: siteConfig.shortName,
      url: siteConfig.url,
      logo: absoluteUrl('/icon.svg'),
      sameAs: [siteConfig.repositoryUrl, siteConfig.npmUrl],
    },
    {
      '@type': 'WebSite',
      '@id': absoluteUrl('/#website'),
      url: siteConfig.url,
      name: siteConfig.name,
      alternateName: siteConfig.shortName,
      description: siteConfig.description,
      inLanguage: siteConfig.language,
      publisher: { '@id': absoluteUrl('/#organization') },
    },
    {
      '@type': 'SoftwareSourceCode',
      '@id': absoluteUrl('/#software'),
      name: siteConfig.name,
      alternateName: siteConfig.shortName,
      description: siteConfig.description,
      url: siteConfig.url,
      codeRepository: siteConfig.repositoryUrl,
      programmingLanguage: 'TypeScript',
      runtimePlatform: [
        'Web',
        'Node.js',
        'Tauri',
        'Capacitor',
        'WeChat Mini Game',
        'Telegram Mini App',
      ],
      license: siteConfig.licenseUrl,
      version: siteConfig.version,
      isAccessibleForFree: true,
      creator: { '@id': absoluteUrl('/#organization') },
    },
  ],
};

export default async function HomePage() {
  const highlightedCode = await highlight(heroCode, {
    lang: 'ts',
    themes: {
      light: 'github-dark',
      dark: 'github-dark',
    },
  });

  return (
    <main className="ow-home">
      <JsonLd data={homeStructuredData} />
      <HomeMotion />

      <section className="ow-hero" aria-labelledby="ow-home-title">
        <div className="ow-hero-copy">
          <div className="ow-overline">
            <span>Overworld Engine</span>
            <span>v3.2</span>
            <span>MIT</span>
          </div>

          <h1 id="ow-home-title">
            <span className="ow-nowrap">一套 TypeScript 架构，</span>
            <span className="ow-nowrap">交付跨平台 3D RPG。</span>
          </h1>
          <p className="ow-lede">
            27 个独立发布的 TypeScript 包，覆盖世界、玩法、AI、联机与 UI。
            同一套领域系统运行在浏览器、Tauri、Capacitor、微信小游戏、Telegram Mini App
            和 Node.js 服务端；平台差异收敛到 bridge 与 adapters。
          </p>

          <div className="ow-actions">
            <Link className="ow-action-primary" href="/demos">
              体验在线演示 <span aria-hidden="true">→</span>
            </Link>
            <Link
              className="ow-action-secondary"
              href="/docs"
            >
              阅读文档 <span aria-hidden="true">→</span>
            </Link>
          </div>

          <InstallCommand command={installCommand} />

          <p className="ow-runtime">
            Web · Tauri 2 · Capacitor 8 · 微信小游戏 · Telegram Mini App · Node.js
          </p>
        </div>

        <div className="ow-code" aria-label="Overworld 装配示例">
          <div className="ow-code-header">
            <span>game/engines.ts</span>
            <span>public API</span>
          </div>
          {highlightedCode}
          <div className="ow-code-output">
            <span><i aria-hidden="true" /> event flow</span>
            <code>player:moved → quest:completed → reward → UI</code>
            <div className="ow-event-track" aria-hidden="true"><i /></div>
          </div>
        </div>
      </section>

      <section className="ow-principle" aria-labelledby="ow-principle-title" data-reveal>
        <div className="ow-section-index">01 / COMPOSITION</div>
        <div>
          <h2 id="ow-principle-title">应用拥有组合权。</h2>
          <p>
            Overworld 不提供一个接管全局的 Engine 单例。内容是可序列化数据，行为在注册表，
            跨系统事实走类型化事件；你的应用是唯一的组合根。
          </p>
        </div>
        <div className="ow-flow" aria-label="系统协作顺序">
          <div><span>01</span><strong>Content</strong><small>任务、对话、物品定义</small></div>
          <div><span>02</span><strong>Registry</strong><small>条件与效果实现</small></div>
          <div><span>03</span><strong>Engine</strong><small>独立状态机与 store</small></div>
          <div><span>04</span><strong>EventBus</strong><small>跨系统事实传播</small></div>
        </div>
      </section>

      <section className="ow-packages" aria-labelledby="ow-packages-title" data-reveal>
        <div className="ow-section-heading">
          <div className="ow-section-index">02 / PACKAGE MAP</div>
          <div>
            <h2 id="ow-packages-title">从一个系统开始，而不是从全家桶开始。</h2>
            <p>
              每个包都有明确的公开入口和 peer 边界。大多数领域包只依赖
              <code>@overworld-engine/core</code>。
            </p>
          </div>
        </div>

        <div className="ow-package-list">
          {packageLayers.map((layer) => (
            <article className="ow-package-row" key={layer.number}>
              <span className="ow-row-number">{layer.number}</span>
              <h3>{layer.title}</h3>
              <code>{layer.packages}</code>
              <p>{layer.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ow-evidence" aria-labelledby="ow-evidence-title" data-reveal>
        <div>
          <div className="ow-section-index">03 / REPOSITORY</div>
          <h2 id="ow-evidence-title">文档里的能力，在仓库里都有对应证据。</h2>
        </div>
        <dl>
          <div>
            <dt>27</dt>
            <dd><strong>独立发布包</strong><span>固定版本组，标准 ESM 与类型声明</span></dd>
          </div>
          <div>
            <dt>11</dt>
            <dd><strong>可运行示例</strong><span>Web、桌面、移动、微信、Telegram 与权威服务器</span></dd>
          </div>
          <div>
            <dt>CI</dt>
            <dd><strong>边界与文档检查</strong><span>构建、类型、测试、依赖方向和公开 API 可发现性</span></dd>
          </div>
          <div>
            <dt>0</dt>
            <dd><strong>内容内置</strong><span>框架提供机制；游戏保留自己的世界观与规则</span></dd>
          </div>
        </dl>
      </section>

      <section className="ow-reading" aria-labelledby="ow-reading-title" data-reveal>
        <div className="ow-section-heading">
          <div className="ow-section-index">04 / DOCUMENTATION</div>
          <div>
            <h2 id="ow-reading-title">从你现在的问题进入。</h2>
            <p>先完成一条可运行路径，再深入对应的参考文档。</p>
          </div>
        </div>

        <div className="ow-reading-list">
          {readingPaths.map((item) => (
            <Link href={item.href} className="ow-reading-row" key={item.index}>
              <span>{item.index}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
              <strong>{item.label}</strong>
              <i aria-hidden="true">→</i>
            </Link>
          ))}
        </div>
      </section>

      <section className="ow-closing" aria-labelledby="ow-closing-title" data-reveal>
        <div>
          <div className="ow-section-index">GET STARTED</div>
          <h2 id="ow-closing-title">先跑通 Starter，再接入目标平台。</h2>
        </div>
        <div>
          <p>
            从 Web 原型开始，沿同一套领域架构交付 Tauri、Capacitor、微信小游戏与 Telegram Mini App。
          </p>
          <Link href="/docs/starter">
            打开 Starter 指南 <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </main>
  );
}
