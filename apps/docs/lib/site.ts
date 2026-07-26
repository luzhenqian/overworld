export const siteConfig = {
  name: 'Overworld Engine',
  shortName: 'Overworld',
  url: 'https://overworldengine.com',
  description:
    '面向 TypeScript 的跨平台 3D RPG 系统框架，以 27 个独立包覆盖世界、玩法、AI、联机、界面与多端交付。',
  locale: 'zh_CN',
  language: 'zh-CN',
  version: '3.2.0',
  repositoryUrl: 'https://github.com/luzhenqian/overworld',
  npmUrl: 'https://www.npmjs.com/org/overworld-engine',
  licenseUrl: 'https://opensource.org/license/mit',
} as const;

export function absoluteUrl(pathname = '/') {
  if (pathname === '/') return siteConfig.url;
  return new URL(pathname, siteConfig.url).toString();
}
