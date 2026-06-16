import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  buildReceiptPath,
  buildReceiptUrl,
  parseReceiptQueryPaste,
  readReceiptQuery,
  type ReceiptQuery,
} from '../lib/receipt-url';

export function useReceiptQuery() {
  const initialQuery = useMemo(readReceiptQuery, []);
  const [raidIdInput, setRaidIdInput] = useState(initialQuery?.raidId ?? '');
  const [tokenInput, setTokenInput] = useState(initialQuery?.token ?? '');
  const [activeQuery, setActiveQuery] = useState<ReceiptQuery | null>(initialQuery);
  const [shareCopied, setShareCopied] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (!shareCopied) {
      return;
    }

    const timer = window.setTimeout(() => setShareCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [shareCopied]);

  function handleRaidIdChange(value: string) {
    setRaidIdInput(value);
    setFormError(null);
    const parsed = parseReceiptQueryPaste(value);
    if (parsed) {
      setRaidIdInput(parsed.raidId);
      setTokenInput(parsed.token);
    }
  }

  function handleTokenChange(value: string) {
    setTokenInput(value);
    setFormError(null);
    const parsed = parseReceiptQueryPaste(value);
    if (parsed) {
      setRaidIdInput(parsed.raidId);
      setTokenInput(parsed.token);
    }
  }

  function handleLoadReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const raidId = raidIdInput.trim();
    const token = tokenInput.trim();
    if (!raidId && !token) {
      setFormError('Enter raid id and access token.');
      return;
    }

    if (!raidId) {
      setFormError('Enter a raid id.');
      return;
    }

    if (!token) {
      setFormError('Enter the raid access token.');
      return;
    }

    const next = { raidId, token };
    setFormError(null);
    setActiveQuery(next);
    window.history.replaceState({}, '', buildReceiptPath(next));
  }

  async function handleCopyLink() {
    if (!activeQuery) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildReceiptUrl(activeQuery));
      setShareCopied(true);
    } catch {
      setShareCopied(false);
    }
  }

  return {
    raidIdInput,
    setRaidIdInput: handleRaidIdChange,
    tokenInput,
    setTokenInput: handleTokenChange,
    activeQuery,
    formError,
    handleLoadReceipt,
    handleCopyLink,
    shareCopied,
  };
}
