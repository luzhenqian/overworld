import { RootProvider } from 'fumadocs-ui/provider/next';
import './global.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

export const metadata: Metadata = {
  title: { default: 'Overworld — Web 3D RPG 游戏开发框架', template: '%s | Overworld' },
  description:
    '模块化 Web 3D RPG 游戏开发框架:React + three.js + zustand,18 个可组合的 @overworld-engine/* 包。',
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
