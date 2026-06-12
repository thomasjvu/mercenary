import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  buildReceiptPath,
  buildReceiptUrl,
  readReceiptQuery,
  type ReceiptQuery,
} from '../lib/receipt-url';

export function useReceiptQuery() {
  const initialQuery = useMemo(readReceiptQuery, []);
  const [raidIdInput, setRaidIdInput] = useState(initialQuery?.raidId ?? '');
  const [tokenInput, setTokenInput] = useState(initialQuery?.token ?? '');
  const [activeQuery, setActiveQuery] = useState<ReceiptQuery | null>(initialQuery);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => {
    if (!shareCopied) {
      return;
    }

    const timer = window.setTimeout(() => setShareCopied(false), 1200);
    return () => window.clearTimeout(timer);
  }, [shareCopied]);

  function handleLoadReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const raidId = raidIdInput.trim();
    const token = tokenInput.trim();
    if (!raidId || !token) {
      return;
    }

    const next = { raidId, token };
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
    setRaidIdInput,
    tokenInput,
    setTokenInput,
    activeQuery,
    handleLoadReceipt,
    handleCopyLink,
    shareCopied,
  };
}
