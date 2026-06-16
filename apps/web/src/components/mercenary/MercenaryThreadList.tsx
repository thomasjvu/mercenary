import { useEffect, useRef, useState } from 'react';
import type { MercenaryThreadRecord } from '../../lib/mercenary-threads.js';

type MercenaryThreadListProps = {
  threads: MercenaryThreadRecord[];
  activeThreadId: string;
  onSelectThread: (threadId: string) => void;
  onNewThread: () => void;
  onRenameThread: (threadId: string, title: string) => void;
  onDeleteThread: (threadId: string) => void;
};

export function MercenaryThreadList({
  threads,
  activeThreadId,
  onSelectThread,
  onNewThread,
  onRenameThread,
  onDeleteThread,
}: MercenaryThreadListProps) {
  const [editingThreadId, setEditingThreadId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingThreadId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingThreadId]);

  function beginRename(thread: MercenaryThreadRecord) {
    setEditingThreadId(thread.id);
    setDraftTitle(thread.title);
  }

  function commitRename(threadId: string) {
    onRenameThread(threadId, draftTitle);
    setEditingThreadId(null);
    setDraftTitle('');
  }

  function cancelRename() {
    setEditingThreadId(null);
    setDraftTitle('');
  }

  return (
    <section aria-label="Local threads" className="mercenary-threads">
      <div className="mercenary-threads__head">
        <span className="mercenary-threads__label">threads</span>
        <button
          aria-label="Start new thread"
          className="mercenary-threads__new"
          onClick={onNewThread}
          type="button"
        >
          +
        </button>
      </div>
      <ul className="mercenary-threads__list">
        {threads.map((thread) => {
          const isActive = thread.id === activeThreadId;
          const isEditing = editingThreadId === thread.id;

          return (
            <li
              className={`mercenary-threads__row${isActive ? ' mercenary-threads__row--active' : ''}${isEditing ? ' mercenary-threads__row--editing' : ''}`}
              key={thread.id}
            >
              {isEditing ? (
                <input
                  aria-label="Rename thread"
                  className="mercenary-threads__input"
                  onBlur={() => commitRename(thread.id)}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitRename(thread.id);
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelRename();
                    }
                  }}
                  ref={editInputRef}
                  value={draftTitle}
                />
              ) : (
                <button
                  aria-current={isActive ? 'true' : undefined}
                  className="mercenary-threads__select"
                  onClick={() => onSelectThread(thread.id)}
                  onDoubleClick={(event) => {
                    event.preventDefault();
                    beginRename(thread);
                  }}
                  type="button"
                >
                  <span className="mercenary-threads__item-title">{thread.title}</span>
                </button>
              )}

              {!isEditing ? (
                <div className="mercenary-threads__actions">
                  <button
                    aria-label={`Rename ${thread.title}`}
                    className="mercenary-threads__action"
                    onClick={(event) => {
                      event.stopPropagation();
                      beginRename(thread);
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    type="button"
                  >
                    rename
                  </button>
                  <button
                    aria-label={`Delete ${thread.title}`}
                    className="mercenary-threads__action mercenary-threads__action--delete"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (editingThreadId === thread.id) {
                        cancelRename();
                      }
                      onDeleteThread(thread.id);
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    type="button"
                  >
                    delete
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
