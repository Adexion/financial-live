import React from 'react';
import { 
  ShieldCheck, 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  Sun, 
  Moon, 
  Share2, 
  ChevronDown,
  Smartphone,
  Monitor
} from 'lucide-react';

interface TopAppBarProps {
  currentMonth: string; // YYYY-MM
  availableMonths: string[];
  onMonthChange: (month: string) => void;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  isSyncing: boolean;
  cloudSyncEnabled: boolean;
  lastSyncDate: string | null;
  onTriggerSync: () => void;
  onOpenExportReport: () => void;
  isFrameEnabled: boolean;
  onToggleFrame: () => void;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  currentMonth,
  availableMonths,
  onMonthChange,
  isDarkMode,
  onToggleTheme,
  isSyncing,
  cloudSyncEnabled,
  lastSyncDate,
  onTriggerSync,
  onOpenExportReport,
  isFrameEnabled,
  onToggleFrame,
}) => {
  // Polish month names
  const formatMonthLabel = (ym: string) => {
    const [year, month] = ym.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    const monthName = date.toLocaleDateString('pl-PL', { month: 'long' });
    return `${monthName.charAt(0).toUpperCase() + monthName.slice(1)} ${year}`;
  };

  return (
    <header className="bg-white/95 dark:bg-[#16181d]/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/80 px-4 py-2.5 flex items-center justify-between z-20 select-none">
      {/* Brand & Month Selector */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white shadow-sm">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div>
          <div className="flex items-center gap-1.5">
            <h1 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">
              FinGuard
            </h1>
            <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800/50">
              B2B + Dom
            </span>
          </div>

          {/* Month Selector dropdown */}
          <div className="relative inline-block mt-0.5">
            <select
              value={currentMonth}
              onChange={(e) => onMonthChange(e.target.value)}
              className="appearance-none bg-transparent pr-4 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer focus:outline-none"
              aria-label="Wybierz miesiąc do analizy"
            >
              {availableMonths.map((ym) => (
                <option key={ym} value={ym} className="bg-white dark:bg-[#1e2025] text-slate-900 dark:text-slate-100">
                  {formatMonthLabel(ym)}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Cloud Sync Status Button */}
        <button
          onClick={onTriggerSync}
          className={`p-1.5 rounded-full transition-colors cursor-pointer relative group ${
            cloudSyncEnabled
              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50'
              : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
          title={
            cloudSyncEnabled
              ? `Kopia zapasowa w Google Drive (ostatnia: ${lastSyncDate || 'brak'}) - kliknij aby zsynchronizować`
              : 'Dysk Google niepołączony - kliknij aby skonfigurować'
          }
          aria-label="Synchronizacja z Dyskiem Google"
        >
          {isSyncing ? (
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
          ) : cloudSyncEnabled ? (
            <Cloud className="w-4 h-4" />
          ) : (
            <CloudOff className="w-4 h-4" />
          )}
          {cloudSyncEnabled && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white dark:ring-slate-900" />
          )}
        </button>

        {/* Export Report / Share Sheet */}
        <button
          onClick={onOpenExportReport}
          className="p-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Eksportuj Raport (CSV / HTML / Share Sheet)"
          aria-label="Eksportuj raport finansowy"
        >
          <Share2 className="w-4 h-4" />
        </button>

        {/* Dark / Light Theme Toggle */}
        <button
          onClick={onToggleTheme}
          className="p-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title={isDarkMode ? 'Włącz jasny motyw' : 'Włącz ciemny motyw'}
          aria-label="Przełącz motyw graficzny"
        >
          {isDarkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* Desktop Phone Frame Toggle */}
        <button
          onClick={onToggleFrame}
          className="hidden sm:flex p-1.5 rounded-full text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title={isFrameEnabled ? 'Tryb pełnoekranowy' : 'Ramka smartfona Android'}
          aria-label="Przełącz ramkę smartfona"
        >
          {isFrameEnabled ? <Monitor className="w-4 h-4" /> : <Smartphone className="w-4 h-4" />}
        </button>
      </div>
    </header>
  );
};
