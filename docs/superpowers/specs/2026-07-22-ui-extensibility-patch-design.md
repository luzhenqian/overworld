# @overworld-engine/ui — 可扩展性短板修补设计

日期：2026-07-22
状态：范围、工具方案、Modal 兼容策略、Slot 公开与否均已与需求方确认

## 背景

对 `@overworld-engine/ui` 的分发方式和可扩展性做过一轮调研（见 [UI 竞品调研](https://claude.ai/code/artifact/6f7e1d8a-8eda-4451-8034-e26f8375c822)），identified 出 5 类短板。本次只挑其中 4 类做一个版本：

1. `zero-cross-package-import` 规则目前只是 `packages/ui/src/engineTypes.ts` 里的注释约定，没有工具强制
2. `packages/ui` 没有自己的 README，扩展契约没写清楚
3. 组件不支持 `asChild`/多态，无法替换根元素标签
4. 没有 compound component 模式，复杂组件（如 `Modal`）内部结构不可定制

**排除范围**：JS 层动态 theme API（运行时生成 token）工作量较大，本次不做，留作后续独立版本。

**版本影响**：Modal 的 compound 重写是破坏性变更（详见下文），因此整体作为 `@overworld-engine/ui` 的 **major** 版本发布，其余 3 项内容作为同一 changeset 里的 feature 一并列出。

## 1. dependency-cruiser 强制 import 边界

仓库目前没有配置任何 ESLint（只有 tsup + vitest + changesets），引入完整 lint 体系超出本次范围，选用轻量的单一用途工具：

- 新增根级 `.dependency-cruiser.cjs`：规则为 `packages/*/src` 之间禁止相互 import，`@overworld-engine/core` 除外；`examples/*`、`apps/*`、`benchmarks` 不受限（它们本来就该组合多个包）
- 根 `package.json` 新增脚本 `"depcruise": "depcruise packages --config .dependency-cruiser.cjs"`
- `.github/workflows/ci.yml` 的 `packages` job 里，在 `Install dependencies` 之后、`Build packages` 之前加一步 `Check package boundaries`，跑 `pnpm depcruise`

## 2. `packages/ui/README.md`

新增文件，内容覆盖：

- headless（`dialogue`/`quest`/`inventory` 等）vs styled（`ui` 本身）的定位关系
- `exports` 字段各子路径用途：`.`（主组件+headless helper）、`./focus`（可选空间导航，需装 norigin peerDep）、`./styles.css`（基础 token）、`./themes/*`（四套皮肤）
- 主题切换方法（`data-ow-theme` 属性）
- `asChild` 用法示例（见下）
- `Modal` compound 用法示例（见下）
- 链接到根 README 的 zero-cross-package-import 说明，并注明现在由 `pnpm depcruise` 强制检查

## 3. `Slot` 原语 + `asChild`（`Button`/`IconButton`）

先在最小范围（`Button`/`IconButton`）跑通 asChild 模式，其余组件后续按同模式追加。

### `packages/ui/src/primitives/Slot.tsx`（公开导出）

```ts
export interface SlotProps extends React.HTMLAttributes<HTMLElement> {
  children?: React.ReactNode
}

export const Slot = forwardRef<HTMLElement, SlotProps>(function Slot(
  { children, ...slotProps },
  forwardedRef,
) {
  if (!isValidElement(children)) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Slot expects exactly one React element child; rendering children as-is.')
    }
    return children ?? null
  }
  const childProps = children.props as Record<string, unknown>
  return cloneElement(children, {
    ...mergeProps(slotProps, childProps),
    ref: mergeRefs(forwardedRef, (children as { ref?: React.Ref<unknown> }).ref),
  })
})
```

- `mergeProps(slotProps, childProps)`：`className` 拼接（两者都有则用空格连接）、`style` 浅合并（child 优先）、同名事件 handler（`onClick` 等）两者都调用（先 slot 后 child）、其余字段以 child 为准
- `mergeRefs(...refs)`：返回一个函数 ref，对每个非空 ref 按类型（函数 / `{ current }` 对象）分别赋值
- 公开导出 `Slot`：为后续更多组件支持 `asChild` 铺路，也给高级用户自建组件的能力（参考 Radix `Slot` 的公开导出先例）
- 非法用法（0 个或多个 children）dev 模式下 `console.error` 提示，不 `throw`，避免生产环境白屏

### `Button`/`IconButton` 加 `asChild`

```ts
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'ghost' | 'danger'
  asChild?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', className, asChild, ...rest },
  ref,
) {
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      ref={ref}
      {...(asChild ? {} : { type: 'button' })}
      className={className ? `ow-button ${className}` : 'ow-button'}
      data-ow-variant={variant}
      {...rest}
    />
  )
})
```

`IconButton` 同样处理：`asChild` 时 `label` 仍作为 `aria-label` 合并到 child 上。不传 `asChild` 时两者行为、渲染输出完全不变（向后兼容）。

## 4. `Modal` compound 重写

**兼容策略（关键决策，破坏性变更）**：不保留旧的扁平 `<Modal open onDismiss>{children}</Modal>` API，直接用 compound 形式替换。原因：`Modal` 当前只有两个调用点（见下），迁移成本低，长期维护两套 API 的成本更高。

### 新 API

```ts
interface ModalContextValue {
  onDismiss?: () => void
  contentRef: RefObject<HTMLDivElement>
}
const ModalContext = createContext<ModalContextValue | null>(null)

function useModalContext(component: string): ModalContextValue {
  const ctx = useContext(ModalContext)
  if (!ctx) throw new Error(`Modal.${component} must be used within Modal.Root`)
  return ctx
}

export interface ModalRootProps {
  open: boolean
  onDismiss?: () => void
  children?: ReactNode
}
function ModalRoot({ open, onDismiss, children }: ModalRootProps) {
  const contentRef = useRef<HTMLDivElement>(null)
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss

  useEffect(() => {
    if (!open) return
    // 原 focus-trap useEffect 原样保留，查询/聚焦目标从旧的 modalRef 换成 contentRef
    // （previouslyFocused 记录、focusables() 查询、keydown 监听 Escape/Tab、cleanup 恢复焦点）
  }, [open])

  if (!open) return null
  return (
    <div
      className="ow-modal-backdrop"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onDismiss?.() }}
    >
      <ModalContext.Provider value={{ onDismiss, contentRef }}>{children}</ModalContext.Provider>
    </div>
  )
}

export interface ModalContentProps extends HTMLAttributes<HTMLDivElement> {}
function ModalContent({ children, ...rest }: ModalContentProps) {
  const { contentRef } = useModalContext('Content')
  return (
    <div className="ow-modal" role="dialog" aria-modal="true" tabIndex={-1} ref={contentRef} {...rest}>
      {children}
    </div>
  )
}

export interface ModalCloseProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}
function ModalClose({ asChild, onClick, ...rest }: ModalCloseProps) {
  const { onDismiss } = useModalContext('Close')
  const Comp = asChild ? Slot : 'button'
  return (
    <Comp
      {...(asChild ? {} : { type: 'button' })}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => { onClick?.(e); onDismiss?.() }}
      {...rest}
    />
  )
}

export const Modal = { Root: ModalRoot, Content: ModalContent, Close: ModalClose }
```

- **不做 `Modal.Trigger`**：现有用法都是外部受控 `open`（调用方自己维护 state 和自己的触发按钮），Trigger 在纯受控模型下没有对应语义。等出现非受控需求（`defaultOpen` 等）再补，避免过度设计
- `useModalContext` 在 `Root` 之外使用时直接 `throw`，防止误用被静默忽略

### 迁移两个现有调用点

- `packages/ui/src/components/AlertHost.tsx`：
  ```tsx
  <Modal.Root open onDismiss={() => store.getState().resolveCurrent(false)}>
    <Modal.Content>{/* 原 children 不变 */}</Modal.Content>
  </Modal.Root>
  ```
- `examples/ui-gallery/src/Surfaces.stories.tsx`：同样改写为 `Modal.Root`/`Modal.Content`，并新增一个用 `Modal.Close asChild` 包 `Button` 的示例，作为 README 里 compound + asChild 组合用法的活样例

### `packages/ui/src/index.ts` 导出变化

- `Modal` 从函数组件变为 `{ Root, Content, Close }` 命名空间对象，导出名不变
- 新增导出 `Slot`（来自 `primitives/Slot.tsx`）

## 测试计划

延续仓库现有的 pure-logic 测试风格（`focusTrap.test.ts` 只测 `nextTrapIndex` 纯函数，不渲染 `Modal` 本身），不引入 `@testing-library/react`：

- 新增 `packages/ui/src/__tests__/slotMerge.test.ts`：单测 `mergeProps`/`mergeRefs` 纯函数 —— className 拼接、style 合并（child 优先）、同名事件 handler 两者均被调用且顺序正确、ref 分别是函数/对象时都正确赋值
- Modal 的 focus-trap 逻辑本体不变（只是 ref 目标从 `modalRef` 换成 `contentRef`），复用已有的 `focusTrap.test.ts`，不需要新增
- Slot 克隆结果、Modal 三个子组件协同、asChild 在真实 DOM 上的实际表现：不写自动化测试，通过 `examples/ui-gallery` 更新后的 stories 人工验证 —— 与仓库现状一致（目前没有任何组件渲染测试先例）
- `depcruise` 规则通过 CI 跑起来即验证，不需要额外单测

## 变更清单（changeset）

一条 major changeset for `@overworld-engine/ui`，说明：

- **Breaking**：`Modal` 从组件变为 `{ Root, Content, Close }`，附迁移代码片段
- **Feature**：`Button`/`IconButton` 支持 `asChild`；新增公开导出的 `Slot` 原语
- **Feature**：新增 `packages/ui/README.md`
- **Chore**：CI 新增 `pnpm depcruise` 边界检查（不影响包体本身，但作为变更清单的一部分说明）
