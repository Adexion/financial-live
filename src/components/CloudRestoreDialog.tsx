import React, { useState } from 'react';
import { CloudDownload, AlertTriangle, ShieldCheck, Check, X, RefreshCw } from 'lucide-react';
import type { RemoteBackupFileInfo } from '../services/driveSync.ts';

interface CloudRestoreDialogProps {
  backupInfo: RemoteBackupFileInfo;
  onRestoreReplace: () => Promise<void>;
  onRestoreMerge: () => Promise<void>;
  onDismiss: () => void;
}

export const CloudRestoreDialog: React.FC<CloudRestoreDialogProps> = ({
  backupInfo,
  onRestoreReplace,
  onRestoreMerge,
  onDismiss,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const formattedDate = new Date(backupInfo.modifiedTime).toLocaleString('pl-PL', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleAction = async (action: () => Promise<void>) => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await action();
    } catch (err: any) {
      setErrorMessage(err.message || 'Wystąpił błąd podczas pobierania kopii zapasowej');
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-[#1a1c22] rounded-3xl p-5 border border-indigo-200 dark:border-indigo-900/60 shadow-2xl space-y-4">
        {/* Header with Cloud Icon */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <CloudDownload className="w-5 h-5 animate-bounce" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              Kopia Zapasowa w Chmurze
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
              Znaleziono kopię zapasową w chmurze
            </h3>
          </div>
        </div>

        {/* Details Card */}
        <div className="p-3.5 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/50 space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
          <p className="font-semibold text-slate-900 dark:text-white">
            Znaleziono kopię zapasową w chmurze z dnia <strong className="text-indigo-600 dark:text-indigo-400">{formattedDate}</strong>.
          </p>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Plik: <code>{backupInfo.name}</code> (ukryty folder AppDataFolder). Czy chcesz pobrać i przywrócić swoje dane finansowe?
          </p>
        </div>

        {/* Protection against conflict */}
        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-[10px] text-slate-500 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>
            Bezpieczna synchronizacja: unikalne hashe SHA-256 zapobiegają duplikacji transakcji podczas łączenia.
          </span>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 text-xs flex items-center gap-2 border border-red-200 dark:border-red-900">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Buttons */}
        <div className="space-y-2 pt-1">
          <button
            onClick={() => handleAction(onRestoreReplace)}
            disabled={isLoading}
            className="w-full py-2.5 px-4 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-sm disabled:opacity-50"
          >
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
            <span>Pobierz i przywróć (Zastąp)</span>
          </button>

          <button
            onClick={() => handleAction(onRestoreMerge)}
            disabled={isLoading}
            className="w-full py-2 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <span>Połącz dane z chmury z lokalnymi (Merge SHA-256)</span>
          </button>

          <button
            onClick={onDismiss}
            disabled={isLoading}
            className="w-full py-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[11px] font-medium cursor-pointer"
          >
            Pomiń / Zachowaj stan lokalny
          </button>
        </div>
      </div>
    </div>
  );
};
