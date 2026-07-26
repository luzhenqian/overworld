'use client';

import { useEffect, useRef, useState } from 'react';

type CopyState = 'idle' | 'copied' | 'error';

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Copy command was rejected');
}

export function InstallCommand({ command }: { command: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (resetTimer.current) clearTimeout(resetTimer.current);
    },
    [],
  );

  const handleCopy = async () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    try {
      await copyText(command);
      setState('copied');
    } catch {
      setState('error');
    }
    resetTimer.current = setTimeout(() => setState('idle'), 1800);
  };

  const label =
    state === 'copied'
      ? '安装命令已复制'
      : state === 'error'
        ? '复制失败，请手动选择安装命令'
        : '复制安装命令';

  return (
    <div className="ow-install" aria-label="安装示例">
      <span className="ow-install-prompt" aria-hidden="true">$</span>
      <span className="ow-install-command">
        <code>{command}</code>
      </span>
      <button
        type="button"
        className="ow-copy-button"
        data-state={state}
        aria-label={label}
        title={label}
        onClick={handleCopy}
      >
        <svg className="ow-copy-icon" aria-hidden="true" viewBox="0 0 20 20">
          <rect x="6.5" y="6.5" width="9" height="9" rx="1.5" />
          <path d="M13.5 6.5V5A1.5 1.5 0 0 0 12 3.5H5A1.5 1.5 0 0 0 3.5 5v7A1.5 1.5 0 0 0 5 13.5h1.5" />
        </svg>
        <svg className="ow-check-icon" aria-hidden="true" viewBox="0 0 20 20">
          <path d="m4.5 10.5 3.4 3.4 7.6-8" />
        </svg>
      </button>
      <span className="sr-only" aria-live="polite">
        {state === 'copied' ? '安装命令已复制' : state === 'error' ? label : ''}
      </span>
    </div>
  );
}
