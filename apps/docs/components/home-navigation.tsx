import Link from 'next/link';
import { appName, gitConfig } from '@/lib/shared';

export function HomeNavigation() {
  return (
    <header id="nd-nav" className="sticky top-0 z-40 h-14">
      <nav
        aria-label="Primary navigation"
        className="border-b bg-fd-background/80 backdrop-blur-lg"
      >
        <div className="mx-auto flex h-14 w-full max-w-(--fd-layout-width) items-center gap-5 overflow-x-auto px-4">
          <Link className="shrink-0 font-semibold" href="/">
            {appName}
          </Link>
          <div className="flex items-center gap-1 text-sm">
            <Link className="p-2 text-fd-muted-foreground hover:text-fd-accent-foreground" href="/demos">
              在线演示
            </Link>
            <Link className="p-2 text-fd-muted-foreground hover:text-fd-accent-foreground" href="/docs">
              文档
            </Link>
            <Link className="p-2 text-fd-muted-foreground hover:text-fd-accent-foreground" href="/en">
              English
            </Link>
          </div>
          <a
            className="ms-auto shrink-0 p-2 text-sm text-fd-muted-foreground hover:text-fd-accent-foreground"
            href={`https://github.com/${gitConfig.user}/${gitConfig.repo}`}
          >
            GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}
