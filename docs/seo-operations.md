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
pnpm docs:seo:site
```

GitHub Actions runs the same check every day. It verifies representative Chinese and English
canonical pages, title/description/H1/JSON-LD, robots, sitemap membership, and both permanent
redirect hosts. It also verifies the public IndexNow ownership key. The full-site crawl then fetches
every canonical URL in the sitemap and every unique same-origin link it discovers, rejecting 4xx/5xx,
redirecting internal links, missing or mismatched canonicals, accidental `noindex`, insecure links,
and links through the `www` or legacy redirect hosts.

## Publishing a new English guide

A page is not published until every touchpoint below is updated. Missing one leaves an orphan page
that the crawler or the generated-output check will reject.

1. `apps/docs/app/(home)/en/<slug>/page.tsx` — metadata, TechArticle + FAQPage + BreadcrumbList
   JSON-LD, and body sections.
2. `apps/docs/app/sitemap.ts` — add the canonical URL.
3. `apps/docs/app/(home)/en/page.tsx` — add a card to the English hub.
4. At least two related English guides — add an in-body link so the page is not reachable only from
   the hub.
5. `apps/docs/scripts/check-live-seo.mjs` — add the route to the monitored list.
6. Root `README.md` and the README of every package the guide documents.
7. `docs/seo-roadmap.md` — add the query family to the keyword-to-page map.

Then verify, in this order:

```bash
pnpm docs:check   # content registry + types
pnpm docs:build
pnpm docs:seo     # generated-output rules — NOT covered by docs:check
```

`pnpm docs:seo` enforces rules the other checks do not, including a 65-character cap on the rendered
`<title>` (the ` | Overworld Engine` suffix counts, leaving 46 characters for the page title) and
uniqueness of titles and canonicals. Run it before pushing; CI fails the docs job otherwise.

After deployment succeeds, run `pnpm docs:seo:live` and `pnpm docs:seo:site` against production,
submit the changed canonical URLs to IndexNow, and record the result in
[`seo-measurement-log.md`](./seo-measurement-log.md).

## IndexNow

The public ownership key is hosted at
`https://overworldengine.com/cce19bfab3f3782f314c709a08a6bf94.txt`.
After a deployment succeeds, notify IndexNow only about canonical URLs that were added, changed,
or deleted:

```bash
pnpm docs:seo:indexnow -- \
  https://overworldengine.com/en \
  https://overworldengine.com/en/react-three-fiber-rpg-starter
```

The command refuses cross-origin URLs, query strings, and fragments, verifies the live key before
submission, de-duplicates URLs, and treats a non-success API response as a failure. IndexNow
accelerates discovery by Bing and other participating engines; API acceptance does not guarantee
crawling, indexing, or ranking.

## Search Console

Property type: Domain (`overworldengine.com`).

Verification uses an apex TXT record managed through Ship Dock's Namecheap provider. Keep the TXT
record after verification; Search Console periodically checks ownership again.

Verified on 2026-07-27. `https://overworldengine.com/sitemap.xml` was submitted the same day. Search
Console initially reported that it was still processing the new property; indexing and performance
reports can take about a day to populate.

Ongoing Search Console work:

1. Confirm the submitted sitemap has completed its first successful read.
2. Inspect `/`, `/en`, `/en/react-three-fiber-rpg-framework`, and
   `/en/headless-typescript-quest-system`. Use URL Inspection selectively for new
   pillar pages; the sitemap remains the primary discovery mechanism. Manual indexing requests are
   capped per day and start being rejected once the quota is spent — do not treat a rejected request
   as a crawl problem.
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
