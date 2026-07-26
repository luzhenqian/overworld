# Overworld Engine SEO measurement log

This log records observations from authoritative tools. It separates what the site publishes from
what a search engine has processed; a successful deployment or sitemap submission is not counted as
an indexed page.

## Baseline — 2026-07-27

### Published surface

| Signal | Value | Evidence |
| --- | ---: | --- |
| Canonical production host | `overworldengine.com` | Live canonical and redirect checks |
| Sitemap canonical URLs | 63 | Production full-site crawler |
| Unique same-origin internal targets | 63 | Production full-site crawler |
| Representative canonical pages checked | 15 | Live SEO smoke check |
| `www` redirect | 301, path and query preserved | Live SEO smoke check |
| Legacy host redirect | 308, path and query preserved | Live SEO smoke check |
| Ship Dock deployment | v674, commit `5636a34`, success | Ship Dock deployment record |
| Runtime | up = 1, restarts = 0, incidents = 0 | Ship Dock monitoring |
| Remote SEO monitor | passed | GitHub Actions run `30223049543` |

### Google Search Console

Observed directly in the `sc-domain:overworldengine.com` property:

| Signal | Value |
| --- | --- |
| Sitemap status | Success |
| URLs discovered in last processed sitemap | 60 |
| Current production sitemap URLs | 63 |
| Updated sitemap submitted | 2026-07-27, accepted |
| Page-indexing report | Processing; Google asks to check again in about one day |
| Framework-comparison URL | Discovered — currently not indexed |
| Framework-comparison indexing request | Added to priority crawl queue |

The three-page difference is expected immediately after publication: Search Console still shows the
previous sitemap read, while production already serves 63 canonical URLs. Do not report those three
pages as indexed until Search Console processes the sitemap and the page-indexing report confirms it.

### Discovery notifications

- IndexNow accepted the English homepage, the R3F architecture page, and the new R3F state-management
  page after deployment.
- Google accepted the updated `/sitemap.xml` submission.
- Bing Webmaster Tools remains pending account-provider selection and sign-in.

## Next observation

After Search Console finishes processing:

1. Record indexed and not-indexed canonical counts.
2. Record the reasons for excluded pages rather than only the total.
3. Capture branded versus non-branded clicks and impressions when performance data becomes available.
4. Record queries and pages in positions 8–30 for title, introduction, and content-gap work.
5. Compare Search Console discovered URLs against the production sitemap count.

## Technical audit — 2026-07-27

### Mobile performance

Lighthouse 13.4.1, mobile simulated throttling, production
`/en/react-three-fiber-game-state-management`:

| Category or metric | Result |
| --- | ---: |
| Performance | 98 |
| Accessibility | 100 |
| Best practices | 100 |
| SEO | 100 |
| First Contentful Paint | 1.2 s |
| Largest Contentful Paint | 2.3 s |
| Total Blocking Time | 20 ms |
| Cumulative Layout Shift | 0 |

The remaining Lighthouse opportunity was approximately 112 KiB of unused JavaScript. With a 98
performance score, 20 ms blocking time, and zero layout shift, it is not currently a higher priority
than indexing and content discovery.

### Crawl and structured-data signals

- Production sitemap inspection confirmed that documentation `lastmod` values come from real Git
  history and remain grouped by actual content-update time; deployments do not rewrite every page
  as newly modified.
- All 11 English guide pages now expose complete `TechArticle` identity fields:
  `mainEntityOfPage`, canonical image, `datePublished`, `dateModified`, canonical publisher and logo,
  and parent `WebSite`.
- Build-time SEO checks and the remote production smoke check both enforce those fields, in addition
  to the existing canonical, metadata, JSON-LD, language, sitemap, and redirect assertions.

## Content publication — R3F game performance — 2026-07-27

### Published and discovered

| Signal | Value | Evidence |
| --- | ---: | --- |
| Canonical production pages | 64 | Production full-site crawler |
| Unique same-origin internal targets | 64 | Production full-site crawler |
| New target page | `/en/react-three-fiber-game-performance` | Live canonical check |
| Ship Dock deployment | v677, commit `4aa966f`, success | Ship Dock deployment record |
| Runtime | up = 1, restarts = 0, incidents = 0 | Ship Dock monitoring |
| Remote SEO monitor | passed | GitHub Actions run `30223850682` |

The new page owns the “React Three Fiber game performance optimization” query family. It documents
measured bottleneck classification, frame-loop boundaries, instanced decorations, LOD and quality
caps, asset manifests, zone loading, render policy, and regression budgets using public APIs that
exist in this repository.

IndexNow accepted the new guide, the English homepage, the R3F architecture guide, and the R3F
state-management guide. Google Search Console initially reported the new URL as unknown and not
indexed; the URL was then added successfully to Google's priority crawl queue. This is discovery
and submission evidence, not indexing evidence.

### Mobile performance

Lighthouse 13.4.1, mobile simulated throttling, production
`/en/react-three-fiber-game-performance`:

| Category or metric | Result |
| --- | ---: |
| Performance | 98 |
| Accessibility | 100 |
| Best practices | 100 |
| SEO | 100 |
| First Contentful Paint | 1.2 s |
| Largest Contentful Paint | 2.3 s |
| Total Blocking Time | 30 ms |
| Cumulative Layout Shift | 0 |

The publication also replaced the home-layout navigation generated with invalid direct children
inside a list. The new semantic navigation removed the only accessibility failure observed during
the first local Lighthouse run.
