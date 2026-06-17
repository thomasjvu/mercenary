import { existsSync } from 'fs';
import { join } from 'path';

import { buildDocsContentPath, getDocsVariantContexts } from '../../shared/docsRouting.js';

const DOC_FILE_EXTENSIONS = ['.md', '.mdx'];

function normalizeDocPath(docPath = '') {
  return String(docPath || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
}

function createSourcePath(relativePath) {
  return relativePath.replace(/\\/g, '/');
}

function resolveContentBase(options = {}) {
  if (options.contentRoot) {
    return options.contentRoot;
  }

  const rootDir = options.rootDir || process.cwd();
  const legacyRelative = join('src', 'docs', 'content');
  return join(rootDir, legacyRelative);
}

export function createVariantSourceCandidates(docPath, options = {}) {
  const normalizedDocPath = normalizeDocPath(docPath);
  const version =
    typeof options.version === 'string' && options.version.trim() ? options.version.trim() : null;
  const locale =
    typeof options.locale === 'string' && options.locale.trim() ? options.locale.trim() : null;
  const contentBase = resolveContentBase(options);
  const candidateBases = [];

  if (version && locale) {
    candidateBases.push(
      join(contentBase, 'variants', 'versions', version, 'locales', locale, normalizedDocPath)
    );
  }

  if (version) {
    candidateBases.push(join(contentBase, 'variants', 'versions', version, normalizedDocPath));
  }

  if (locale) {
    candidateBases.push(join(contentBase, 'variants', 'locales', locale, normalizedDocPath));
  }

  candidateBases.push(join(contentBase, normalizedDocPath));

  return Array.from(new Set(candidateBases)).flatMap((candidateBase) =>
    DOC_FILE_EXTENSIONS.map((extension) => {
      const filePath = `${candidateBase}${extension}`;
      const sourcePath = options.contentRoot
        ? createSourcePath(filePath.replace(`${options.contentRoot}/`, '').replace(/^\//, ''))
        : createSourcePath(filePath);

      return {
        filePath,
        sourcePath,
      };
    })
  );
}

export function resolveDocFileInfo(docPath, options = {}) {
  for (const candidate of createVariantSourceCandidates(docPath, options)) {
    if (existsSync(candidate.filePath)) {
      return candidate;
    }
  }

  return null;
}

export function getDefaultDocsVariantContext(options = {}) {
  return getDocsVariantContexts(options).find((context) => context.isDefault) || {
    version: null,
    locale: null,
    key: '',
    isDefault: true,
  };
}

export function getGeneratedDocumentKeys(docPaths, options = {}) {
  const variantContexts = getDocsVariantContexts(options);
  const keys = new Set();

  for (const context of variantContexts) {
    for (const docPath of docPaths) {
      keys.add(
        buildDocsContentPath(docPath, {
          ...options,
          version: context.version,
          locale: context.locale,
        })
      );
    }
  }

  return Array.from(keys);
}