import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { absoluteUrl } from '@/lib/site';

const buildLastModified = new Date();

function getPriority(url: string) {
  if (url === '/docs') return 0.9;
  if (
    url === '/docs/concepts' ||
    url === '/docs/starter' ||
    url === '/docs/architecture'
  ) {
    return 0.8;
  }
  if (url.startsWith('/docs/packages/') || url.startsWith('/docs/guides/')) return 0.7;
  return 0.6;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: absoluteUrl('/'),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: absoluteUrl('/demos'),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: absoluteUrl('/en'),
      lastModified: buildLastModified,
      changeFrequency: 'weekly',
      priority: 0.9,
      alternates: {
        languages: {
          'zh-CN': absoluteUrl('/'),
          en: absoluteUrl('/en'),
        },
      },
    },
    {
      url: absoluteUrl('/en/react-three-fiber-rpg-framework'),
      lastModified: buildLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/en/headless-typescript-quest-system'),
      lastModified: buildLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
  ];

  const docsPages: MetadataRoute.Sitemap = source.getPages().map((page) => ({
    url: absoluteUrl(page.url),
    // Fumadocs reads this value from Git. Newly added, not-yet-committed pages
    // have no Git timestamp, so use this build's timestamp until the first commit.
    lastModified: page.data.lastModified ?? buildLastModified,
    changeFrequency: page.url === '/docs/changelog' ? 'weekly' : 'monthly',
    priority: getPriority(page.url),
  }));

  return [...staticPages, ...docsPages];
}
