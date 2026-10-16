import React, { useState } from 'react';
import { 
  Building2, 
  Percent, 
  Wallet, 
  Cloud, 
  CloudOff, 
  RefreshCw, 
  Sliders, 
  Download, 
  Upload, 
  RotateCcw, 
  CheckCircle2, 
  ShieldCheck, 
  AlertCircle,
  Lock,
  CalendarCheck
} from 'lucide-react';
import type { 
  B2BProfile, 
  CategoryContract, 
  DatabaseState 
} from '../domain/types.ts';
import { formatGrosze, parsePlnToGrosze } from '../domain/types.ts';
import { 
  signInWithGoogleDrive, 
  signOutGoogleDrive, 
  uploadEncryptedBackup, 
  findRemoteBackup,
  getCachedAccessToken
} from '../services/driveSync.ts';
import { encryptDatabasePayload, decryptDatabasePayload } from '../domain/cryptoBackup.ts';

interface RulesAndB2BTabProps {
  b2bProfile: B2BProfile;
  categories: CategoryContract[];
  onUpdateB2BProfile: (profile: B2BProfile) => void;
  onUpdateCategories: (categories: CategoryContract[]) => void;
  fullDatabaseState: DatabaseState;
  onRestoreDatabase: (restoredState: DatabaseState) => void;
  onResetSeedData: () => void;
}

