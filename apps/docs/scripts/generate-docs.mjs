import { mkdir, readFile, rm, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

import { contentCollections } from '../shared/content-collections.js';
import { frameworkDocPaths } from '../shared/documentation-config.js';
import { resolveCollectionContentRoot } from './lib/collectionContentRoot.mjs';
import { buildDocsContentPath, getDocsVariantContexts } from '../shared/docsRouting.js';

import {
  createDocumentArtifact,
  createDocsArtifacts,
  enrichDocumentArtifact,
  serializeArtifactJson,
  stabilizeIndexGeneration,
} from './lib/docsArtifacts.mjs';
import { resolveDocFileInfo } from './lib/docsVariants.mjs';

function collectDocumentPaths(items, paths = []) {
  for (const item of items) {
    if (item.type === 'file') {
      paths.push(item.path);
      continue;
    }

    if (item.type === 'directory' && item.children) {
      collectDocumentPaths(item.children, paths);
    }
  }

  return paths;
}

async function readExistingIndex(indexPath) {
  try {
    return JSON.parse(await readFile(indexPath, 'utf-8'));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.warn(`Could not read existing docs index at ${indexPath}: ${error.message}`);
    }

    return null;
  }
}

async function loadMarkdownContent(docPath, fileInfo) {
  try {
    if (!fileInfo) {
      console.warn(`File not found for "${docPath}"`);
      return `# File Not Found\n\nThe requested documentation file "${docPath}" could not be found.`;
    }

    const content = await readFile(fileInfo.filePath, 'utf-8');

    if (!content.trim()) {
      console.warn(`Empty file: ${fileInfo.filePath}`);
      return `# Empty File\n\nThe documentation file "${docPath}" appears to be empty.`;
    }

    return content;
  } catch (error) {
    console.error(`Error loading ${docPath}:`, error);
    return `# Error Loading Content\n\nFailed to load "${docPath}": ${error.message}`;
  }
}

function resolveFrameworkContentRoot(collection, rootDir = process.cwd()) {
  if (collection.id !== 'docs') {
    return null;
  }

  return join(rootDir, 'src', 'docs', 'content');
}

async function buildVariantDocuments(docPaths, collection, frameworkPaths = []) {
  const collectionContentRoot = resolveCollectionContentRoot(collection);
  const frameworkContentRoot = resolveFrameworkContentRoot(collection);
  const contexts = getDocsVariantContexts();
  const documents = {};
  const defaultDocsByPath = {};
  const defaultSourcePathsByPath = {};

  for (const context of contexts) {
    const label = context.key || 'default';
    console.log(`Processing ${collection.id} variant: ${label}`);

    for (const docPath of docPaths) {
      const contentRoot = frameworkPaths.includes(docPath)
        ? frameworkContentRoot
        : collectionContentRoot;
      const fileInfo = resolveDocFileInfo(docPath, {
        version: context.version,
        locale: context.locale,
        contentRoot,
      });
      const rawContent = await loadMarkdownContent(docPath, fileInfo);
      const documentKey = buildDocsContentPath(docPath, {
        version: context.version,
        locale: context.locale,
      });

      documents[documentKey] = await enrichDocumentArtifact(
        createDocumentArtifact(docPath, rawContent, fileInfo?.sourcePath)
      );

      if (context.isDefault) {
        defaultDocsByPath[docPath] = rawContent;

        if (fileInfo?.sourcePath) {
          defaultSourcePathsByPath[docPath] = fileInfo.sourcePath;
        }
      }
    }
  }

  return {
    documents,
    defaultDocsByPath,
    defaultSourcePathsByPath,
  };
}

async function writeDocumentFiles(contentDir, documents) {
  await Promise.all(
    Object.entries(documents).map(async ([docPath, document]) => {
      const outputPath = join(contentDir, `${docPath}.json`);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, serializeArtifactJson(document));
    })
  );
}

async function generateCollectionDocs(collection) {
  console.log(`\nGenerating collection: ${collection.id}`);

  const frameworkPaths = collection.id === 'docs' ? frameworkDocPaths : [];
  const docPaths = [...collectDocumentPaths(collection.tree), ...frameworkPaths];
  const { documents, defaultDocsByPath, defaultSourcePathsByPath } = await buildVariantDocuments(
    docPaths,
    collection,
    frameworkPaths
  );
  const generatedAt = new Date().toISOString();
  const { index: nextIndex } = createDocsArtifacts(
    defaultDocsByPath,
    generatedAt,
    defaultSourcePathsByPath
  );
  const contentDir = join(process.cwd(), 'public', `${collection.id}-content`);
  const indexPath = join(process.cwd(), 'public', `${collection.id}-index.json`);
  const previousIndex = await readExistingIndex(indexPath);
  const index = stabilizeIndexGeneration(previousIndex, nextIndex, generatedAt);

  await rm(contentDir, { recursive: true, force: true });
  await mkdir(contentDir, { recursive: true });

  await writeDocumentFiles(contentDir, documents);

  console.log(`Generated ${index.count} files for ${collection.id}`);
  console.log(`Content files saved to: ${contentDir}`);

  await writeFile(indexPath, serializeArtifactJson(index));
  console.log(`Generated index: ${indexPath}`);

  return index;
}

async function generateDocsContent() {
  try {
    console.log('Generating documentation content for all collections...');

    const results = [];
    for (const collection of contentCollections) {
      results.push(await generateCollectionDocs(collection));
    }

    return results;
  } catch (error) {
    console.error('Error generating documentation content:', error);
    process.exit(1);
  }
}

generateDocsContent().then((results) => {
  console.log('\nDocumentation generation complete.');
  console.log(
    `Generated ${results.reduce((total, result) => total + result.count, 0)} documentation files across ${results.length} collection(s)`
  );
});