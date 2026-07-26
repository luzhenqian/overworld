import { absoluteUrl, siteConfig } from './site';

const defaultPublishedDate = '2026-07-27';

type ArticleStructuredDataOptions = {
  published?: string;
  modified?: string;
};

/**
 * Shared fields required on every English TechArticle.
 *
 * Keep page-specific headline, description, author, and `about` values beside
 * the article content. This helper standardizes stable identity, dates, image,
 * publisher, and parent-site relationships so new guides cannot silently ship
 * a thinner schema.
 */
export function articleStructuredDataFields(
  path: string,
  options: ArticleStructuredDataOptions = {},
) {
  const published = options.published ?? defaultPublishedDate;
  const modified = options.modified ?? published;
  const pageUrl = absoluteUrl(path);

  return {
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': pageUrl,
    },
    image: {
      '@type': 'ImageObject',
      url: absoluteUrl('/og/home'),
      width: 1200,
      height: 630,
    },
    datePublished: published,
    dateModified: modified,
    publisher: {
      '@type': 'Organization',
      '@id': `${siteConfig.url}/#organization`,
      name: siteConfig.name,
      url: siteConfig.url,
      logo: {
        '@type': 'ImageObject',
        url: absoluteUrl('/icon.svg'),
      },
    },
    isPartOf: {
      '@type': 'WebSite',
      '@id': `${siteConfig.url}/#website`,
      name: siteConfig.name,
      url: siteConfig.url,
    },
  };
}
