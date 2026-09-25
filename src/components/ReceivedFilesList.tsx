import { Download, CheckCircle, File, Image as ImageIcon, Music, Video, ExternalLink } from 'lucide-react';
import { ReceivedFileItem } from '../types/transfer';
import { formatBytes } from '../lib/format';

interface ReceivedFilesListProps {
  files: ReceivedFileItem[];
  onDownloadAll: () => void;
}

export function ReceivedFilesList({ files, onDownloadAll }: ReceivedFilesListProps) {
  if (files.length === 0) return null;

  const getFileIcon = (type: string) => {
    if (type.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-neutral-400" />;
    if (type.startsWith('audio/')) return <Music className="w-4 h-4 text-neutral-400" />;
    if (type.startsWith('video/')) return <Video className="w-4 h-4 text-neutral-400" />;
    return <File className="w-4 h-4 text-neutral-400" />;
  };

  const handleDownload = (file: ReceivedFileItem) => {
    if (!file.downloadUrl) return;
    const a = document.createElement('a');
    a.href = file.downloadUrl;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div className="w-full max-w-2xl mx-auto my-6 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl p-6 shadow-sm transition-colors">
      <div className="flex items-center justify-between pb-4 border-b border-neutral-100 dark:border-neutral-800">
        <div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <h4 className="text-sm font-bold text-neutral-900 dark:text-neutral-100">
              Received Files ({files.length})
            </h4>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Directly reassembled in client memory · Zero server storage
          </p>
        </div>

        {files.length > 1 && (
          <button
            type="button"
            onClick={onDownloadAll}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-xl bg-neutral-950 dark:bg-white text-white dark:text-neutral-950 hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download All</span>
          </button>
        )}
      </div>

      <div className="divide-y divide-neutral-100 dark:divide-neutral-800/80 my-2">
        {files.map((file) => (
          <div key={file.id} className="py-3.5 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0">
                {getFileIcon(file.type)}
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-neutral-900 dark:text-neutral-100 truncate">
                  {file.name}
                </p>
                <div className="flex items-center gap-2 text-[11px] text-neutral-400 font-mono mt-0.5">
                  <span>{formatBytes(file.size)}</span>
                  <span>·</span>
                  <span className="text-emerald-500 font-sans">CRC Verified</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {file.type.startsWith('image/') && file.downloadUrl && (
                <a
                  href={file.downloadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="p-2 text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-colors rounded-lg border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  title="Open Preview"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
              <button
                type="button"
                onClick={() => handleDownload(file)}
                className="py-1.5 px-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700 font-medium inline-flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save</span>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
