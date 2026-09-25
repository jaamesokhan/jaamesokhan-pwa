import { useState } from 'react';
import { Link } from 'react-router';
import { mdiDeleteOutline, mdiNoteEditOutline, mdiShareVariantOutline } from '@mdi/js';
import { useTitle } from '../components/Layout';
import { ConfirmDialog, EmptyState, IconButton, PoetAvatar, Spinner } from '../components/ui';
import { deleteComment, listAllComments, pathText, type NoteItem } from '../data/user';
import { formatDateTime } from '../lib/format';
import { shareText } from '../lib/share';
import { useDbQuery } from '../state/hooks';
import { S } from '../strings';

export default function NotesPage() {
  useTitle(S.noteTitle);
  const notes = useDbQuery(listAllComments, []);
  const [deleting, setDeleting] = useState<NoteItem | null>(null);

  if (notes.loading && !notes.data) return <Spinner />;
  if (notes.data?.length === 0) return <EmptyState icon={mdiNoteEditOutline} title={S.noNote} />;

  return (
    <div className="page">
      <ul className="list">
        {notes.data?.map((note) => (
          <li key={note.comment.id} className="card collection-item">
            <div className="collection-item-header">
              <PoetAvatar name={note.context.poet.name} imageUrl={note.context.poet.imageUrl} size={40} />
              <Link className="path" to={`/poem/${note.context.poet.id}/${note.context.poem.id}`}>
                {pathText(note.context)}
              </Link>
            </div>
            <p className="note-text">{note.comment.text}</p>
            <div className="note-footer">
              <time>{formatDateTime(note.comment.createdAt)}</time>
              <IconButton
                icon={mdiShareVariantOutline}
                label={S.share}
                onClick={() => void shareText(`${note.comment.text}\n\n${pathText(note.context)}`)}
              />
              <IconButton icon={mdiDeleteOutline} label={S.delete} onClick={() => setDeleting(note)} />
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={deleting != null}
        message={`${S.delete} ${S.comment}؟`}
        confirmLabel={S.delete}
        danger
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          void deleteComment(deleting!.comment.id);
          setDeleting(null);
        }}
      />
    </div>
  );
}
