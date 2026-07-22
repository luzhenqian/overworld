module.exports = {
  forbidden: [
    {
      name: 'no-cross-package-imports',
      severity: 'error',
      comment:
        'Package systems must only depend on @overworld-engine/core; cross-system ' +
        'communication goes through the typed event bus (gameEvents), not direct imports. ' +
        'See README.md "系统之间零依赖".',
      from: {
        path: '^packages/(?!core/)([^/]+)/src',
        pathNot: [
          '__tests__',
          // Pre-existing undeclared cross-package imports, out of scope for this
          // patch — see docs/superpowers/specs/2026-07-22-ui-extensibility-patch-design.md
          '^packages/inspector/src/EventBusInspector\\.tsx$',
          '^packages/content/src/validateContentPack\\.ts$',
          '^packages/adapters-weapp/src/joystick\\.ts$',
          '^packages/adapters-weapp/src/bridge\\.ts$',
        ],
      },
      to: {
        path: '^packages/(?!core/)(?!$1/)[^/]+/',
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsConfig: {
      fileName: 'tsconfig.base.json',
    },
  },
}
