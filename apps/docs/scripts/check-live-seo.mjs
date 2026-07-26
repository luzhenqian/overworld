const siteUrl = new URL(process.env.SITE_URL ?? 'https://overworldengine.com');
const legacyUrl = new URL(
  process.env.LEGACY_SITE_URL ?? 'https://overworld.web3noah.com',
);

const routes = [
  '/',
  '/docs',
  '/docs/concepts',
  '/en',
  '/en/react-three-fiber-rpg-framework',
  '/en/headless-typescript-quest-system',
];

const failures = [];
const report = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function absoluteUrl(route) {
  if (route === '/') return siteUrl.origin;
  return new URL(route, siteUrl).toString();
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
      return (attribute?.[1] ?? attribute?.[2]) === attributeValue;
    });
}

async function request(url, init = {}) {
  const startedAt = performance.now();
  const response = await fetch(url, {
    ...init,
    headers: {
      'user-agent': 'Overworld-SEO-Monitor/1.0',
      ...init.headers,
    },
    signal: AbortSignal.timeout(15_000),
  });

  return {
    response,
    durationMs: Math.round(performance.now() - startedAt),
  };
}

for (const route of routes) {
  const expectedUrl = absoluteUrl(route);

  try {
    const { response, durationMs } = await request(expectedUrl);
    const html = await response.text();
    const canonical = getAttribute(getTag(html, 'link', 'rel', 'canonical'), 'href');
    const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
    const description = getAttribute(
      getTag(html, 'meta', 'name', 'description'),
      'content',
    );
    const h1Count = (html.match(/<h1\b/gi) ?? []).length;
    const jsonLdCount = (
      html.match(/<script type="application\/ld\+json">/gi) ?? []
    ).length;

    report.push({
      route,
      status: response.status,
      durationMs,
      canonical,
    });

    assert(response.status === 200, `${route}: expected 200, received ${response.status}`);
    assert(canonical === expectedUrl, `${route}: canonical is ${canonical ?? 'missing'}`);
    assert(Boolean(title), `${route}: missing title`);
    assert(Boolean(description), `${route}: missing meta description`);
    assert(h1Count === 1, `${route}: expected one h1, found ${h1Count}`);
    assert(jsonLdCount === 1, `${route}: expected one JSON-LD block, found ${jsonLdCount}`);

    if (route === '/en' || route.startsWith('/en/')) {
      assert(/\blang=(?:"en"|'en')/i.test(html), `${route}: missing English language boundary`);
    }
  } catch (error) {
    failures.push(`${route}: request failed (${error.message})`);
  }
}

try {
  const robotsUrl = new URL('/robots.txt', siteUrl);
  const { response } = await request(robotsUrl);
  const body = await response.text();
  assert(response.status === 200, `robots.txt: expected 200, received ${response.status}`);
  assert(body.includes('Allow: /'), 'robots.txt: missing Allow: /');
  assert(
    body.includes(`Sitemap: ${new URL('/sitemap.xml', siteUrl)}`),
    'robots.txt: missing canonical sitemap URL',
  );
} catch (error) {
  failures.push(`robots.txt: request failed (${error.message})`);
}

try {
  const sitemapUrl = new URL('/sitemap.xml', siteUrl);
  const { response } = await request(sitemapUrl);
  const body = await response.text();
  assert(response.status === 200, `sitemap.xml: expected 200, received ${response.status}`);

  for (const route of routes) {
    const expectedUrl = absoluteUrl(route);
    assert(body.includes(`<loc>${expectedUrl}</loc>`), `sitemap.xml: missing ${expectedUrl}`);
  }
} catch (error) {
  failures.push(`sitemap.xml: request failed (${error.message})`);
}

const redirectProbe = '/en/headless-typescript-quest-system?monitor=redirect';
const expectedRedirect = new URL(redirectProbe, siteUrl).toString();

for (const origin of [new URL(`https://www.${siteUrl.hostname}`), legacyUrl]) {
  try {
    const probeUrl = new URL(redirectProbe, origin);
    const { response } = await request(probeUrl, { redirect: 'manual' });
    const location = response.headers.get('location');
    report.push({
      route: probeUrl.toString(),
      status: response.status,
      location,
    });
    assert(
      response.status === 301 || response.status === 308,
      `${origin.hostname}: expected permanent redirect, received ${response.status}`,
    );
    assert(
      location === expectedRedirect,
      `${origin.hostname}: redirect target is ${location ?? 'missing'}`,
    );
  } catch (error) {
    failures.push(`${origin.hostname}: redirect check failed (${error.message})`);
  }
}

console.table(report);

if (failures.length > 0) {
  console.error(`Live SEO check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `Live SEO check passed: ${routes.length} canonical pages, robots, sitemap, and permanent redirects.`,
  );
}
