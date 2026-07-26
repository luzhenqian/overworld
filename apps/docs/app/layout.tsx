import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { siteConfig } from '@/lib/site';

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  applicationName: siteConfig.name,
  title: {
    default: 'Overworld Engine — 跨平台 TypeScript 3D RPG 框架',
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  alternates: {
    canonical: '/',
    languages: {
      'zh-CN': '/',
      en: '/en',
      'x-default': '/en',
    },
  },
  keywords: [
    'Overworld Engine',
    '跨平台游戏框架',
    'TypeScript RPG framework',
    '3D RPG framework',
    'Three.js game framework',
    'React Three Fiber',
    'React',
    'three.js',
    'TypeScript',
    'zustand',
  ],
  authors: [
    {
      name: 'Overworld Engine contributors',
      url: siteConfig.repositoryUrl,
    },
  ],
  creator: 'Overworld Engine contributors',
  publisher: 'Overworld Engine contributors',
  category: 'developer tools',
  referrer: 'origin-when-cross-origin',
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
  openGraph: {
    type: 'website',
    locale: siteConfig.locale,
    siteName: siteConfig.name,
    url: '/',
    title: 'Overworld Engine — 跨平台 TypeScript 3D RPG 框架',
    description: siteConfig.description,
    images: [
      {
        url: '/og/home',
        width: 1200,
        height: 630,
        alt: 'Overworld Engine — modular systems for cross-platform 3D RPGs.',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Overworld Engine — 跨平台 TypeScript 3D RPG 框架',
    description: siteConfig.description,
    images: ['/og/home'],
  },
  other: {
    'theme-color': '#0f1210',
  },
};

const inter = Inter({
  subsets: ['latin'],
});

/** 站点 UI 文案(文档内容本身即中文;此处翻译框架 chrome 文案) */
const zhTranslations: Partial<Record<string, string>> = {
  'Back to Home(404 not found page)': '返回首页',
  'Copy Markdown(page actions)': '复制 Markdown',
  'Edit on GitHub(edit page)': '在 GitHub 上编辑',
  'Last updated on(page footer)': '最后更新于',
  'Next Page(pagination)': '下一页',
  'Previous Page(pagination)': '上一页',
  'No Headings(table of contents)': '暂无标题',
  'No results found(search dialog)': '未找到结果',
  'On this page(table of contents)': '本页目录',
  'Search(search trigger)': '搜索',
  'Search Documents(search dialog)(placeholder)': '搜索文档…',
  'What do you want to know?(search dialog)(placeholder)': '想了解什么?',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="zh-CN" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider i18n={{ locale: 'cn', translations: zhTranslations }}>
          {children}
        </RootProvider>
      </body>
    </html>
  );
}
