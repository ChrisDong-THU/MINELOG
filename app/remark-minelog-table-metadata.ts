export type MarkdownAstNode = { type?: string; value?: string; children?: MarkdownAstNode[] };

export function remarkMinelogTableMetadata() {
  return (tree: MarkdownAstNode) => {
    const visit = (node: MarkdownAstNode) => {
      if (!node.children) return;
      node.children = node.children.filter((child) => !(
        child.type === "html"
        && typeof child.value === "string"
        && /^<!-- minelog-table:\{[^\r\n]*\} -->$/.test(child.value.trim())
      ));
      node.children.forEach(visit);
    };
    visit(tree);
  };
}
