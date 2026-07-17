'use client';

import { useEffect, useId, useRef, useState } from 'react';

/** Read the active theme from the <html> element Fumadocs stamps. */
function isDarkTheme(): boolean {
  if (typeof document === 'undefined') return true;
  const el = document.documentElement;
  return el.classList.contains('dark') || el.getAttribute('data-theme') === 'dark';
}

/**
 * Lazily renders a Mermaid diagram, re-rendering on theme change. Mermaid is
 * dynamically imported so it only loads on pages that actually use a diagram.
 * Fed by the remark transform that turns ```mermaid fences into <Mermaid />.
 */
export function Mermaid({ chart }: { chart: string }) {
  const rawId = useId();
  const id = 'mmd' + rawId.replace(/[^a-zA-Z0-9]/g, '');
  const ref = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState(true);

  // Track theme toggles on the <html> element.
  useEffect(() => {
    setDark(isDarkTheme());
    const observer = new MutationObserver(() => setDark(isDarkTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: dark ? 'dark' : 'default',
        securityLevel: 'strict',
        fontFamily: 'inherit',
      });
      try {
        const { svg } = await mermaid.render(id, chart);
        if (!cancelled && ref.current) ref.current.innerHTML = svg;
      } catch (error) {
        if (!cancelled && ref.current) {
          ref.current.textContent = `Mermaid render error: ${String(error)}`;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, dark, id]);

  return (
    <div
      ref={ref}
      className="my-6 flex justify-center overflow-x-auto [&_svg]:max-w-full [&_svg]:h-auto"
      role="img"
    />
  );
}
