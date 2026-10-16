/**
 * FinGuard - Zaawansowany Budżet Domowy & B2B / JDG
 * Android Jetpack Compose Material 3 Experience
 */

import React, { useState, useEffect, useMemo } from 'react';
import type { 
  DatabaseState, 
  Transaction, 
  CategoryContract, 
  B2BProfile 
} from './domain/types.ts';
import { generateSeedDatabase } from './domain/seedData.ts';
import { AndroidFrame } from './components/AndroidFrame.tsx';
import { TopAppBar } from './components/TopAppBar.tsx';
import { BottomNavBar, ActiveTab } from './components/BottomNavBar.tsx';
import { DashboardTab } from './components/DashboardTab.tsx';
import { TransactionsTab } from './components/TransactionsTab.tsx';
import { ForecastTab } from './components/ForecastTab.tsx';
import { RulesAndB2BTab } from './components/RulesAndB2BTab.tsx';
import { CloudRestoreDialog } from './components/CloudRestoreDialog.tsx';
import { ReportExportModal } from './components/ReportExportModal.tsx';
import { analyzeCadenceAndAnomalies } from './domain/cadenceGuard.ts';
import { 
  initAuthListener, 
  findRemoteBackup, 
  uploadEncryptedBackup, 
  downloadAndDecryptBackup, 
  RemoteBackupFileInfo 
} from './services/driveSync.ts';

const LOCAL_STORAGE_KEY = 'finguard_database_v1';
const THEME_STORAGE_KEY = 'finguard_theme';
const FRAME_STORAGE_KEY = 'finguard_frame_mode';

