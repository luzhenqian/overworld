import { getPageImage, getPageMarkdownUrl, source } from '@/lib/source';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
  MarkdownCopyButton,
  ViewOptionsPopover,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import { getMDXComponents } from '@/components/mdx';
import type { Metadata } from 'next';
import { createRelativeLink } from 'fumadocs-ui/mdx';
import { gitConfig } from '@/lib/shared';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;
  const markdownUrl = getPageMarkdownUrl(page).url;
  const canonicalUrl = absoluteUrl(page.url);
  const lastModifiedLabel = page.data.lastModified
    ? new Intl.DateTimeFormat('zh-CN', {
        dateStyle: 'long',
        timeZone: 'Asia/Shanghai',
      }).format(page.data.lastModified)
    : undefined;
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TechArticle',
        '@id': `${canonicalUrl}#article`,
        headline: page.data.title,
        description: page.data.description,
        url: canonicalUrl,
        mainEntityOfPage: canonicalUrl,
        dateModified: page.data.lastModified?.toISOString(),
        inLanguage: siteConfig.language,
        author: {
          '@type': 'Organization',
          name: 'Overworld Engine contributors',
          url: siteConfig.repositoryUrl,
        },
        publisher: {
          '@type': 'Organization',
          '@id': absoluteUrl('/#organization'),
          name: siteConfig.name,
          url: siteConfig.url,
          logo: absoluteUrl('/icon.svg'),
        },
        isPartOf: {
          '@type': 'WebSite',
          '@id': absoluteUrl('/#website'),
          name: siteConfig.name,
          url: siteConfig.url,
        },
        about: {
          '@type': 'SoftwareSourceCode',
          '@id': absoluteUrl('/#software'),
          name: siteConfig.name,
          url: siteConfig.url,
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${canonicalUrl}#breadcrumb`,
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Overworld Engine',
            item: absoluteUrl('/'),
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: page.url === '/docs' ? page.data.title : '文档',
            item: absoluteUrl('/docs'),
          },
          ...(page.url === '/docs'
            ? []
            : [
                {
                  '@type': 'ListItem',
                  position: 3,
                  name: page.data.title,
                  item: canonicalUrl,
                },
              ]),
        ],
      },
    ],
  };

  return (
    <>
      <JsonLd data={structuredData} />
      <DocsPage toc={page.data.toc} full={page.data.full}>
        <DocsTitle>{page.data.title}</DocsTitle>
        <DocsDescription className="mb-0">{page.data.description}</DocsDescription>
        <div className="flex flex-row gap-2 items-center border-b pb-6">
          <MarkdownCopyButton markdownUrl={markdownUrl} />
          <ViewOptionsPopover
            markdownUrl={markdownUrl}
            githubUrl={`https://github.com/${gitConfig.user}/${gitConfig.repo}/blob/${gitConfig.branch}/apps/docs/content/docs/${page.path}`}
          />
          {lastModifiedLabel && (
            <time
              className="ml-auto text-xs text-fd-muted-foreground"
              dateTime={page.data.lastModified?.toISOString()}
            >
              最后更新于 {lastModifiedLabel}
            </time>
          )}
        </div>
        <DocsBody>
          <MDX
            components={getMDXComponents({
              // this allows you to link to other pages with relative file paths
              a: createRelativeLink(source, page),
            })}
          />
        </DocsBody>
      </DocsPage>
    </>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
    alternates: {
      canonical: page.url,
    },
    openGraph: {
      type: 'article',
      url: page.url,
      title: page.data.title,
      description: page.data.description,
      locale: siteConfig.locale,
      siteName: siteConfig.name,
      modifiedTime: page.data.lastModified?.toISOString(),
      images: [
        {
          url: getPageImage(page).url,
          width: 1200,
          height: 630,
          alt: `${page.data.title} — ${siteConfig.name}`,
        },
      ],
    },
  };
}
