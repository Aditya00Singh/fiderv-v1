import React, { useRef, useState } from 'react';
import { UploadCloud, File, Trash2, ArrowUpRight, FolderPlus } from 'lucide-react';
import { formatBytes } from '../lib/format';

interface FileDropzoneProps {
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  onClearFiles: () => void;
  onSend: () => void;
  isConnected: boolean;
  isSending: boolean;
}

export function FileDropzone({
  files,
  onAddFiles,
  onRemoveFile,
  onClearFiles,
  onSend,
  isConnected,
  isSending,
}: FileDropzoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files);
      onAddFiles(droppedFiles);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      onAddFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Drop Zone Box */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all cursor-pointer ${
          isDragOver
            ? 'border-neutral-900 dark:border-neutral-100 bg-neutral-100 dark:bg-neutral-900/90 scale-[1.01]'
            : 'border-neutral-300 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/40 hover:border-neutral-400 dark:hover:border-neutral-700'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />
        <input
          ref={folderInputRef}
          type="file"
          // @ts-expect-error webkitdirectory is standard in browsers
          webkitdirectory=""
          directory=""
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-800 dark:text-neutral-200">
          <UploadCloud className="w-7 h-7 stroke-[1.75]" />
        </div>

        <h3 className="text-base sm:text-lg font-bold text-neutral-900 dark:text-neutral-100 mb-5">
          Drop files here, or click to browse
        </h3>

        <div className="flex flex-wrap items-center justify-center gap-3" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors inline-flex items-center gap-1.5"
          >
            <File className="w-3.5 h-3.5" />
            <span>Select Files</span>
          </button>
          <button
            type="button"
            onClick={() => folderInputRef.current?.click()}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-800 dark:text-neutral-200 transition-colors inline-flex items-center gap-1.5"
          >
            <FolderPlus className="w-3.5 h-3.5" />
            <span>Select Folder</span>
          </button>
        </div>
      </div>

      {/* Selected Files Queue */}
      {files.length > 0 && (
        <div className="mt-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between pb-3 border-b border-neutral-100 dark:border-neutral-800 text-xs">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">
              Queue: {files.length} {files.length === 1 ? 'file' : 'files'} · {formatBytes(totalSize)}
            </span>
            <button
              type="button"
              onClick={onClearFiles}
              disabled={isSending}
              className="text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors cursor-pointer"
            >
              Clear All
            </button>
          </div>

          <div className="max-h-56 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800/60 my-2">
            {files.map((file, idx) => (
              <div key={`${file.name}-${idx}`} className="py-2.5 flex items-center justify-between text-xs gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <File className="w-4 h-4 text-neutral-400 shrink-0" />
                  <span className="font-medium text-neutral-800 dark:text-neutral-200 truncate">
                    {file.name}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-neutral-400 font-mono tabular-nums">
                    {formatBytes(file.size)}
                  </span>
                  {!isSending && (
                    <button
                      type="button"
                      onClick={() => onRemoveFile(idx)}
                      className="text-neutral-400 hover:text-red-500 transition-colors p-1"
                      title="Remove file"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between">
            <span className="text-xs text-neutral-500">
              {isConnected ? 'Direct P2P Link Established' : 'Waiting for companion to connect...'}
            </span>
            <button
              type="button"
              onClick={onSend}
              disabled={!isConnected || isSending || files.length === 0}
              className="px-6 py-2.5 text-xs font-bold rounded-xl bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-all inline-flex items-center gap-2 cursor-pointer"
            >
              <span>{isSending ? 'Streaming...' : 'Stream Over P2P'}</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
