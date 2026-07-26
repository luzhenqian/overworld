import type { Metadata } from 'next';
import { DemoLab } from './demo-lab';
import './demos.css';

export const metadata: Metadata = {
  title: '在线演示 — Overworld',
  description:
    '在一个可交互的 3D 系统展厅中体验 Overworld 的世界、玩法、AI、网络、跨平台与工具链能力。',
};

export default function DemosPage() {
  return <DemoLab />;
}
