import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

/**
 * Overworld i18n 约定的演示:内容数据(content.ts)只存 key,
 * 引擎把它们当不透明字符串透传,UI 在渲染时翻译。
 * 事件/Toast 里传结构化数据(key + 参数),也在渲染层翻译,
 * 这样切换语言后历史消息不会停留在旧语言。
 */
export const resources = {
  zh: {
    game: {
      'npc.guide.name': '向导艾拉',
      'dlg.guideIntro.hello': '你好,旅行者!欢迎来到 Overworld 示例村。',
      'dlg.guideIntro.explain':
        '这是用 @overworld-engine/* 搭的最小示例。村子里散落着 3 颗能量水晶,帮我收集回来吧!',
      'dlg.guideIntro.thanks': '太棒了!这些水晶会让村庄重新亮起来。这是给你的报酬!',
      'dlg.guideIntro.r.ask': '这里是哪里?',
      'dlg.guideIntro.r.done': '水晶都找齐了!',
      'dlg.guideIntro.r.bye': '再见。',
      'dlg.guideIntro.r.accept': '没问题,交给我!',
      'dlg.guideIntro.r.later': '以后再说。',
      'quest.welcome.title': '初来乍到',
      'quest.welcome.desc': '熟悉一下这个世界。',
      'quest.welcome.obj.walk': '走动 20 米',
      'quest.welcome.obj.talk': '与向导艾拉交谈',
      'quest.gather.title': '收集能量水晶',
      'quest.gather.desc': '为向导艾拉收集 3 颗能量水晶。',
      'quest.gather.obj.collect': '收集能量水晶',
      'item.crystal.name': '能量水晶',
      'item.crystal.desc': '蕴含微光的水晶,向导艾拉正在寻找它。',
      'ach.firstSteps.title': '迈出第一步',
      'ach.firstSteps.desc': '累计走动 10 米。',
      'ach.collector.title': '水晶收藏家',
      'ach.collector.desc': '收集 3 颗能量水晶。',
      'toast.questStarted': '接受任务:{{title}}',
      'toast.questCompleted': '任务完成:{{title}}',
      'toast.itemAdded': '获得 {{name}} ×{{qty}}(共 {{total}})',
      'toast.achievement': '🏆 成就解锁:{{title}}',
      'hud.quests': '任务',
      'hud.controls': 'WASD/方向键 移动 · Shift 跑 · E 交互',
      'hud.talkHint': '按 E 交谈',
      'dlg.continue': '继续(E)',
    },
  },
  en: {
    game: {
      'npc.guide.name': 'Guide Ella',
      'dlg.guideIntro.hello': 'Hello, traveler! Welcome to the Overworld starter village.',
      'dlg.guideIntro.explain':
        'This is a minimal example built with @overworld-engine/*. Three energy crystals are scattered around the village — bring them back for me!',
      'dlg.guideIntro.thanks':
        'Wonderful! These crystals will light the village up again. Here is your reward!',
      'dlg.guideIntro.r.ask': 'Where am I?',
      'dlg.guideIntro.r.done': 'I found all the crystals!',
      'dlg.guideIntro.r.bye': 'Goodbye.',
      'dlg.guideIntro.r.accept': 'No problem, leave it to me!',
      'dlg.guideIntro.r.later': 'Maybe later.',
      'quest.welcome.title': 'Fresh Arrival',
      'quest.welcome.desc': 'Get to know this world.',
      'quest.welcome.obj.walk': 'Walk 20 meters',
      'quest.welcome.obj.talk': 'Talk to Guide Ella',
      'quest.gather.title': 'Gather Energy Crystals',
      'quest.gather.desc': 'Collect 3 energy crystals for Guide Ella.',
      'quest.gather.obj.collect': 'Collect energy crystals',
      'item.crystal.name': 'Energy Crystal',
      'item.crystal.desc': 'A faintly glowing crystal Guide Ella is looking for.',
      'ach.firstSteps.title': 'First Steps',
      'ach.firstSteps.desc': 'Walk 10 meters in total.',
      'ach.collector.title': 'Crystal Collector',
      'ach.collector.desc': 'Collect 3 energy crystals.',
      'toast.questStarted': 'Quest accepted: {{title}}',
      'toast.questCompleted': 'Quest completed: {{title}}',
      'toast.itemAdded': 'Got {{name}} ×{{qty}} (total {{total}})',
      'toast.achievement': '🏆 Achievement unlocked: {{title}}',
      'hud.quests': 'Quests',
      'hud.controls': 'WASD/Arrows move · Shift run · E interact',
      'hud.talkHint': 'Press E to talk',
      'dlg.continue': 'Continue (E)',
    },
  },
} as const

void i18n.use(initReactI18next).init({
  resources,
  lng: 'zh',
  fallbackLng: 'zh',
  defaultNS: 'game',
  interpolation: { escapeValue: false },
})

export default i18n
