# SEO operations

Updated: 2026-07-27

## Production surfaces

- Canonical origin: `https://overworldengine.com`
- Canonical host redirect: `https://www.overworldengine.com/*` → apex, preserving path and query
- Legacy redirect: `https://overworld.web3noah.com/*` → canonical origin, preserving path and query
- Sitemap: `https://overworldengine.com/sitemap.xml`
- Robots: `https://overworldengine.com/robots.txt`

Run the production smoke test locally:

```bash
pnpm docs:seo:live
```

GitHub Actions runs the same check every day. It verifies representative Chinese and English
canonical pages, title/description/H1/JSON-LD, robots, sitemap membership, and both permanent
redirect hosts.

## Search Console

Property type: Domain (`overworldengine.com`).

Verification uses an apex TXT record managed through Ship Dock's Namecheap provider. Keep the TXT
record after verification; Search Console periodically checks ownership again.

After verification:

1. Submit `sitemap.xml`.
2. Inspect `/`, `/en`, `/en/react-three-fiber-rpg-framework`, and
   `/en/headless-typescript-quest-system`.
3. Record submitted versus indexed pages weekly.
4. Export query/page data monthly and update the keyword-to-page map from actual impressions.

## Performance baseline

First production Lighthouse run, mobile simulation, `/en`, 2026-07-27:

| Category or metric | Baseline |
| --- | ---: |
| Performance | 91 |
| Accessibility | 100 |
| Best Practices | 100 |
| SEO | 100 |
| First Contentful Paint | 2.8 s |
| Largest Contentful Paint | 2.8 s |
| Total Blocking Time | 60 ms |
| Cumulative Layout Shift | 0 |

The largest remaining lab cost is initial CSS delivery and server response time. There is no
field-data baseline yet; use Search Console Core Web Vitals after Google has collected enough visits.

## Weekly review

- Search Console: indexing, page experience, manual actions, security issues, query/page changes.
- GitHub Actions: live monitor failures.
- Ship Dock: deployment success, process restarts, incidents, and certificate renewal.
- Content: pages with impressions in positions 8–30; pages with high impressions and weak CTR.
- Links: new relevant referring domains and broken inbound targets.

Do not interpret page count or one Lighthouse run as organic growth. The primary outcome is
non-branded search visitors who reach quickstart, demos, GitHub, or npm.
