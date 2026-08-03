type HastNode = {
  properties?: { className?: string | string[] };
  children?: HastNode[];
};

export function rehypeKatexSizingCompat() {
  return (tree: HastNode) => {
    const visit = (node: HastNode) => {
      const className = node.properties?.className;
      if (Array.isArray(className) && className.includes("sizing") && !className.includes("katex-sizing")) {
        className.push("katex-sizing");
      }
      node.children?.forEach(visit);
    };

    visit(tree);
  };
}