import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const repoRoot = join(__dirname, '..');
export const docsAppDir = join(repoRoot, 'apps', 'docs');
export const cacheDir = join(repoRoot, '.cache', 'papers-upstream');
export const PAPERS_REPO = 'https://github.com/thomasjvu/papers.git';

/** Framework paths synced with thomasjvu/papers (never includes content/). */
export const SYNC_PATHS = [
  'scripts',
  'src',
  'shared/seo.js',
  'themes',
  'types',
  'test',
  'public',
  'index.html',
  'vite.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'tsconfig.json',
  'eslint.config.mjs',
  'RELEASING.md',
];

export const EXCLUDED_UNDER_SRC = ['src/docs/content', 'src/lib/generated'];

/** Build-time artifacts — never sync upstream or downstream. */
export const EXCLUDED_GENERATED_PATHS = [
  'public/docs-content',
  'public/dev-docs-content',
  'public/docs-index.json',
  'public/dev-docs-index.json',
  'public/llms.txt',
  'public/llms-full.txt',
  'public/robots.txt',
  'public/sitemap.xml',
  'public/images/og-image.svg',
  'public/images/twitter-card.svg',
  'src/theme-active.css',
];

/**
 * Boss Raid overrides — preserved on upstream pull, excluded from automatic downstream push.
 * These files contain product-specific wiring (multi-collection routing, monorepo content roots).
 */
export const PROTECTED_RELATIVE_PATHS = new Set([
  'scripts/generate-docs.mjs',
  'scripts/generate-llms.mjs',
  'scripts/generate-pagefind.mjs',
  'scripts/lib/docsVariants.mjs',
  'scripts/lib/llmsArtifacts.mjs',
  'scripts/lib/collectionContentRoot.mjs',
  'scripts/lib/papersPaths.mjs',
  'src/App.tsx',
  'src/pages/CollectionDocsPage.tsx',
  'src/data/collections.ts',
  'src/lib/content.ts',
  'src/hooks/useAdjacentPageNavigation.ts',
  'src/components/docs/DocumentationPage.tsx',
  'src/components/ContentRenderer.tsx',
  'shared/docsRouting.js',
  'shared/documentation-config.js',
  'shared/content-collections.js',
  'FRAMEWORK.md',
  'package.json',
  'vite.config.ts',
  'tsconfig.json',
]);

/**
 * Dogfood improvements to port upstream manually (Boss Raid-specific today).
 * Run: node scripts/papers-sync-downstream.mjs --portable
 */
export const PORTABLE_IMPROVEMENTS = [
  {
    path: 'shared/content-collections.js',
    note: 'Generalize multi-collection registry for external contentDir roots.',
  },
  {
    path: 'scripts/lib/collectionContentRoot.mjs',
    note: 'Resolve monorepo content roots for each collection.',
  },
  {
    path: 'scripts/lib/papersPaths.mjs',
    note: 'Shared path helpers for collection-aware generators.',
  },
  {
    path: 'scripts/generate-docs.mjs',
    note: 'Multi-collection doc JSON generation.',
  },
  {
    path: 'scripts/generate-llms.mjs',
    note: 'Per-collection llms.txt exports.',
  },
  {
    path: 'scripts/generate-pagefind.mjs',
    note: 'Index all collections for Pagefind.',
  },
  {
    path: 'src/pages/CollectionDocsPage.tsx',
    note: 'Route shell for arbitrary content collections.',
  },
  {
    path: 'src/lib/hostedAssetPage.ts',
    note: 'Framework hosted asset pages (llms.txt, skill.md) config and preview stripping.',
  },
  {
    path: 'src/components/HostedFilePreview.tsx',
    note: 'CodeBlock preview for hosted text assets on framework doc pages.',
  },
  {
    path: 'src/components/ContentRenderer.tsx',
    note: 'Optional trailingContent slot for hosted asset previews.',
  },
  {
    path: 'src/pages/HostedAssetRedirectPage.tsx',
    note: 'Legacy /llms and /skill redirects into the docs SPA shell.',
  },
  {
    path: 'FRAMEWORK.md',
    note: 'Content collections dogfood notes and upstream porting checklist.',
  },
];

function matchesExcludedPrefix(relativePath, prefixes) {
  return prefixes.some(
    (prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`)
  );
}

export function shouldSkipFrameworkPath(relativePath) {
  if (PROTECTED_RELATIVE_PATHS.has(relativePath)) {
    return true;
  }

  if (matchesExcludedPrefix(relativePath, EXCLUDED_UNDER_SRC)) {
    return true;
  }

  return matchesExcludedPrefix(relativePath, EXCLUDED_GENERATED_PATHS);
}