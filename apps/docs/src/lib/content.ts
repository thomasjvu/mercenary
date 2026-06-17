import { buildDocsContentPath } from '../../shared/docsRouting.js';
import { getContentCollection } from '../data/collections';
import {
  DEFAULT_DOCUMENT_PATH,
  findDirectoryDefaultPath,
  findFirstDocumentPath,
} from './navigation.ts';
import type { FileItem } from '../types/documentation';
import { createLogger } from '../utils/logger.ts';
import { extractTopLevelMarkdownTitle, stripMarkdownBom } from '../utils/markdown.ts';

const logger = createLogger('Content');

export type DocumentContentFormat = 'markdown' | 'html';

export interface Document {
  path: string;
  content: string;
  title: string;
  description?: string;
  frontmatter?: Record<string, unknown>;
  sourcePath?: string;
  contentFormat?: DocumentContentFormat;
}

export interface DocumentVariantOptions {
  version?: string | null;
  locale?: string | null;
  collectionId?: string;
}

interface DocsIndexResponse {
  generated: string;
  paths: string[];
  count: number;
  titles?: Record<string, string>;
}

interface GeneratedDocumentResponse {
  path: string;
  content: string;
  title?: string;
  description?: string;
  frontmatter?: Record<string, unknown>;
  sourcePath?: string;
  contentFormat?: DocumentContentFormat;
}

const cachedIndexes = new Map<string, DocsIndexResponse>();
const cachedDocuments = new Map<string, Document | null>();
const pendingDocuments = new Map<string, Promise<Document | null>>();

function resolveCollectionId(options: DocumentVariantOptions = {}) {
  return options.collectionId || 'docs';
}

export async function loadDocsContent(
  options: DocumentVariantOptions = {}
): Promise<DocsIndexResponse> {
  const collectionId = resolveCollectionId(options);

  if (cachedIndexes.has(collectionId)) {
    return cachedIndexes.get(collectionId)!;
  }

  try {
    const response = await fetch(`/${collectionId}-index.json`);
    if (!response.ok) {
      throw new Error(`Failed to load docs index: ${response.status}`);
    }

    const docsIndex = (await response.json()) as DocsIndexResponse;
    cachedIndexes.set(collectionId, docsIndex);
    return docsIndex;
  } catch (error) {
    logger.error(`Error loading documentation index for ${collectionId}:`, error);
    return {
      generated: new Date().toISOString(),
      paths: [],
      count: 0,
      titles: {},
    };
  }
}

function getDocumentAssetKey(path: string, options: DocumentVariantOptions = {}): string {
  return buildDocsContentPath(path, {
    version: options.version,
    locale: options.locale,
  });
}

function getDocumentAssetUrl(path: string, options: DocumentVariantOptions = {}): string {
  const collectionId = resolveCollectionId(options);
  const encodedPath = getDocumentAssetKey(path, options)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  return `/${collectionId}-content/${encodedPath}.json`;
}

async function fetchDocument(
  path: string,
  options: DocumentVariantOptions = {}
): Promise<Document | null> {
  const docsIndex = await loadDocsContent(options);

  if (!docsIndex.paths.includes(path)) {
    return null;
  }

  const response = await fetch(getDocumentAssetUrl(path, options));
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }

    throw new Error(`Failed to load document ${path}: ${response.status}`);
  }

  const rawDocument = (await response.json()) as GeneratedDocumentResponse;
  const content = stripMarkdownBom(rawDocument.content ?? '');
  const title =
    rawDocument.title ??
    docsIndex.titles?.[path] ??
    extractTopLevelMarkdownTitle(content) ??
    path.split('/').pop() ??
    path;

  return {
    path: rawDocument.path || path,
    content,
    title,
    description: rawDocument.description,
    frontmatter: rawDocument.frontmatter,
    sourcePath: rawDocument.sourcePath,
    contentFormat: rawDocument.contentFormat || 'markdown',
  };
}

export function prefetchDocument(path: string, options: DocumentVariantOptions = {}): void {
  if (typeof document === 'undefined') {
    return;
  }

  const href = getDocumentAssetUrl(path, options);
  const existing = document.head.querySelector(`link[data-prefetch-doc="${href}"]`);
  if (existing) {
    return;
  }

  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.as = 'fetch';
  link.href = href;
  link.crossOrigin = 'anonymous';
  link.setAttribute('data-prefetch-doc', href);
  document.head.appendChild(link);
}

export async function getDocument(
  path: string,
  options: DocumentVariantOptions = {}
): Promise<Document | null> {
  const cacheKey = `${resolveCollectionId(options)}:${getDocumentAssetKey(path, options)}`;

  if (cachedDocuments.has(cacheKey)) {
    return cachedDocuments.get(cacheKey) ?? null;
  }

  const existingRequest = pendingDocuments.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const request = fetchDocument(path, options)
    .then((document) => {
      cachedDocuments.set(cacheKey, document);
      pendingDocuments.delete(cacheKey);
      return document;
    })
    .catch((error) => {
      pendingDocuments.delete(cacheKey);
      logger.error(`Error loading documentation content for ${cacheKey}:`, error);
      throw error;
    });

  pendingDocuments.set(cacheKey, request);
  return request;
}

export function clearContentCache(): void {
  cachedIndexes.clear();
  cachedDocuments.clear();
  pendingDocuments.clear();
}

export function resolveDocumentPath(slug: string | undefined, collectionId = 'docs'): string {
  if (!slug) {
    return collectionId === 'docs'
      ? DEFAULT_DOCUMENT_PATH
      : findFirstDocumentPath(getContentCollection(collectionId).tree as FileItem[]) || slug || '';
  }

  const tree = getContentCollection(collectionId).tree as FileItem[];
  const directoryDefault = findDirectoryDefaultPath(slug, tree);
  if (directoryDefault) {
    return directoryDefault;
  }

  return slug;
}

export { getContentCollection as getCollection };
