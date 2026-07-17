/**
 * Dependency-free remark transform: rewrite ```mermaid fenced code blocks into
 * a `<Mermaid chart="..." />` MDX element (rendered client-side by
 * components/mermaid.tsx). Keeping the source as ```mermaid fences means the
 * same diagrams also render natively on GitHub for the repo's .md docs.
 */
export function remarkMermaid() {
  return (tree) => {
    const walk = (node) => {
      if (!node || !Array.isArray(node.children)) return;
      node.children.forEach((child, index) => {
        if (child && child.type === 'code' && child.lang === 'mermaid') {
          node.children[index] = {
            type: 'mdxJsxFlowElement',
            name: 'Mermaid',
            attributes: [{ type: 'mdxJsxAttribute', name: 'chart', value: child.value }],
            children: [],
          };
        } else {
          walk(child);
        }
      });
    };
    walk(tree);
  };
}
