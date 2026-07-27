# Overworld Engine SEO roadmap

Updated: 2026-07-27

## Positioning

Overworld Engine should own the category between renderers and product-specific game code:

> A modular TypeScript RPG systems framework for React Three Fiber and Three.js.

It is not positioned as a replacement for React Three Fiber or Three.js. The differentiator is the
renderer-independent systems layer: quests, dialogue, inventory, AI, multiplayer, UI, persistence,
testing, and cross-platform adapters.

## Keyword-to-page map

| Intent | Primary query | Landing page | Status |
| --- | --- | --- | --- |
| Category | TypeScript RPG framework | `/en` | Published in source |
| Architecture | React Three Fiber RPG framework | `/en/react-three-fiber-rpg-framework` | Published in source |
| Architecture | Three.js RPG framework | `/en/react-three-fiber-rpg-framework` | Published in source |
| System | headless TypeScript quest system | `/en/headless-typescript-quest-system` | Published in source |
| Brand / Chinese | TypeScript 3D RPG 框架 | `/` | Published |
| Evaluation | TypeScript RPG framework comparison | `/en/typescript-rpg-framework-comparison` | Published in source |
| System | TypeScript dialogue system | `/en/typescript-dialogue-system` | Published in source |
| System | TypeScript inventory system | `/en/headless-typescript-inventory-system` | Published in source |
| Multiplayer | authoritative multiplayer RPG TypeScript | `/en/authoritative-multiplayer-typescript` | Published in source |
| Delivery | cross-platform TypeScript game architecture | `/en/cross-platform-typescript-game-architecture` | Published in source |
| Starter | React Three Fiber RPG starter | `/en/react-three-fiber-rpg-starter` | Published in source |
| System | TypeScript game AI and NPC navigation | `/en/typescript-game-ai-navigation-system` | Published in source |
| Persistence | TypeScript game save system | `/en/typescript-game-save-system` | Published in source |
| Architecture | React Three Fiber game state management | `/en/react-three-fiber-game-state-management` | Published in source |
| Performance | React Three Fiber game performance optimization | `/en/react-three-fiber-game-performance` | Published in source |
| Interaction | React Three Fiber NPC interaction system | `/en/react-three-fiber-npc-interaction` | Published in source |
| Architecture | type-safe event bus for games in TypeScript | `/en/type-safe-event-bus-games-typescript` | Published in source |
| Content pipeline | TypeScript RPG content validation | `/en/typescript-rpg-content-validation` | Published in source |
| Interface | React game HUD / headless game UI library | `/en/react-game-hud-ui-library` | Published in source |

Each query family gets one canonical page. Supporting articles link to that page instead of competing
with it for the same phrase.

## 12-week execution

### Weeks 1–2: migration and indexing

- Keep `overworldengine.com` as the only canonical host.
- Keep `www.overworldengine.com` and `overworld.web3noah.com` as permanent path-preserving redirects.
- Add the new domain to Google Search Console and Bing Webmaster Tools.
- Submit `/sitemap.xml`; inspect `/`, `/en`, and both English pillar pages.
- Record indexed-page count, crawl issues, branded impressions, and non-branded impressions weekly.

### Weeks 3–6: high-intent content cluster

- Publish dialogue, inventory, authoritative multiplayer, cross-platform architecture, AI/navigation,
  and save-system guides. (Done.)
- Add English package reference pages only when they answer distinct search intent.
- Add runnable examples and diagrams to every pillar; avoid thin feature-list pages.
- Link each guide from `/en`, its related package docs, GitHub README, and npm package README.

### Weeks 7–9: evidence and distribution

- Publish a runnable R3F starter with one complete interaction → quest → reward → HUD flow. (Done:
  repository example plus English landing page.)
- Add framework comparison pages that use verifiable boundaries rather than marketing claims.
  (Done.)
- Link the English category, architecture, starter, comparison, and cross-platform pages from the
  GitHub repository overview. (Done.)
- Share technical guides through the R3F/Three.js ecosystem, relevant GitHub topic pages, and package
  release notes. Earn links by providing runnable reference implementations.

### Weeks 10–12: optimize from query data

- Use Search Console query/page data to rewrite titles and introductions for pages with impressions
  but weak click-through rate.
- Expand pages that rank in positions 8–30 with missing examples and subtopics from real queries.
- Consolidate pages that overlap; redirect retired URLs to the strongest canonical page.
- Re-run performance, structured-data, sitemap, canonical, and broken-link checks on every release.

## Measurement

Track outcomes by locale and intent, not raw page count:

- non-branded organic impressions and clicks;
- number of target queries in top 10 and top 30;
- search visitors reaching quickstart, GitHub, npm, or demos;
- indexed canonical pages versus submitted pages;
- referring domains from relevant development sites;
- Core Web Vitals and crawl errors.

Record each authoritative observation in [`seo-measurement-log.md`](./seo-measurement-log.md).
Keep published, discovered, crawled, and indexed counts separate.

The first Search Console snapshot becomes the baseline. Until enough data exists, publishing cadence
and index coverage are leading indicators—not proof of ranking growth.
