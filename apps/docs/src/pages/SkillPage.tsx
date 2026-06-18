import { useState, useEffect } from 'react';

import DocumentationPage from '../components/docs/DocumentationPage';
import { getDocument } from '../lib/content';
import { createLogger } from '../utils/logger';
import { applySeoMetadata } from '../utils/seo';
import { extractDescriptionFromMarkdown } from '../../shared/seo.js';

const logger = createLogger('SkillPage');
const SITE_NAME = import.meta.env.VITE_SITE_NAME || 'Boss Raid Docs';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapSkillPreview(text: string): string {
  return `<div class="llms-preview-scroll"><pre class="llms-preview-pre"><code>${escapeHtml(text)}</code></pre></div>`;
}

export default function SkillPage() {
  const [content, setContent] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [sourcePath, setSourcePath] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadContent() {
      try {
        const [doc, skillResponse] = await Promise.all([getDocument('skill'), fetch('/skill.md')]);

        let mdContent = doc?.content || '# Agent Skill\n\nContent not found.';
        const nextDescription =
          doc?.description ||
          extractDescriptionFromMarkdown(doc?.content || mdContent) ||
          'Agent skill file for integrating with Boss Raid APIs, Mercenary raids, and MCP tools.';

        if (skillResponse.ok) {
          const skillContent = await skillResponse.text();
          mdContent = mdContent.replace('{skill-preview}', wrapSkillPreview(skillContent));
        } else {
          mdContent = mdContent.replace(
            '{skill-preview}',
            wrapSkillPreview('# skill.md content will appear here')
          );
        }

        setDescription(nextDescription);
        setContent(mdContent);
        setSourcePath(doc?.sourcePath);
      } catch (error) {
        logger.error('Error loading skill page content:', error);
        const fallbackContent = '# Error\n\nFailed to load content.';
        setContent(fallbackContent);
        setDescription(extractDescriptionFromMarkdown(fallbackContent));
        setSourcePath(undefined);
      } finally {
        setLoading(false);
      }
    }

    void loadContent();
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }

    applySeoMetadata({
      title: `Agent Skill | ${SITE_NAME}`,
      description:
        description ||
        'Agent skill file for integrating with Boss Raid APIs, Mercenary raids, and MCP tools.',
      path: '/skill',
      canonicalPath: '/skill',
      type: 'article',
    });
  }, [description, loading]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse text-muted-color">Loading...</div>
      </div>
    );
  }

  return <DocumentationPage initialContent={content} currentPath="skill" sourcePath={sourcePath} />;
}
