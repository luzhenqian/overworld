'use client';

import { useEffect } from 'react';

export function HomeMotion() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.ow-home');
    if (!root) return;

    const revealItems = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    root.classList.add('ow-motion-ready');

    if (reducedMotion) {
      root.classList.add('ow-mounted');
      revealItems.forEach((item) => item.classList.add('is-visible'));
      return () => root.classList.remove('ow-motion-ready', 'ow-mounted');
    }

    const mountFrame = window.requestAnimationFrame(() => {
      root.classList.add('ow-mounted');
    });

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        });
      },
      {
        rootMargin: '0px 0px -12% 0px',
        threshold: 0.08,
      },
    );

    revealItems.forEach((item) => observer.observe(item));

    return () => {
      window.cancelAnimationFrame(mountFrame);
      observer.disconnect();
      root.classList.remove('ow-motion-ready', 'ow-mounted');
    };
  }, []);

  return null;
}
