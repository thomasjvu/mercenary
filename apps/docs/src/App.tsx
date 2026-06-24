import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { ThemeProvider } from './providers/ThemeProvider';
import { CommandPaletteProvider } from './providers/CommandPaletteProvider';
import HomePage from './pages/HomePage';
import CollectionDocsPage from './pages/CollectionDocsPage';
import HostedAssetRedirectPage from './pages/HostedAssetRedirectPage';
import NotFoundPage from './pages/NotFoundPage';
import OpenApiPage from './pages/OpenApiPage';
import { contentCollections, getContentCollection } from './data/collections';
import type { ContentCollection } from '../shared/docsRouting.js';
import { homepageConfig } from '../shared/documentation-config.js';
import { DEFAULT_DOCUMENT_PATH } from './lib/navigation';
import { buildOpenApiRoutePath } from './lib/openapi';
import { buildCanonicalCollectionPath } from '../shared/docsRouting.js';

const docsCollection = getContentCollection('docs');

function LegacyOpenApiRedirect() {
  const { specId } = useParams();
  return <Navigate to={buildOpenApiRoutePath(specId)} replace />;
}

export default function App() {
  return (
    <ThemeProvider>
      <CommandPaletteProvider>
        <Routes>
          {homepageConfig.enabled ? (
            <Route path="/" element={<HomePage />} />
          ) : (
            <Route
              path="/"
              element={
                <Navigate
                  to={buildCanonicalCollectionPath(docsCollection, DEFAULT_DOCUMENT_PATH)}
                  replace
                />
              }
            />
          )}
          {contentCollections.map((collection: ContentCollection) => (
            <Route
              key={collection.id}
              path={`/${collection.routePrefix}`}
              element={
                <Navigate
                  to={buildCanonicalCollectionPath(
                    collection,
                    collection.id === 'docs'
                      ? DEFAULT_DOCUMENT_PATH
                      : (collection.tree[0]?.children?.[0]?.path ?? collection.tree[0]?.path ?? '')
                  )}
                  replace
                />
              }
            />
          ))}
          <Route path="/api" element={<OpenApiPage />} />
          <Route path="/api/:specId" element={<OpenApiPage />} />
          <Route path="/docs/reference/openapi" element={<Navigate to="/api" replace />} />
          <Route path="/docs/reference/openapi/:specId" element={<LegacyOpenApiRedirect />} />
          <Route path="/docs/*" element={<CollectionDocsPage collectionId="docs" />} />
          <Route path="/dev-docs/*" element={<CollectionDocsPage collectionId="dev-docs" />} />
          <Route path="/llms" element={<HostedAssetRedirectPage docPath="llms" />} />
          <Route path="/skill" element={<HostedAssetRedirectPage docPath="skill" />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </CommandPaletteProvider>
    </ThemeProvider>
  );
}
