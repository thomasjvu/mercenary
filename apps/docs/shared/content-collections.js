/**
 * Content collections separate product docs from dev/brand docs.
 * Framework code lives in apps/docs; markdown lives in repo-root content/.
 *
 * Upstream sync (scripts/papers-sync-upstream.mjs) never touches content/ or this file.
 */

import { devDocumentationTree, documentationTree } from './documentation-config.js';

/** @typedef {import('./documentation-config.js').FileItem} FileItem */

/**
 * @typedef {Object} ContentCollection
 * @property {string} id
 * @property {string} label
 * @property {string} routePrefix
 * @property {string} contentDir Path relative to monorepo root
 * @property {FileItem[]} tree
 * @property {string} [description]
 */

/** @type {ContentCollection[]} */
export const contentCollections = [
  {
    id: 'docs',
    label: 'Documentation',
    routePrefix: 'docs',
    contentDir: 'content/docs',
    tree: documentationTree,
    description: 'Product documentation for buyers, sellers, and operators.',
  },
  {
    id: 'dev-docs',
    label: 'Dev Docs',
    routePrefix: 'dev-docs',
    contentDir: 'content/dev-docs',
    tree: devDocumentationTree,
    description: 'Brand system, art pipelines, and internal developer references.',
  },
];

export function getContentCollection(id) {
  const collection = contentCollections.find((entry) => entry.id === id);
  if (!collection) {
    throw new Error(`Unknown content collection: ${id}`);
  }
  return collection;
}
