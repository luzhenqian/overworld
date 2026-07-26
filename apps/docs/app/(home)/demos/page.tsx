import type { Metadata } from 'next';
import { JsonLd } from '@/components/json-ld';
import { absoluteUrl, siteConfig } from '@/lib/site';
import { DemoLab } from './demo-lab';
import './demos.css';
import { demoScenes } from './scenes';

export const metadata: Metadata = {
  title: '可玩的 3D RPG 场景',
  description:
    '直接游玩六个由 Overworld Engine 构建的 3D RPG 场景：探索、地牢解谜、叙事任务、潜行、防守与协作。',
  alternates: {
    canonical: '/demos',
  },
  openGraph: {
    type: 'website',
    url: '/demos',
    title: '六个可玩的 3D RPG 场景 | Overworld Engine',
    description:
      '探索、地牢解谜、叙事任务、潜行、防守与协作。每个场景都有独立地图、规则和完成目标。',
    images: [
      {
        url: '/og/home',
        width: 1200,
        height: 630,
        alt: 'Overworld Engine 的六个可玩 3D RPG 场景',
      },
    ],
  },
};

const demosStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': absoluteUrl('/demos#webpage'),
  url: absoluteUrl('/demos'),
  name: 'Overworld Engine 可玩 3D RPG 场景',
  description:
    '六个可直接游玩的 3D RPG 垂直切片，覆盖探索、地牢解谜、叙事任务、潜行、防守与协作。',
  inLanguage: siteConfig.language,
  isPartOf: { '@id': absoluteUrl('/#website') },
  about: { '@id': absoluteUrl('/#software') },
  hasPart: demoScenes.map((scene) => ({
    '@type': 'VideoGame',
    name: scene.title,
    url: absoluteUrl(`/demos#${scene.id}`),
    genre: scene.genre,
    description: `${scene.objective}${scene.description}`,
    gamePlatform: 'Web Browser',
    isAccessibleForFree: true,
  })),
};

export default function DemosPage() {
  return (
    <>
      <JsonLd data={demosStructuredData} />
      <DemoLab />
    </>
  );
}
