import { useEffect, useId, useRef, useState } from 'react';
import { File, FileText, Trash2 } from 'lucide-react';
import { fileIconKind, validateFile } from '../../../lib/fileType';

type Props = {
  file: File | null;
  onFileChange: (file: File | null) => void;
  onInvalidFile?: (message: string) => void;
  accept?: string;
  maxBytes?: number;
  fill?: boolean;
  emptyTitle?: string;
  emptyHint?: string;
  selectedTitle?: string;
  replaceHint?: string;
};

export default function SingleFileDropzone({
  file,
  onFileChange,
  onInvalidFile,
  accept = 'image/png,image/jpeg,image/gif,image/webp,application/pdf',
  maxBytes = 10 * 1024 * 1024,
  fill = true,
  emptyTitle = 'File (optional)',
  emptyHint = 'Drop file or click to browse',
  selectedTitle = 'File',
  replaceHint = 'Drop or click to replace',
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [dragOver, setDragOver] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || fileIconKind(file.name, file.type) !== 'image') {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function acceptOne(next: File) {
    const err = validateFile(next, accept, maxBytes);
    if (err) {
      onInvalidFile?.(err);
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
    if (picked) acceptOne(picked);
  }

  const hasFile = !!file;
  const headline = hasFile ? selectedTitle : emptyTitle;
  const subline = hasFile ? file!.name : emptyHint;
  const kind = file ? fileIconKind(file.name, file.type) : 'file';

  return (
    <>
      <div
        className={`file-dropzone${fill ? ' file-dropzone--fill' : ''}${dragOver ? ' file-dropzone--active' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`${headline}. ${subline}`}
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
        {hasFile ? (
          <span className="file-dropzone-thumb-btn" aria-hidden>
            {previewUrl ? (
              <img className="file-dropzone-thumb" src={previewUrl} alt="" />
            ) : kind === 'pdf' ? (
              <FileText className="file-dropzone-icon" size={22} strokeWidth={2} />
            ) : (
              <File className="file-dropzone-icon" size={22} strokeWidth={2} />
            )}
          </span>
        ) : (
          <File className="file-dropzone-icon" size={22} strokeWidth={2} aria-hidden />
        )}
        <span className="file-dropzone-copy">
          <strong>{headline}</strong>
          {subline}
        </span>
        {hasFile && (
          <button type="button" className="file-dropzone-remove" aria-label="Remove file" onClick={onRemove}>
            <Trash2 size={16} strokeWidth={2} />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) acceptOne(picked);
          e.target.value = '';
        }}
        onClick={(e) => e.stopPropagation()}
      />
    </>
  );
}
