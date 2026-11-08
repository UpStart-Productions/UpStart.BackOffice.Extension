import { useEffect, useId, useRef, useState } from 'react';
import { User, Trash2 } from 'lucide-react';

const AVATAR_MIMES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  onInvalidFile?: (message: string) => void;
  fill?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  selectedTitle?: string;
  replaceHint?: string;
};

export default function AvatarDropzone({
  file,
  onFileChange,
  onInvalidFile,
  fill = true,
  emptyTitle = 'Photo (optional)',
  emptyHint = 'Drop image or click to browse',
  selectedTitle = 'Photo',
  replaceHint = 'Drop or click to replace',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function acceptFile(next: File) {
    if (!AVATAR_MIMES.includes(next.type)) {
      onInvalidFile?.('Use PNG, JPEG, GIF, or WebP.');
      return;
    }
    if (next.size > AVATAR_MAX_BYTES) {
      onInvalidFile?.('Image must be less than 5 MB.');
      return;
    }
    onFileChange(next);
  }

  function onRemove(event: React.MouseEvent) {
    event.stopPropagation();
    onFileChange(null);
  }

  function onDrop(event: React.DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(false);
    const picked = event.dataTransfer.files?.[0];
    if (picked) acceptFile(picked);
  }

  return (
    <>
      <div
        className={`avatar-dropzone${fill ? ' avatar-dropzone--fill' : ''}${dragOver ? ' avatar-dropzone--active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={file ? 'Replace photo' : emptyTitle}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setDragOver(false);
        }}
        onDrop={onDrop}
      >
        {previewUrl ? (
          <>
            <img className="avatar-dropzone-thumb" src={previewUrl} alt="" />
            <span className="avatar-dropzone-copy">
              <strong>{selectedTitle}</strong>
              {replaceHint}
            </span>
            <button type="button" className="avatar-dropzone-remove" aria-label="Remove photo" onClick={onRemove}>
              <Trash2 size={16} strokeWidth={2} />
            </button>
          </>
        ) : (
          <>
            <User className="avatar-dropzone-icon" size={20} strokeWidth={2} aria-hidden />
            <span className="avatar-dropzone-copy">
              <strong>{emptyTitle}</strong>
              {emptyHint}
            </span>
          </>
        )}
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) acceptFile(picked);
          e.target.value = '';
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </>
  );
}