export const RulesAndB2BTab: React.FC<RulesAndB2BTabProps> = ({
  b2bProfile,
  categories,
  onUpdateB2BProfile,
  onUpdateCategories,
  fullDatabaseState,
  onRestoreDatabase,
  onResetSeedData,
}) => {
  // B2B state
  const [vatRate, setVatRate] = useState(b2bProfile.vatRatePercent);
  const [pitRate, setPitRate] = useState(b2bProfile.pitRatePercent);
  const [taxType, setTaxType] = useState(b2bProfile.taxType);
  const [zusAmountPln, setZusAmountPln] = useState((b2bProfile.zusFixedGrosze / 100).toFixed(2));
  const [isB2bSaved, setIsB2bSaved] = useState(false);

  // Cloud Sync state
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(fullDatabaseState.cloudSync.accountEmail);
  const [autoBackup, setAutoBackup] = useState(fullDatabaseState.cloudSync.autoBackup);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'SUCCESS' | 'ERROR'; text: string } | null>(null);

  // Handle B2B save
  const handleSaveB2B = (e: React.FormEvent) => {
    e.preventDefault();
    const zusGrosze = parsePlnToGrosze(zusAmountPln);
    const updated: B2BProfile = {
      ...b2bProfile,
      vatRatePercent: Number(vatRate),
      pitRatePercent: Number(pitRate),
      taxType,
      zusFixedGrosze: zusGrosze,
    };
    onUpdateB2BProfile(updated);
    setIsB2bSaved(true);
    setTimeout(() => setIsB2bSaved(false), 3000);
  };

  // Handle Google Drive OAuth Connect
  const handleConnectGoogleDrive = async () => {
    setIsConnectingDrive(true);
    setSyncStatusMsg(null);
    try {
      const res = await signInWithGoogleDrive();
      setUserEmail(res.user.email);
      setSyncStatusMsg({
        type: 'SUCCESS',
        text: `Pomyślnie połączono z Dyskiem Google (${res.user.email}).`,
      });
    } catch (err: any) {
      setSyncStatusMsg({
        type: 'ERROR',
        text: err.message || 'Nie udało się połączyć z kontem Google',
      });
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleDisconnectDrive = async () => {
    await signOutGoogleDrive();
    setUserEmail(null);
    setSyncStatusMsg({ type: 'SUCCESS', text: 'Odłączono konto Google Drive.' });
  };

  // Trigger manual cloud backup to AppDataFolder
  const handlePerformCloudBackup = async () => {
    setIsConnectingDrive(true);
    setSyncStatusMsg(null);
    try {
      const res = await uploadEncryptedBackup(fullDatabaseState);
      setSyncStatusMsg({
        type: 'SUCCESS',
        text: `Szyfrowana kopia zapasowa została wysłana do AppDataFolder w Google Drive (ID pliku: ${res.fileId}).`,
      });
    } catch (err: any) {
      setSyncStatusMsg({
        type: 'ERROR',
        text: err.message || 'Błąd wysyłania kopii zapasowej do chmury',
      });
    } finally {
      setIsConnectingDrive(false);
    }
  };

  // Local file export (.db)
  const handleExportLocalDb = async () => {
    try {
      const encryptedBytes = await encryptDatabasePayload(fullDatabaseState);
      const blob = new Blob([encryptedBytes as BlobPart], { type: 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `finguard_backup_${new Date().toISOString().slice(0, 10)}.db`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Błąd eksportu pliku bazy: ' + err.message);
    }
  };

  // Local file import (.db)
  const handleImportLocalDb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const restored = await decryptDatabasePayload(bytes);
      onRestoreDatabase(restored);
      alert(`Pomyślnie przywrócono bazę danych (${restored.transactions.length} transakcji).`);
    } catch (err: any) {
      alert('Błąd importu pliku kopii: ' + err.message);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {/* 1. GOOGLE DRIVE BACKUP & RESTORE MODULE */}
      <section aria-labelledby="google-drive-sync-heading" className="p-4 rounded-3xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Cloud className="w-4 h-4" />
            </div>
            <div>
              <h3 id="google-drive-sync-heading" className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Synchronizacja z Dyskiem Google
              </h3>
              <p className="text-[10px] text-slate-500">
                Szyfrowana kopia w ukrytym folderze AppDataFolder
              </p>
            </div>
          </div>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
            <Lock className="w-2.5 h-2.5" />
            <span>AES-GCM 256-bit</span>
          </span>
        </div>

        {/* Connection status card */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#20232a] border border-slate-200 dark:border-slate-800 space-y-2">
          {userEmail ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-slate-900 dark:text-white block">
                    Zalogowano przez Google
                  </span>
                  <span className="text-[10px] text-slate-500">{userEmail}</span>
                </div>
              </div>
              <button
                onClick={handleDisconnectDrive}
                className="px-2.5 py-1 rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 text-xs font-medium cursor-pointer"
              >
                Odłącz
              </button>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
                  Konto Google Drive niepołączone
                </span>
                <span className="text-[10px] text-slate-500">
                  Zaloguj się, aby tworzyć automatyczne kopie zapasowe
                </span>
              </div>
              <button
                onClick={handleConnectGoogleDrive}
                disabled={isConnectingDrive}
                className="px-3.5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
              >
                {isConnectingDrive ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Cloud className="w-3.5 h-3.5" />}
                <span>Połącz z Google Drive</span>
              </button>
            </div>
          )}

          {/* Auto-backup toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
            <div>
              <span className="font-semibold text-slate-900 dark:text-white block">
                Automatyczna kopia zapasowa w tle
              </span>
              <span className="text-[10px] text-slate-500">
                Wysyła zaszyfrowaną bazę po każdej zmianie i imporcie CSV
              </span>
            </div>
            <input
              type="checkbox"
              checked={autoBackup}
              onChange={(e) => setAutoBackup(e.target.checked)}
              className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
            />
          </div>

          {/* Manual Backup Action Button */}
          {userEmail && (
            <div className="pt-1">
              <button
                onClick={handlePerformCloudBackup}
                disabled={isConnectingDrive}
                className="w-full py-2 px-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center gap-1.5 hover:bg-indigo-100 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Wykonaj kopię zapasową w chmurze teraz (finguard_backup.db)</span>
              </button>
            </div>
          )}
        </div>

        {/* Security & Play Store Scope compliance notice */}
        <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800/80 text-[10px] text-slate-500 leading-relaxed flex items-start gap-2">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
          <span>
            <strong>Zgodność z polityką prywatności Google Play Store:</strong> Aplikacja żąda wyłącznie uprawnienia do ukrytego katalogu <code>appdata</code> (<code>https://www.googleapis.com/auth/drive.appdata</code>). Aplikacja NIE ma dostępu do prywatnych plików na Twoim Dysku Google.
          </span>
        </div>

        {/* Sync Status Feedback */}
        {syncStatusMsg && (
          <div
            className={`p-3 rounded-2xl text-xs font-medium flex items-center gap-2 ${
              syncStatusMsg.type === 'SUCCESS'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800'
                : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
            }`}
          >
            {syncStatusMsg.type === 'SUCCESS' ? <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" /> : <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
            <span>{syncStatusMsg.text}</span>
          </div>
        )}
      </section>

      {/* 2. B2B & JDG PROFILE CONFIGURATION */}
      <section aria-labelledby="b2b-config-heading" className="p-4 rounded-3xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-indigo-500" />
          <h3 id="b2b-config-heading" className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Konfiguracja Stawek B2B (JDG) & ZUS
          </h3>
        </div>

        <form onSubmit={handleSaveB2B} className="space-y-3">
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Stawka VAT (%)
              </label>
              <input
                type="number"
                value={vatRate}
                onChange={(e) => setVatRate(Number(e.target.value))}
                className="w-full p-2.5 rounded-2xl bg-slate-100 dark:bg-[#23262d] border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Typ opodatkowania PIT
              </label>
              <select
                value={taxType}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setTaxType(val);
                  if (val === 'RYCZALT_12') setPitRate(12);
                  if (val === 'LINIOWY_19') setPitRate(19);
                  if (val === 'SKALA_12') setPitRate(12);
                }}
                className="w-full p-2.5 rounded-2xl bg-slate-100 dark:bg-[#23262d] border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
              >
                <option value="RYCZALT_12">Ryczałt 12% (Programiści)</option>
                <option value="LINIOWY_19">Podatek liniowy 19%</option>
                <option value="SKALA_12">Skala podatkowa 12%</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Stawka podatku PIT (%)
              </label>
              <input
                type="number"
                value={pitRate}
                onChange={(e) => setPitRate(Number(e.target.value))}
                className="w-full p-2.5 rounded-2xl bg-slate-100 dark:bg-[#23262d] border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                Stała składka ZUS (PLN)
              </label>
              <input
                type="number"
                step="0.01"
                value={zusAmountPln}
                onChange={(e) => setZusAmountPln(e.target.value)}
                className="w-full p-2.5 rounded-2xl bg-slate-100 dark:bg-[#23262d] border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors cursor-pointer shadow-sm"
          >
            {isB2bSaved ? '✓ Zapisano ustawienia B2B' : 'Zapisz profil B2B'}
          </button>
        </form>
      </section>

      {/* 3. KONTRAKTY CZĘSTOTLIWOŚCI KATEGORII (CADENCE CONTRACTS) */}
      <section aria-labelledby="cadence-contracts-heading" className="p-4 rounded-3xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <CalendarCheck className="w-4 h-4 text-indigo-500" />
          <h3 id="cadence-contracts-heading" className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Kontrakty Częstotliwości (Cadence Guard)
          </h3>
        </div>

        <p className="text-[11px] text-slate-500 leading-relaxed">
          Ustaw dla każdej kategorii docelowy odstęp w dniach oraz limit wizyt w miesiącu, aby Strażnik Częstotliwości natychmiast ostrzegał Cię przed wyciekiem pieniędzy:
        </p>

        <div className="space-y-3">
          {categories
            .filter((c) => c.type === 'LIFE_COST')
            .map((cat, idx) => (
              <div
                key={cat.id}
                className="p-3 rounded-2xl bg-slate-50 dark:bg-[#20232a] border border-slate-200 dark:border-slate-800 space-y-2 text-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span>{cat.name}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-semibold">
                    Koszty Życia
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div>
                    <label className="text-slate-500 block mb-0.5">Odstęp (co ile dni):</label>
                    <input
                      type="number"
                      value={cat.cadenceDays}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        const copy = [...categories];
                        copy[idx] = { ...copy[idx], cadenceDays: val };
                        onUpdateCategories(copy);
                      }}
                      className="w-full p-2 rounded-xl bg-white dark:bg-[#16181d] border border-slate-200 dark:border-slate-700 text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="text-slate-500 block mb-0.5">Max wystąpień/msc:</label>
                    <input
                      type="number"
                      value={cat.maxMonthlyOccurrences}
                      onChange={(e) => {
                        const val = parseInt(e.target.value) || 1;
                        const copy = [...categories];
                        copy[idx] = { ...copy[idx], maxMonthlyOccurrences: val };
                        onUpdateCategories(copy);
                      }}
                      className="w-full p-2 rounded-xl bg-white dark:bg-[#16181d] border border-slate-200 dark:border-slate-700 text-xs font-bold"
                    />
                  </div>
                </div>

                {/* Same day toggle */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-500">
                    Traktuj kilka zakupów tego samego dnia jako 1 zdarzenie
                  </span>
                  <input
                    type="checkbox"
                    checked={cat.sameDayAsOneEvent}
                    onChange={(e) => {
                      const copy = [...categories];
                      copy[idx] = { ...copy[idx], sameDayAsOneEvent: e.target.checked };
                      onUpdateCategories(copy);
                    }}
                    className="w-3.5 h-3.5 rounded text-indigo-600"
                  />
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* 4. LOCAL SQLITE EXPORT / RESTORE & DEMO RESET */}
      <section aria-labelledby="local-backup-heading" className="p-4 rounded-3xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <h3 id="local-backup-heading" className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
          Zarządzanie Danymi Lokalnymi & Plik .db
        </h3>

        <div className="grid grid-cols-2 gap-2">
          {/* Export .db */}
          <button
            onClick={handleExportLocalDb}
            className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Eksportuj (.db)</span>
          </button>

          {/* Import .db */}
          <label className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors text-center">
            <Upload className="w-3.5 h-3.5" />
            <span>Wczytaj (.db)</span>
            <input
              type="file"
              accept=".db,application/octet-stream"
              onChange={handleImportLocalDb}
              className="hidden"
            />
          </label>
        </div>

        {/* Reset to Seed Data */}
        <div className="pt-1">
          <button
            onClick={() => {
              if (confirm('Czy na pewno chcesz przywrócić początkowe dane demonstracyjne (z B2B, Apteką Sąsiedzką i złamanym rytmem)?')) {
                onResetSeedData();
              }
            }}
            className="w-full py-2.5 px-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-amber-100 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Przywróć kompletne dane demonstracyjne (Demo)</span>
          </button>
        </div>
      </section>
    </div>
  );
};
