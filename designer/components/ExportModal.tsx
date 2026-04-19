'use client';

import { useEffect, useMemo, useState } from 'react';
import { exportCourseJson, parseImportedCourseJson } from '@/lib/export';
import type { HoleData } from '@/lib/types';

interface ExportModalProps {
  open: boolean;
  defaultTab?: 'export' | 'import';
  onClose: () => void;
  courseName: string;
  designer: string;
  holes: HoleData[];
  onImportCourse: (payload: { courseName: string; designer: string; holes: HoleData[] }) => void;
}

export default function ExportModal({
  open,
  defaultTab = 'export',
  onClose,
  courseName,
  designer,
  holes,
  onImportCourse,
}: ExportModalProps) {
  const [tab, setTab] = useState<'export' | 'import'>(defaultTab);
  const [importText, setImportText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const exportError = useMemo(() => {
    try {
      exportCourseJson({ courseName, designer, holes });
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : 'Unable to export course';
    }
  }, [courseName, designer, holes]);

  const exportText = useMemo(() => {
    if (exportError) return '';
    return exportCourseJson({ courseName, designer, holes });
  }, [courseName, designer, exportError, holes]);

  useEffect(() => {
    if (open) {
      setTab(defaultTab);
    }
  }, [defaultTab, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-4xl bg-gray-900 border border-gray-700 rounded-lg shadow-2xl">
        <div className="h-12 px-4 border-b border-gray-700 flex items-center justify-between">
          <div className="flex gap-2">
            <button
              type="button"
              className={`px-3 h-8 rounded text-sm ${
                tab === 'export' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200'
              }`}
              onClick={() => setTab('export')}
            >
              Export JSON
            </button>
            <button
              type="button"
              className={`px-3 h-8 rounded text-sm ${
                tab === 'import' ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-200'
              }`}
              onClick={() => setTab('import')}
            >
              Import JSON
            </button>
          </div>
          <button type="button" className="text-gray-300 hover:text-white" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="p-4 space-y-3">
          {tab === 'export' && (
            <>
              {exportError && <div className="text-sm text-red-400">{exportError}</div>}
              <textarea
                value={exportText}
                readOnly
                className="w-full h-[420px] rounded bg-gray-950 border border-gray-700 p-3 text-xs text-gray-100 font-mono"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-9 px-3 rounded bg-green-600 hover:bg-green-500 text-white text-sm disabled:opacity-50"
                  disabled={!exportText}
                  onClick={async () => {
                    await navigator.clipboard.writeText(exportText);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? 'Copied' : 'Copy to Clipboard'}
                </button>
                <button
                  type="button"
                  className="h-9 px-3 rounded bg-gray-700 hover:bg-gray-600 text-gray-100 text-sm disabled:opacity-50"
                  disabled={!exportText}
                  onClick={() => {
                    const blob = new Blob([exportText], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = `${courseName || 'course'}.json`;
                    anchor.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Download .json
                </button>
              </div>
            </>
          )}

          {tab === 'import' && (
            <>
              <textarea
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                className="w-full h-[420px] rounded bg-gray-950 border border-gray-700 p-3 text-xs text-gray-100 font-mono"
                placeholder="Paste exported JSON here"
              />
              {error && <div className="text-sm text-red-400">{error}</div>}
              <button
                type="button"
                className="h-9 px-3 rounded bg-green-600 hover:bg-green-500 text-white text-sm"
                onClick={() => {
                  try {
                    const parsed = parseImportedCourseJson(importText);
                    onImportCourse(parsed);
                    setError(null);
                    onClose();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Import failed');
                  }
                }}
              >
                Load Course
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
