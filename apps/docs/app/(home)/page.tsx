import Link from 'next/link';

const features: { title: string; desc: string }[] = [
  { title: '数据驱动场景', desc: 'SceneShell + 配置数组渲染 NPC/建筑,模型缺失自动几何回退' },
  { title: '无头游戏引擎', desc: '对话/任务/物品/成就/教程,只有状态与逻辑,UI 由你决定' },
  { title: '事件总线解耦', desc: '系统之间零 import,玩法事件经 declaration merging 类型安全扩展' },
  { title: 'AI 与寻路', desc: 'A*/HPA* 寻路、巡逻/游荡/跟随、行为树、昼夜日程、动态避障' },
  { title: '联机抽象', desc: 'Transport 无关的 presence 复制,双开标签页即见幽灵玩家' },
  { title: '开发工具链', desc: '内容校验器、JSON Schema、游戏内场景编辑器、llms.txt' },
];

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 px-6 py-16 text-center">
      <h1 className="text-4xl font-bold mb-4">Overworld</h1>
      <p className="text-fd-muted-foreground max-w-xl mb-8 leading-relaxed">
        模块化 Web 3D RPG 游戏开发框架 —— React + three.js + zustand。
        写好内容数据与玩法系统,剩下的交给 18 个可组合的 @overworld/* 包。
      </p>
      <div className="flex gap-3 mb-14">
        <Link
          href="/docs"
          className="rounded-lg bg-fd-primary px-5 py-2.5 font-medium text-fd-primary-foreground"
        >
          快速开始
        </Link>
        <Link
          href="/docs/architecture"
          className="rounded-lg border px-5 py-2.5 font-medium"
        >
          架构说明
        </Link>
      </div>
      <div className="grid w-full max-w-4xl grid-cols-1 gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div key={f.title} className="rounded-xl border bg-fd-card p-5">
            <div className="mb-1.5 font-semibold">{f.title}</div>
            <div className="text-sm leading-relaxed text-fd-muted-foreground">{f.desc}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
