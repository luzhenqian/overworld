'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { GameStage } from './game-stage';
import { demoScenes, type SceneId } from './scenes';

export function DemoLab() {
  const [sceneId, setSceneId] = useState<SceneId>('meadow');
  const [variant, setVariant] = useState(0);
  const activeScene = useMemo(
    () => demoScenes.find((scene) => scene.id === sceneId) ?? demoScenes[0],
    [sceneId],
  );

  const selectScene = (nextScene: SceneId) => {
    setSceneId(nextScene);
    setVariant(0);
  };

  return (
    <main className="demo-page">
      <header className="demo-intro">
        <div className="demo-kicker">
          <span>PLAYABLE GAME SCENES</span>
          <span>6 VERTICAL SLICES</span>
          <span>BUILT WITH OVERWORLD</span>
        </div>
        <div className="demo-intro-grid">
          <h1>从晨雾原野，<br />到午夜潜入。</h1>
          <div>
            <p>
              这里不解释框架有多少功能。选择一个场景，移动角色，完成目标。
              等你感受到玩法成立，再去看它背后的系统如何组合。
            </p>
            <div className="demo-intro-links">
              <span>WASD / 方向键移动 · E / 空格行动 · 拖拽镜头</span>
              <Link href="/docs/starter">从 Starter 开始 →</Link>
            </div>
          </div>
        </div>
      </header>

      <section className={`demo-lab demo-lab-${sceneId}`} aria-label="Overworld 可玩游戏场景">
        <nav className="demo-modes" aria-label="选择游戏场景">
          {demoScenes.map((scene) => (
            <button
              type="button"
              key={scene.id}
              aria-pressed={sceneId === scene.id}
              onClick={() => selectScene(scene.id)}
            >
              <span>{scene.index}</span>
              <strong>{scene.code}</strong>
              <small>{scene.title}</small>
            </button>
          ))}
        </nav>

        <div className="demo-stage">
          <GameStage sceneId={sceneId} variant={variant} />

          <div className="demo-stage-head">
            <span>{activeScene.code} / {activeScene.genre}</span>
            <span className="demo-live"><i /> PLAY NOW</span>
          </div>

          <div className="demo-stage-controls">
            <span>SCENE VARIANT</span>
            <div>
              {activeScene.variants.map((label, index) => (
                <button
                  key={label}
                  type="button"
                  className={variant === index ? 'is-active' : ''}
                  aria-pressed={variant === index}
                  onClick={() => setVariant(index)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

        </div>

        <article className="demo-brief">
          <div className="demo-brief-index">{activeScene.index} / 06</div>
          <div>
            <p className="demo-brief-eyebrow">{activeScene.genre} · {activeScene.duration}</p>
            <h2>{activeScene.title}</h2>
            <p className="demo-objective-label">本局目标</p>
            <p className="demo-objective">{activeScene.objective}</p>
            <p className="demo-brief-copy">{activeScene.description}</p>
          </div>
          <div className="demo-package-links">
            <span>幕后系统</span>
            {activeScene.packages.map((packageName) => (
              <Link href={`/docs/packages/${packageName}`} key={packageName}>
                @{packageName}
              </Link>
            ))}
          </div>
        </article>
      </section>

      <section className="demo-scenes" aria-labelledby="demo-scenes-title">
        <div className="demo-section-label">SIX PLAYABLE SLICES</div>
        <div className="demo-coverage-head">
          <h2 id="demo-scenes-title">不是技术样板，是六个能完成的小目标。</h2>
          <p>
            每个场景都有自己的地图、规则、失败条件和完成状态。框架能力只在玩法真正需要时出现。
          </p>
        </div>
        <div className="demo-scene-list">
          {demoScenes.map((scene) => (
            <button id={scene.id} type="button" key={scene.id} onClick={() => {
              selectScene(scene.id);
              document.querySelector('.demo-lab')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}>
              <span>{scene.index}</span>
              <div><strong>{scene.title}</strong><small>{scene.genre}</small></div>
              <p>{scene.objective}</p>
              <i>{scene.duration}</i>
            </button>
          ))}
        </div>
      </section>

      <footer className="demo-footer">
        <div>
          <span>BUILD YOUR OWN</span>
          <h2>下一段游戏，由你来定义。</h2>
        </div>
        <div>
          <p>从一段能完成的核心循环开始，再把它扩展成你的世界。</p>
          <Link href="/docs/starter">
            打开 Starter 指南 <span aria-hidden="true">→</span>
          </Link>
          <Link href="/docs/architecture">
            理解组合架构 <span aria-hidden="true">→</span>
          </Link>
        </div>
      </footer>
    </main>
  );
}