export default function App() {
  // Theme state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved ? saved === 'dark' : true; // Default dark Material 3
  });

  // Android device frame state (desktop preview)
  const [isFrameEnabled, setIsFrameEnabled] = useState<boolean>(() => {
    const saved = localStorage.getItem(FRAME_STORAGE_KEY);
    return saved ? saved === 'true' : false; // Default full edge-to-edge
  });

  // Database state
  const [dbState, setDbState] = useState<DatabaseState>(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.transactions && parsed.categories) {
          // If existing cached database doesn't have receipt data on sample stores, merge seed receipts
          const hasAnyReceipt = parsed.transactions.some((t: any) => t.receipt);
          if (!hasAnyReceipt) {
            const seed = generateSeedDatabase();
            const seedReceiptMap = new Map<string, any>();
            seed.transactions.forEach((st) => {
              if (st.receipt) seedReceiptMap.set(st.recipient, st.receipt);
            });
            parsed.transactions = parsed.transactions.map((t: any) => {
              if (!t.receipt && seedReceiptMap.has(t.recipient)) {
                return { ...t, receipt: seedReceiptMap.get(t.recipient) };
              }
              return t;
            });
          }
          return parsed;
        }
      }
    } catch (e) {
      console.error('Failed to load local database, falling back to seed data', e);
    }
    return generateSeedDatabase();
  });

  // Navigation state
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [categoryFilterFromDashboard, setCategoryFilterFromDashboard] = useState<string | null>(null);

  // Month selector state
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    const now = new Date();
    const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    monthsSet.add(currentYm);

    for (const t of dbState.transactions) {
      if (t.date && t.date.length >= 7) {
        monthsSet.add(t.date.slice(0, 7));
      }
    }

    return Array.from(monthsSet).sort().reverse();
  }, [dbState.transactions]);

  const [selectedMonth, setSelectedMonth] = useState<string>(availableMonths[0] || '2026-10');

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [remoteBackupFound, setRemoteBackupFound] = useState<RemoteBackupFileInfo | null>(null);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Apply dark mode class to HTML element
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem(THEME_STORAGE_KEY, 'light');
    }
  }, [isDarkMode]);

  // Persist DB state to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(dbState));
    } catch (e) {
      console.error('Failed to save database state to localStorage', e);
    }
  }, [dbState]);

  // Setup Google Drive Auth Listener & check for remote backups on load
  useEffect(() => {
    const unsubscribe = initAuthListener(
      async (user, token) => {
        // User is signed in with Google Drive scope
        setDbState((prev) => ({
          ...prev,
          cloudSync: {
            ...prev.cloudSync,
            enabled: true,
            accountEmail: user.email,
          },
        }));

        // Check if there is an existing backup in Google Drive AppDataFolder
        try {
          const remoteFile = await findRemoteBackup(token);
          if (remoteFile) {
            // Check if remote modified time is newer or differs
            setRemoteBackupFound(remoteFile);
          }
        } catch (err) {
          console.warn('Could not check remote backup on startup:', err);
        }
      },
      () => {
        setDbState((prev) => ({
          ...prev,
          cloudSync: {
            ...prev.cloudSync,
            enabled: false,
            accountEmail: null,
          },
        }));
      }
    );

    return () => unsubscribe();
  }, []);

  // Cadence alerts count for navigation badge
  const cadenceAnalysis = useMemo(() => {
    return analyzeCadenceAndAnomalies(dbState.transactions, dbState.categories);
  }, [dbState.transactions, dbState.categories]);

  // Database mutations
  const handleImportTransactions = (newTxs: Transaction[]) => {
    setDbState((prev) => ({
      ...prev,
      transactions: [...newTxs, ...prev.transactions],
    }));
  };

  const handleUpdateTransaction = (updated: Transaction) => {
    setDbState((prev) => ({
      ...prev,
      transactions: prev.transactions.map((t) => (t.id === updated.id ? updated : t)),
    }));
  };

  const handleDeleteTransaction = (id: string) => {
    setDbState((prev) => ({
      ...prev,
      transactions: prev.transactions.filter((t) => t.id !== id),
    }));
  };

  const handleAddTransaction = (newTx: Transaction) => {
    setDbState((prev) => ({
      ...prev,
      transactions: [newTx, ...prev.transactions],
    }));
  };

  const handleUpdateB2BProfile = (updated: B2BProfile) => {
    setDbState((prev) => ({
      ...prev,
      b2bProfile: updated,
    }));
  };

  const handleUpdateCategories = (updatedCategories: CategoryContract[]) => {
    setDbState((prev) => ({
      ...prev,
      categories: updatedCategories,
    }));
  };

  const handleResetSeedData = () => {
    const freshSeed = generateSeedDatabase();
    setDbState(freshSeed);
  };

  // Google Drive Manual Sync Trigger
  const handleTriggerSync = async () => {
    if (!dbState.cloudSync.accountEmail) {
      setActiveTab('rules_b2b');
      return;
    }

    setIsSyncing(true);
    try {
      const res = await uploadEncryptedBackup(dbState);
      const syncDate = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
      setDbState((prev) => ({
        ...prev,
        cloudSync: {
          ...prev.cloudSync,
          lastSyncDate: syncDate,
        },
      }));
    } catch (err: any) {
      alert('Błąd synchronizacji: ' + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // Cloud Restore Handlers (Replace vs Merge)
  const handleRestoreReplace = async () => {
    if (!remoteBackupFound) return;
    const restored = await downloadAndDecryptBackup(remoteBackupFound.id);
    setDbState(restored);
    setRemoteBackupFound(null);
  };

  const handleRestoreMerge = async () => {
    if (!remoteBackupFound) return;
    const restored = await downloadAndDecryptBackup(remoteBackupFound.id);
    
    // Merge without duplicates using SHA-256 hash IDs
    const existingIds = new Set(dbState.transactions.map((t) => t.id));
    const mergedTxs = [...dbState.transactions];

    for (const t of restored.transactions) {
      if (!existingIds.has(t.id)) {
        mergedTxs.push(t);
        existingIds.add(t.id);
      }
    }

    setDbState((prev) => ({
      ...prev,
      transactions: mergedTxs,
    }));
    setRemoteBackupFound(null);
  };

  return (
    <AndroidFrame
      isFrameEnabled={isFrameEnabled}
      onToggleFrame={() => {
        const next = !isFrameEnabled;
        setIsFrameEnabled(next);
        localStorage.setItem(FRAME_STORAGE_KEY, String(next));
      }}
    >
      {/* Material 3 Top App Bar */}
      <TopAppBar
        currentMonth={selectedMonth}
        availableMonths={availableMonths}
        onMonthChange={setSelectedMonth}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        isSyncing={isSyncing}
        cloudSyncEnabled={dbState.cloudSync.enabled}
        lastSyncDate={dbState.cloudSync.lastSyncDate}
        onTriggerSync={handleTriggerSync}
        onOpenExportReport={() => setIsExportModalOpen(true)}
        isFrameEnabled={isFrameEnabled}
        onToggleFrame={() => setIsFrameEnabled(!isFrameEnabled)}
      />

      {/* Main Tab Screen Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {activeTab === 'dashboard' && (
          <DashboardTab
            transactions={dbState.transactions}
            categories={dbState.categories}
            b2bProfile={dbState.b2bProfile}
            currentMonth={selectedMonth}
            onSelectCategoryFilter={(catName) => {
              setCategoryFilterFromDashboard(catName);
              setActiveTab('transactions');
            }}
            onNavigateToTransactions={() => setActiveTab('transactions')}
            onNavigateToForecast={() => setActiveTab('forecast')}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionsTab
            transactions={dbState.transactions}
            categories={dbState.categories}
            onImportTransactions={handleImportTransactions}
            onUpdateTransaction={handleUpdateTransaction}
            onDeleteTransaction={handleDeleteTransaction}
            onAddTransaction={handleAddTransaction}
            initialCategoryFilter={categoryFilterFromDashboard}
          />
        )}

        {activeTab === 'forecast' && (
          <ForecastTab
            transactions={dbState.transactions}
            categories={dbState.categories}
            b2bProfile={dbState.b2bProfile}
            onUpdateCategories={handleUpdateCategories}
            onImportTransactions={handleImportTransactions}
          />
        )}

        {activeTab === 'rules_b2b' && (
          <RulesAndB2BTab
            b2bProfile={dbState.b2bProfile}
            categories={dbState.categories}
            onUpdateB2BProfile={handleUpdateB2BProfile}
            onUpdateCategories={handleUpdateCategories}
            fullDatabaseState={dbState}
            onRestoreDatabase={(restored) => setDbState(restored)}
            onResetSeedData={handleResetSeedData}
          />
        )}
      </main>

      {/* Material 3 Bottom Navigation Bar */}
      <BottomNavBar
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (tab !== 'transactions') setCategoryFilterFromDashboard(null);
          setActiveTab(tab);
        }}
        alertCount={cadenceAnalysis.alerts.length + cadenceAnalysis.anomalies.length}
        transactionCount={dbState.transactions.length}
      />

      {/* Startup Cloud Restore Prompt Modal */}
      {remoteBackupFound && (
        <CloudRestoreDialog
          backupInfo={remoteBackupFound}
          onRestoreReplace={handleRestoreReplace}
          onRestoreMerge={handleRestoreMerge}
          onDismiss={() => setRemoteBackupFound(null)}
        />
      )}

      {/* Export Report / Share Sheet Modal */}
      <ReportExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        transactions={dbState.transactions}
        categories={dbState.categories}
        b2bProfile={dbState.b2bProfile}
        currentMonth={selectedMonth}
      />
    </AndroidFrame>
  );
}
