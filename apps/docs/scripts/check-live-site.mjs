const siteUrl = new URL(process.env.SITE_URL ?? 'https://overworldengine.com');
const legacyHostname =
  new URL(process.env.LEGACY_SITE_URL ?? 'https://overworld.web3noah.com').hostname;
const concurrency = Math.max(
  1,
  Math.min(32, Number(process.env.SEO_CRAWL_CONCURRENCY) || 8),
);

const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function decodeEntities(value) {
  return value
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function getAttribute(tag, attributeName) {
  const match = tag?.match(
    new RegExp(`\\b${attributeName}=(?:"([^"]*)"|'([^']*)')`, 'i'),
  );
  return match?.[1] ?? match?.[2];
}

function getTag(html, tagName, attributeName, attributeValue) {
  return html
    .match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))
    ?.find((tag) => {
      const attribute = tag.match(
        new RegExp(`\\b${attributeName}=(?:"([^"]*)"|'([^']*)')`, 'i'),
      );
      return (attribute?.[1] ?? attribute?.[2])?.toLowerCase() === attributeValue;
    });
}

function extractLinks(html, baseUrl) {
  const links = [];
  const pattern = /<a\b[^>]*\bhref=(?:"([^"]*)"|'([^']*)')[^>]*>/gi;

  for (const match of html.matchAll(pattern)) {
    const rawHref = decodeEntities(match[1] ?? match[2] ?? '').trim();
    if (
      !rawHref ||
      rawHref.startsWith('#') ||
      /^(?:mailto|tel|javascript|data):/i.test(rawHref)
    ) {
      continue;
    }

    try {
      const url = new URL(rawHref, baseUrl);
      url.hash = '';
      links.push(url);
    } catch {
      failures.push(`${baseUrl}: invalid link target ${rawHref}`);
    }
  }

  return links;
}

async function request(url) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
        headers: { 'user-agent': 'Overworld-Full-Site-Monitor/1.0' },
        signal: AbortSignal.timeout(15_000),
      });

      if (response.status < 500 || attempt === 3) return response;
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
  }

  throw lastError ?? new Error('request failed');
}

async function mapConcurrent(values, limit, task) {
  const results = new Array(values.length);
  let cursor = 0;

  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(values[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );
  return results;
}

const sitemapUrl = new URL('/sitemap.xml', siteUrl);
const sitemapResponse = await request(sitemapUrl);
const sitemapXml = await sitemapResponse.text();

assert(
  sitemapResponse.status === 200,
  `sitemap.xml: expected 200, received ${sitemapResponse.status}`,
);

const sitemapUrls = [
  ...new Set(
    [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/gi)].map((match) =>
      decodeEntities(match[1].trim()),
    ),
  ),
];

assert(sitemapUrls.length > 0, 'sitemap.xml: no URLs found');
assert(sitemapUrls.length <= 500, `sitemap.xml: unexpected size ${sitemapUrls.length}`);

for (const url of sitemapUrls) {
  const parsed = new URL(url);
  assert(parsed.origin === siteUrl.origin, `sitemap.xml: non-canonical origin ${url}`);
  assert(!parsed.search && !parsed.hash, `sitemap.xml: non-canonical URL ${url}`);
}

const pageCache = new Map();
const discoveredInternalLinks = new Set();

await mapConcurrent(sitemapUrls, concurrency, async (url) => {
  try {
    const response = await request(url);
    const html = await response.text();
    const contentType = response.headers.get('content-type') ?? '';
    const canonical = getAttribute(
      getTag(html, 'link', 'rel', 'canonical'),
      'href',
    );
    const robots = getAttribute(getTag(html, 'meta', 'name', 'robots'), 'content');

    pageCache.set(url, { response, html });

    assert(response.status === 200, `${url}: expected 200, received ${response.status}`);
    assert(
      contentType.toLowerCase().includes('text/html'),
      `${url}: expected HTML, received ${contentType || 'no content-type'}`,
    );
    assert(canonical === url, `${url}: canonical is ${canonical ?? 'missing'}`);
    assert(
      !/(?:^|,)\s*noindex\b/i.test(robots ?? ''),
      `${url}: unexpected noindex directive`,
    );

    for (const link of extractLinks(html, url)) {
      if (
        link.hostname === `www.${siteUrl.hostname}` ||
        link.hostname === legacyHostname
      ) {
        failures.push(`${url}: links through redirect host ${link.toString()}`);
        continue;
      }

      if (link.hostname === siteUrl.hostname && link.origin !== siteUrl.origin) {
        failures.push(`${url}: insecure canonical-host link ${link.toString()}`);
        continue;
      }

      if (link.origin === siteUrl.origin) {
        discoveredInternalLinks.add(link.toString());
      }
    }
  } catch (error) {
    failures.push(`${url}: request failed (${error.message})`);
  }
});

const uncrawledTargets = [...discoveredInternalLinks].filter(
  (url) => !pageCache.has(url),
);

await mapConcurrent(uncrawledTargets, concurrency, async (url) => {
  try {
    const response = await request(url);
    assert(response.status === 200, `${url}: internal link returned ${response.status}`);
    assert(
      !response.headers.has('location'),
      `${url}: internal link redirects to ${response.headers.get('location')}`,
    );
  } catch (error) {
    failures.push(`${url}: internal-link request failed (${error.message})`);
  }
});

if (failures.length > 0) {
  console.error(`Full-site SEO crawl failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Full-site SEO crawl passed: ${sitemapUrls.length} sitemap pages and ${discoveredInternalLinks.size} unique internal targets.`,
  );
}
