import { useEffect, useRef, useState } from 'react';
import { bindAsciiRipple } from '../ascii-ripple.js';
import {
  WORKFLOW_TAB_CYCLE_MS,
  WORKFLOW_TAB_ORDER,
  type WorkflowTabId,
} from '../lib/landing-workflow.js';

export function useLandingPage() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [workflowTab, setWorkflowTab] = useState<WorkflowTabId>('seller');
  const infoPanelRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!copiedKey) {
      return;
    }

    const timer = window.setTimeout(() => setCopiedKey(null), 1200);
    return () => window.clearTimeout(timer);
  }, [copiedKey]);

  useEffect(() => {
    const panel = infoPanelRef.current;
    if (!panel) {
      return;
    }

    return bindAsciiRipple(panel);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setWorkflowTab((current) => {
        const index = WORKFLOW_TAB_ORDER.indexOf(current);
        return WORKFLOW_TAB_ORDER[(index + 1) % WORKFLOW_TAB_ORDER.length];
      });
    }, WORKFLOW_TAB_CYCLE_MS);

    return () => window.clearInterval(timer);
  }, []);

  async function copySnippet(key: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedKey(key);
    } catch {
      setCopiedKey(null);
    }
  }

  return {
    copiedKey,
    workflowTab,
    setWorkflowTab,
    infoPanelRef,
    copySnippet,
  };
}

export type LandingPageState = ReturnType<typeof useLandingPage>;
