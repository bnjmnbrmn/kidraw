import { KidrawPlugin } from './plugin.model';

/** Markdown in node labels — **bold**, *italic* and `code` — for the diagram
 *  types that write their labels in it (markdown-label.ts does the work). */
export const MARKDOWN_PLUGIN: KidrawPlugin = {
  id: 'markdown',
  name: 'Markdown',
  description: 'Bold, italic and code in node labels, for the diagram types that use them',
  feature: true,
  nodeDefaults: {},
};
