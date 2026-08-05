declare const __MINELOG_LOCAL_MODE__: boolean;

declare module "*.md?raw" {
  const content: string;
  export default content;
}
