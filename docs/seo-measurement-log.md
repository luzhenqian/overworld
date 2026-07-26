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

