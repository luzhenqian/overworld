import Link from 'next/link';
import {
  ArrowRight,
  Blocks,
  BookOpen,
  Box,
  Check,
  Code2,
  Gamepad2,
  GitFork,
  Network,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  TestTube2,
  Waypoints,
} from 'lucide-react';

const capabilityGroups = [
  {
    icon: Box,
    title: '构建世界',
    description: '数据驱动场景、角色控制、碰撞、昼夜天气、LOD、流式加载与小地图。',
    packages: 'scene · environment · loading · minimap',
  },
  {
    icon: Sparkles,
    title: '组织玩法',
    description: '对话、任务、物品、成就与教程都是可测试、可换 UI 的无头状态机。',
    packages: 'dialogue · quest · inventory · achievements',
  },
  {
    icon: Waypoints,
    title: '驱动角色',
    description: 'A* / HPA*、巡逻、游荡、跟随、行为树、日程与动态避障。',
    packages: 'ai · input · audio',
  },
  {
    icon: Network,
    title: '连接玩家',
    description: '从同页测试到 BroadcastChannel、WebSocket，再到输入预测与权威服务器。',
    packages: 'net · relay · platform',
  },
  {
    icon: Gamepad2,
    title: '交付体验',
    description: 'HUD 原语、引擎绑定组件、键鼠与手柄焦点，以及四套可换肤主题。',
    packages: 'ui · notifications',
  },
  {
    icon: TestTube2,
    title: '安全迭代',
    description: '内容校验、事件观测、场景编辑、内容热更与应用层接线测试。',
    packages: 'devtools · inspector · editor · test-kit',
  },
];

const principles = [
  {
    icon: Blocks,
    title: '按需组合',
    text: '27 个独立 ESM 包。先装 core，再只选择当前游戏需要的系统。',
  },
  {
    icon: ShieldCheck,
    title: '边界可验证',
    text: '系统包不相互导入；依赖方向由 CI 检查，跨系统协作走事件和注册表。',
  },
  {
    icon: PackageCheck,
    title: '面向生产',
    text: '版本化存档、崩溃恢复、多端适配、确定性注入和真实示例都在仓库中。',
  },
];

export default function HomePage() {
  return (
    <main className="ow-home">
      <section className="ow-hero">
        <div className="ow-hero-grid" aria-hidden="true" />
        <div className="ow-hero-inner">
          <a
            className="ow-release-pill"
            href="https://github.com/luzhenqian/overworld/releases"
            target="_blank"
            rel="noreferrer"
          >
            <span>v3.2</span>
            崩溃安全存档与确定性测试基建
            <ArrowRight size={14} aria-hidden="true" />
          </a>

          <p className="ow-eyebrow">OPEN-SOURCE WEB 3D RPG FRAMEWORK</p>
          <h1>把游戏内容，留给游戏。</h1>
          <p className="ow-hero-copy">
            Overworld 把 Web 3D RPG 的世界、玩法、AI、联机、UI 与多端交付拆成
            27 个可组合的 TypeScript 包。你定义内容和独特机制，框架负责可复用的工程底座。
          </p>

          <div className="ow-hero-actions">
            <Link className="ow-button ow-button-primary" href="/docs">
              <BookOpen size={17} aria-hidden="true" />
              开始构建
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
            <a
              className="ow-button ow-button-secondary"
              href="https://github.com/luzhenqian/overworld"
              target="_blank"
              rel="noreferrer"
            >
              <GitFork size={17} aria-hidden="true" />
              查看源码
            </a>
          </div>

          <div className="ow-proof" aria-label="项目概览">
            <div><strong>27</strong><span>个发布包</span></div>
            <div><strong>3.2</strong><span>当前版本线</span></div>
            <div><strong>MIT</strong><span>开源许可</span></div>
            <div><strong>TypeScript</strong><span>strict · ESM</span></div>
          </div>
        </div>
      </section>

      <section className="ow-section">
        <div className="ow-section-heading">
          <p className="ow-kicker">从一个闭环开始</p>
          <h2>内容是数据，行为在注册表，系统靠事件协作。</h2>
          <p>
            任务不需要导入背包，UI 不需要绑定具体引擎，游戏代码保留最后的装配权。
          </p>
        </div>

        <div className="ow-code-card">
          <div className="ow-code-topbar">
            <span><i />content.ts</span>
            <span><i />engines.ts</span>
            <span><i />events.ts</span>
          </div>
          <pre aria-label="Overworld 任务装配示例"><code>{`const quest = {
  id: 'first-steps',
  objectives: [{
    id: 'walk',
    target: 20,
    trigger: { event: 'player:moved', amountFrom: 'distance' },
  }],
  rewards: [{ type: 'wallet.addGold', params: { amount: 50 } }],
}

effects.register('wallet.addGold', ({ amount }) => wallet.add(Number(amount)))
const quests = createQuestEngine({ quests: [quest], conditions, effects })

gameEvents.on('quest:completed', ({ questId }) => {
  toast.success(questId)
})`}</code></pre>
          <div className="ow-code-result">
            <Check size={15} aria-hidden="true" />
            玩家移动 → 任务自动累计 → 奖励执行 → UI 响应；四个环节零相互引用
          </div>
        </div>
      </section>

      <section className="ow-section ow-section-wide">
        <div className="ow-section-heading">
          <p className="ow-kicker">能力地图</p>
          <h2>从原型到交付，不换一套架构。</h2>
          <p>每一层都可独立采用，也有真实示例展示它们如何在应用中汇合。</p>
        </div>
        <div className="ow-capability-grid">
          {capabilityGroups.map(({ icon: Icon, title, description, packages }) => (
            <article className="ow-capability-card" key={title}>
              <div className="ow-card-icon"><Icon size={19} aria-hidden="true" /></div>
              <h3>{title}</h3>
              <p>{description}</p>
              <code>{packages}</code>
            </article>
          ))}
        </div>
      </section>

      <section className="ow-section">
        <div className="ow-principles">
          <div className="ow-principles-copy">
            <p className="ow-kicker">为长期项目设计</p>
            <h2>架构约束不是口号，而是可检查的契约。</h2>
            <p>
              默认 API 适合快速开始，同时保留事件总线、时钟、调度器、随机源、存储和传输层的注入点。
            </p>
            <Link className="ow-text-link" href="/docs/architecture">
              阅读架构说明 <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
          <div className="ow-principle-list">
            {principles.map(({ icon: Icon, title, text }) => (
              <div className="ow-principle" key={title}>
                <Icon size={20} aria-hidden="true" />
                <div><h3>{title}</h3><p>{text}</p></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="ow-cta">
        <Code2 size={24} aria-hidden="true" />
        <div>
          <h2>先跑通 Starter，再替换成你的内容。</h2>
          <p>安装、装配、验证和下一步路径都在快速开始中。</p>
        </div>
        <Link className="ow-button ow-button-primary" href="/docs">
          阅读快速开始 <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </section>
    </main>
  );
}
