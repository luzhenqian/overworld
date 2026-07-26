import type { MetadataRoute } from 'next';
import { source } from '@/lib/source';
import { absoluteUrl } from '@/lib/site';

const buildLastModified = new Date();
const englishLastModified = new Date('2026-07-27T00:00:00.000Z');

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
      lastModified: englishLastModified,
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
      lastModified: englishLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/en/headless-typescript-quest-system'),
      lastModified: englishLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/en/typescript-dialogue-system'),
      lastModified: englishLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/en/headless-typescript-inventory-system'),
      lastModified: englishLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/en/authoritative-multiplayer-typescript'),
      lastModified: englishLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/en/cross-platform-typescript-game-architecture'),
      lastModified: englishLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/en/react-three-fiber-rpg-starter'),
      lastModified: englishLastModified,
      changeFrequency: 'monthly',
      priority: 0.8,
    },
    {
      url: absoluteUrl('/en/typescript-rpg-framework-comparison'),
      lastModified: englishLastModified,
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
