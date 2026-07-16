/**
 * Minimal error boundary for GLTF model subtrees: renders `fallback` once
 * the subtree throws (e.g. a rejected model load surfacing through
 * `useGLTF`/`useModelLoader`). Key it by the model URL at the call site so
 * changing the path retries with a fresh boundary — the pattern
 * `@overworld-engine/editor` uses for its entity models.
 */
import { Component, type ReactNode } from 'react'

export interface ModelErrorBoundaryProps {
  /** Model URL, used only for the one-line error log. */
  modelPath?: string
  /** Rendered instead of `children` after the subtree throws. */
  fallback: ReactNode
  children: ReactNode
}

export class ModelErrorBoundary extends Component<ModelErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error(
      `[overworld] failed to load model${this.props.modelPath ? `: ${this.props.modelPath}` : ''}`,
      error
    )
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
