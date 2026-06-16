import { useEffect, useState } from 'react';

export const COPY_FEEDBACK_MS = 1_200;

export function useCopyFeedback() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedKey) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedKey(null), COPY_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  async function copyText(text: string, key = 'default') {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
    } catch {
      setCopiedKey(null);
    }
  }

  return {
    copiedKey,
    copied: copiedKey !== null,
    copyText,
  };
}
