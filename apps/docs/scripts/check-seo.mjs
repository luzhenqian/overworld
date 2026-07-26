import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const outputDir = join(process.cwd(), '.next/server/app');
const siteUrl = 'https://overworldengine.com';

function collectHtmlFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = join(directory, entry.name);
    if (entry.isDirectory()) return collectHtmlFiles(filename);
    if (!entry.name.endsWith('.html') || entry.name.startsWith('_')) return [];
    return [filename];
  });
}

function routeFromFilename(filename) {
  const outputPath = relative(outputDir, filename).split(sep).join('/');
  if (outputPath === 'index.html') return '/';
  return `/${outputPath.slice(0, -'.html'.length)}`;
}

function getTag(html, tagName, attributeName, attributeValue) {
  return html
    .match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi'))
    ?.find((tag) => {
      const attribute = tag.match(
        new RegExp(`\\b${attributeName}=(?:\"([^\"]*)\"|'([^']*)')`, 'i'),
      );
      return (attribute?.[1] ?? attribute?.[2]) === attributeValue;
    });
}

function getAttribute(tag, attributeName) {
  const match = tag?.match(
    new RegExp(`\\b${attributeName}=(?:\"([^\"]*)\"|'([^']*)')`, 'i'),
  );
  return match?.[1] ?? match?.[2];
}

function assert(condition, message, failures) {
  if (!condition) failures.push(message);
}

const htmlFiles = collectHtmlFiles(outputDir).filter((filename) => {
  const route = routeFromFilename(filename);
  return route === '/' || route === '/demos' || route === '/docs' || route.startsWith('/docs/');
});

const failures = [];
const canonicals = new Set();
const titles = new Set();

for (const filename of htmlFiles) {
  const route = routeFromFilename(filename);
  const html = readFileSync(filename, 'utf8');
  const expectedCanonical = route === '/' ? siteUrl : new URL(route, siteUrl).toString();
  const title = html.match(/<title>([^<]+)<\/title>/i)?.[1];
  const canonicalTag = getTag(html, 'link', 'rel', 'canonical');
  const descriptionTag = getTag(html, 'meta', 'name', 'description');
  const canonical = getAttribute(canonicalTag, 'href');
  const description = getAttribute(descriptionTag, 'content');
  const jsonLdBlocks = [
    ...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi),
  ];

  assert(html.includes('<html lang="zh-CN"'), `${route}: html lang must be zh-CN`, failures);
  assert(Boolean(title), `${route}: missing title`, failures);
  assert(!title?.includes('Overworld | Overworld'), `${route}: duplicated brand in title`, failures);
  assert(Boolean(description), `${route}: missing meta description`, failures);
  assert((title?.length ?? 0) <= 65, `${route}: title is longer than 65 characters`, failures);
  assert(
    (description?.length ?? 0) >= 20 && (description?.length ?? 0) <= 180,
    `${route}: description must be 20–180 characters`,
    failures,
  );
  assert(canonical === expectedCanonical, `${route}: canonical is ${canonical ?? 'missing'}`, failures);
  assert((html.match(/<h1\b/gi) ?? []).length === 1, `${route}: expected exactly one h1`, failures);
  assert(Boolean(getTag(html, 'meta', 'property', 'og:title')), `${route}: missing og:title`, failures);
  assert(Boolean(getTag(html, 'meta', 'property', 'og:description')), `${route}: missing og:description`, failures);
  assert(
    getAttribute(getTag(html, 'meta', 'property', 'og:url'), 'content') === expectedCanonical,
    `${route}: og:url does not match canonical`,
    failures,
  );
  assert(jsonLdBlocks.length === 1, `${route}: expected exactly one JSON-LD block`, failures);

  for (const block of jsonLdBlocks) {
    try {
      JSON.parse(block[1]);
    } catch (error) {
      failures.push(`${route}: invalid JSON-LD (${error.message})`);
    }
  }

  if (title) {
    assert(!titles.has(title), `${route}: duplicate title "${title}"`, failures);
    titles.add(title);
  }
  if (canonical) {
    assert(!canonicals.has(canonical), `${route}: duplicate canonical "${canonical}"`, failures);
    canonicals.add(canonical);
  }
}

const robots = readFileSync(join(outputDir, 'robots.txt.body'), 'utf8');
assert(robots.includes('Allow: /'), 'robots.txt: missing Allow: /', failures);
assert(
  robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`),
  'robots.txt: missing sitemap declaration',
  failures,
);

const sitemap = readFileSync(join(outputDir, 'sitemap.xml.body'), 'utf8');
const sitemapUrls = new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
for (const canonical of canonicals) {
  assert(sitemapUrls.has(canonical), `sitemap.xml: missing ${canonical}`, failures);
}
assert(
  sitemapUrls.size === canonicals.size,
  `sitemap.xml: expected ${canonicals.size} canonical URLs, found ${sitemapUrls.size}`,
  failures,
);
assert(
  (sitemap.match(/<lastmod>/g) ?? []).length === htmlFiles.length - 2,
  'sitemap.xml: every documentation URL must have a real lastmod',
  failures,
);

if (failures.length > 0) {
  console.error(`SEO output check failed with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(
    `SEO output check passed: ${htmlFiles.length} indexable pages, unique titles/canonicals, valid JSON-LD, complete sitemap.`,
  );
}
