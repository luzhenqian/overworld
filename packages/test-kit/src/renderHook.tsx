import { act, create, type ReactTestRenderer } from 'react-test-renderer'

/**
 * Mount a single hook inside a minimal React tree and run its effects — no
 * DOM, no Canvas/WebGL, just a real React lifecycle so `useEffect` actually
 * fires. Use this to prove a hook is wired to what it's supposed to be
 * wired to (a key binding calling the right action, an event listener
 * actually attaching) without rendering any real UI or scene.
 *
 * Requires `window`/`document` to exist if the hook itself touches them
 * (e.g. `window.addEventListener`) — run the test file under jsdom via a
 * `// @vitest-environment jsdom` comment at the top of the file.
 */
export function renderHook<Args extends unknown[]>(
  hook: (...args: Args) => void,
  ...args: Args
): { unmount(): void } {
  let renderer!: ReactTestRenderer
  function Harness(): null {
    hook(...args)
    return null
  }
  act(() => {
    renderer = create(<Harness />)
  })
  return {
    unmount: () => act(() => renderer.unmount()),
  }
}
