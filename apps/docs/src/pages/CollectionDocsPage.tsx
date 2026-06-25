import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';

import HostedFilePreview from '../components/HostedFilePreview';
import DocumentationPage from '../components/docs/DocumentationPage';
import { getContentCollection } from '../data/collections';
import { getDocument, resolveDocumentPath } from '../lib/content';
import { createLogger } from '../utils/logger';
import { applySeoMetadata } from '../utils/seo';
import {
  buildCanonicalCollectionPath,
  parseCollectionRoutePath,
} from '../../shared/docsRouting.js';
import { extractDescriptionFromMarkdown } from '../../shared/seo.js';
import { getHostedAssetPageConfig, stripHostedAssetPreview } from '../lib/hostedAssetPage';

const logger = createLogger('CollectionDocsPage');
const SITE_NAME = import.meta.env.VITE_SITE_NAME || 'Boss Raid';

type CollectionDocsPageProps = {
  collectionId: string;
};

export default function CollectionDocsPage({ collectionId }: CollectionDocsPageProps) {
  const collection = getContentCollection(collectionId);
  const params = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [currentDocPath, setCurrentDocPath] = useState<string>('');
  const [docTitle, setDocTitle] = useState<string>(collection.label);
  const [docDescription, setDocDescription] = useState<string>('');
  const [docSourcePath, setDocSourcePath] = useState<string | undefined>(undefined);
  const [docContentFormat, setDocContentFormat] = useState<'markdown' | 'html'>('markdown');

  const slug = params['*'] || '';
  const routeContext = useMemo(
    () => parseCollectionRoutePath(collection, slug),
    [collection, slug]
  );
  const docPath = useMemo(
    () => resolveDocumentPath(routeContext.docPath, collectionId),
    [collectionId, routeContext.docPath]
  );
  const canonicalPath = useMemo(
    () =>
      buildCanonicalCollectionPath(collection, docPath, {
        version: routeContext.activeVersion,
        locale: routeContext.activeLocale,
      }),
    [collection, docPath, routeContext.activeLocale, routeContext.activeVersion]
  );
  const hostedAssetConfig = useMemo(() => getHostedAssetPageConfig(docPath), [docPath]);
  const renderedContent = useMemo(
    () => (hostedAssetConfig ? stripHostedAssetPreview(content, docPath) : content),
    [content, docPath, hostedAssetConfig]
  );
  const trailingContent = useMemo(() => {
    if (!hostedAssetConfig) {
      return undefined;
    }

    return (
      <section className="doc-hosted-preview-section">
        <h2
          className="mb-4 text-xl font-bold"
          style={{ color: 'var(--text-color)', fontFamily: 'var(--mono-font)' }}
        >
          Preview
        </h2>
        <HostedFilePreview
          assetUrl={hostedAssetConfig.assetUrl}
          assetLabel={hostedAssetConfig.assetLabel}
        />
      </section>
    );
  }, [hostedAssetConfig]);

  useEffect(() => {
    const normalizedCurrentPath = location.pathname.replace(/\/+$/, '') || '/';
    const normalizedCanonicalPath = canonicalPath.replace(/\/+$/, '') || '/';

    if (normalizedCurrentPath !== normalizedCanonicalPath) {
      navigate(canonicalPath, { replace: true });
    }
  }, [canonicalPath, location.pathname, navigate]);

  useEffect(() => {
    let active = true;

    setLoading(true);

    void getDocument(docPath, {
      collectionId,
      version: routeContext.activeVersion,
      locale: routeContext.activeLocale,
    })
      .then((doc) => {
        if (!active) {
          return;
        }

        if (doc) {
          setContent(doc.content);
          setCurrentDocPath(docPath);
          setDocTitle(doc.title);
          setDocDescription(doc.description || extractDescriptionFromMarkdown(doc.content));
          setDocSourcePath(doc.sourcePath);
          setDocContentFormat(doc.contentFormat || 'markdown');
          return;
        }

        const notFoundContent =
          '# Not Found\n\nThe requested documentation page could not be found.';
        setContent(notFoundContent);
        setCurrentDocPath(docPath);
        setDocTitle('Not Found');
        setDocDescription(extractDescriptionFromMarkdown(notFoundContent));
        setDocSourcePath(undefined);
        setDocContentFormat('markdown');
      })
      .catch((error) => {
        if (!active) {
          return;
        }

        logger.error('Error loading document:', error);
        const errorContent = '# Error\n\nFailed to load documentation.';
        setContent(errorContent);
        setCurrentDocPath(docPath);
        setDocTitle('Error');
        setDocDescription(extractDescriptionFromMarkdown(errorContent));
        setDocSourcePath(undefined);
        setDocContentFormat('markdown');
      })
      .finally(() => {
        if (!active) {
          return;
        }

        setLoading(false);
        setHasLoadedOnce(true);
      });

    return () => {
      active = false;
    };
  }, [collectionId, docPath, routeContext.activeLocale, routeContext.activeVersion]);

  useEffect(() => {
    if (!docTitle) {
      return;
    }

    const noIndex = docTitle === 'Not Found' || docTitle === 'Error';

    applySeoMetadata({
      title: `${docTitle} | ${SITE_NAME}`,
      description: docDescription || collection.description || 'Boss Raid documentation.',
      path: canonicalPath,
      canonicalPath,
      type: noIndex ? 'website' : 'article',
      noIndex,
    });
  }, [canonicalPath, collection.description, docDescription, docTitle]);

  if (!hasLoadedOnce && loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse" style={{ color: 'var(--muted-color)' }}>
          Loading documentation...
        </div>
      </div>
    );
  }

  return (
    <DocumentationPage
      collectionId={collectionId}
      initialContent={renderedContent}
      currentPath={currentDocPath || docPath}
      sourcePath={docSourcePath}
      contentFormat={docContentFormat}
      isLoading={loading}
      pendingPath={docPath}
      trailingContent={trailingContent}
    />
  );
}
