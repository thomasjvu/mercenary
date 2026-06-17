import { contentCollections, getContentCollection } from '../../shared/content-collections.js';
import type { FileItem } from '../types/documentation';

export { contentCollections, getContentCollection };

export function getDocumentationTree(collectionId: string): FileItem[] {
  return getContentCollection(collectionId).tree as FileItem[];
}
