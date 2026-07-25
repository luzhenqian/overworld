import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

export const metadata: Metadata = {
  metadataBase: new URL('https://overworld.web3noah.com'),
  title: { default: 'Overworld — Web 3D RPG 游戏开发框架', template: '%s | Overworld' },
  description:
    '面向生产的模块化 Web 3D RPG 游戏开发框架：27 个可组合的 TypeScript 包，覆盖世界、玩法、AI、联机、UI 与多端交付。',
  keywords: [
    'Web 3D',
    'RPG',
    'game engine',
    'React',
    'three.js',
    'TypeScript',
    'zustand',
    'Overworld',
  ],
  authors: [{ name: 'Overworld contributors' }],
  creator: 'Overworld contributors',
  openGraph: {
    type: 'website',
    locale: 'zh_CN',
    siteName: 'Overworld',
    title: 'Overworld — 把游戏内容，留给游戏',
    description: '27 个可组合的 TypeScript 包，构建面向生产的 Web 3D RPG。',
    images: [
      {
        url: '/og.png',
        width: 1731,
        height: 909,
        alt: 'Overworld — 把游戏内容，留给游戏。',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Overworld — 把游戏内容，留给游戏',
    description: '27 个可组合的 TypeScript 包，构建面向生产的 Web 3D RPG。',
    images: ['/og.png'],
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
