import React, { useState } from 'react';
import { 
  Search, 
  Upload, 
  Plus, 
  FileSpreadsheet, 
  CheckCircle2, 
  X, 
  Trash2, 
  Edit3, 
  Link2, 
  FileText,
  Filter,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  ShoppingBag,
  AlertTriangle,
  Sparkles
} from 'lucide-react';
import type { Transaction, CategoryContract } from '../domain/types.ts';
import { formatGrosze, parsePlnToGrosze } from '../domain/types.ts';
import { parseBankCsv, decodeCsvBytes } from '../domain/csvParser.ts';
import { sha256 } from '../domain/sha256.ts';
import { ReceiptAuditModal } from './ReceiptAuditModal.tsx';

interface TransactionsTabProps {
  transactions: Transaction[];
  categories: CategoryContract[];
  onImportTransactions: (newTxs: Transaction[]) => void;
  onUpdateTransaction: (updatedTx: Transaction) => void;
  onDeleteTransaction: (txId: string) => void;
  onAddTransaction: (newTx: Transaction) => void;
  initialCategoryFilter?: string | null;
}

export const TransactionsTab: React.FC<TransactionsTabProps> = ({
  transactions,
  categories,
  onImportTransactions,
  onUpdateTransaction,
  onDeleteTransaction,
  onAddTransaction,
  initialCategoryFilter = null,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>(initialCategoryFilter || 'ALL');
  const [filterType, setFilterType] = useState<string>('ALL');

  // Modals state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [selectedReceiptTx, setSelectedReceiptTx] = useState<Transaction | null>(null);

  // Import state
  const [importSummary, setImportSummary] = useState<{
    total: number;
    imported: number;
    duplicates: number;
  } | null>(null);

  // Global Receipt Audit Statistics
  const receiptTransactions = transactions.filter((t) => t.receipt);
  const totalReceiptsCount = receiptTransactions.length;
  const totalReceiptsSpentGrosze = receiptTransactions.reduce((acc, t) => acc + (t.receipt?.auditSummary.totalGrosze || 0), 0);
  const totalStaplesGrosze = receiptTransactions.reduce((acc, t) => acc + (t.receipt?.auditSummary.staplesTotalGrosze || 0), 0);
  const totalLeakageGrosze = receiptTransactions.reduce((acc, t) => acc + (t.receipt?.auditSummary.leakageTotalGrosze || 0), 0);
  const totalSnacksGrosze = receiptTransactions.reduce((acc, t) => acc + (t.receipt?.auditSummary.snacksTotalGrosze || 0), 0);
  const totalGoodiesGrosze = receiptTransactions.reduce((acc, t) => acc + (t.receipt?.auditSummary.goodiesTotalGrosze || 0), 0);
  const overallLeakagePercent = totalReceiptsSpentGrosze > 0 
    ? Math.round((totalLeakageGrosze / totalReceiptsSpentGrosze) * 100) 
    : 0;

  // Filtered transactions
  const filteredTransactions = transactions.filter((tx) => {
    // Search
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      const match = 
        tx.recipient.toLowerCase().includes(q) ||
        tx.title.toLowerCase().includes(q) ||
        tx.category.toLowerCase().includes(q);
      if (!match) return false;
    }

    // Category
    if (selectedCategory !== 'ALL' && tx.category !== selectedCategory) {
      return false;
    }

    // Filter Type
    if (filterType === 'FIXED' && !tx.isFixedCost) return false;
    if (filterType === 'B2B_COST' && !tx.isB2BCost) return false;
    if (filterType === 'INCOME' && tx.amountInGrosze <= 0) return false;
    if (filterType === 'CASH' && !tx.isCashWithdrawal) return false;
    if (filterType === 'INTERNAL' && !tx.isInternalTransfer) return false;
    if (filterType === 'REFUND' && (!tx.isRefund || tx.isInternalTransfer)) return false;
    if (filterType === 'SAVINGS' && !tx.isSavingsDeposit && !tx.isSavingsInterest && tx.category !== 'Konto Oszczędnościowe & Lokaty') return false;
    if (filterType === 'RECEIPT' && !tx.receipt) return false;
    if (filterType === 'LEAKAGE' && (!tx.receipt || tx.receipt.auditSummary.leakagePercent < 20)) return false;

    return true;
  });

  // Handle CSV file selection
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result;
      if (!buffer) return;

      const bytes = new Uint8Array(buffer as ArrayBuffer);
      const { text, encoding } = decodeCsvBytes(bytes);
      
      const existingIds = new Set(transactions.map((t) => t.id));
      const result = parseBankCsv(text, existingIds);

      if (result.transactions.length > 0) {
        onImportTransactions(result.transactions);
      }

      setImportSummary({
        total: result.totalParsedRows,
        imported: result.newImported,
        duplicates: result.duplicatesSkipped,
      });
    };
    reader.readAsArrayBuffer(file);
  };

  // Sample CSV generator for testing
  const handleLoadSampleCsv = () => {
    const sampleCsv = `Data transakcji;Odbiorca/Nadawca;Tytuł;Kwota;Saldo
2026-10-14;Allegro.pl PayU;Zakup: Klawiatura mechaniczna;-350,00;12500,00
2026-10-15;Apteka Sąsiedzka;Wypłata gotówki przy kasie;-1000,00;11500,00
2026-10-15;Pyszne.pl;Pizza z pieca lunch;-65,00;11435,00
2026-10-16;Biedronka Zabrze;Zakupy codzienne;-112,40;11322,60
2026-10-16;JetBrains s.r.o.;IntelliJ IDEA Ultimate Subscription;-189,00;11133,60`;

    const existingIds = new Set(transactions.map((t) => t.id));
    const result = parseBankCsv(sampleCsv, existingIds);

    if (result.transactions.length > 0) {
      onImportTransactions(result.transactions);
    }

    setImportSummary({
      total: result.totalParsedRows,
      imported: result.newImported,
      duplicates: result.duplicatesSkipped,
    });
  };

  // Sample CSV generator for savings accounts
  const handleLoadSavingsSampleCsv = () => {
    const savingsCsv = `Data transakcji;Odbiorca/Nadawca;Tytuł;Kwota;Saldo
2026-10-01;Konto Oszczędnościowe OKO ING;Wpłata na cel: Poduszka Finansowa;-2000,00;25000,00
2026-10-08;Moje Cele mBank;Automatyczne oszczędzanie po zakupach;-150,00;25150,00
2026-10-15;ING Bank Śląski;Kapitalizacja odsetek - Rachunek Oszczędnościowy;85,40;25235,40
2026-10-16;Lokata Santander 6M;Zakończenie lokaty terminowej + odsetki;5120,00;30355,40`;

    const existingIds = new Set(transactions.map((t) => t.id));
    const result = parseBankCsv(savingsCsv, existingIds);

    if (result.transactions.length > 0) {
      onImportTransactions(result.transactions);
    }

    setImportSummary({
      total: result.totalParsedRows,
      imported: result.newImported,
      duplicates: result.duplicatesSkipped,
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Search & Top Action Bar */}
      <div className="p-3.5 bg-white dark:bg-[#16181d] border-b border-slate-200 dark:border-slate-800 space-y-2.5">
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Szukaj odbiorcy, opisu, kwoty..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-2xl bg-slate-100 dark:bg-[#1e2025] text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              aria-label="Szukaj transakcji"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Import CSV Button */}
          <button
            onClick={() => {
              setImportSummary(null);
              setIsImportModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-300 font-semibold text-xs border border-indigo-200 dark:border-indigo-800/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Import CSV</span>
          </button>

          {/* Add Manual Transaction Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center justify-center p-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors cursor-pointer"
            title="Dodaj transakcję ręcznie"
            aria-label="Dodaj transakcję ręcznie"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
          {[
            { id: 'ALL', label: 'Wszystkie' },
            { id: 'RECEIPT', label: `🧾 Z paragonem (${totalReceiptsCount})` },
            { id: 'LEAKAGE', label: '⚠️ Ucieczka kasy (>20%)' },
            { id: 'SAVINGS', label: 'Oszczędności & Lokaty' },
            { id: 'FIXED', label: 'Koszty Stałe' },
            { id: 'B2B_COST', label: 'Koszty Firmowe (JDG)' },
            { id: 'INCOME', label: 'Przychody' },
            { id: 'CASH', label: 'Bankomaty / BLIK' },
            { id: 'REFUND', label: 'Zwroty' },
            { id: 'INTERNAL', label: 'Przelewy Wewn.' },
          ].map((pill) => (
            <button
              key={pill.id}
              onClick={() => setFilterType(pill.id)}
              className={`px-3 py-1 rounded-full whitespace-nowrap text-[11px] font-medium transition-colors cursor-pointer ${
                filterType === pill.id
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {pill.label}
            </button>
          ))}
        </div>

        {/* Global Receipt Audit Banner */}
        {totalReceiptsCount > 0 && (
          <div className="p-3 rounded-2xl bg-gradient-to-r from-indigo-50/90 via-purple-50/70 to-pink-50/60 dark:from-indigo-950/40 dark:via-purple-950/30 dark:to-pink-950/20 border border-indigo-200/80 dark:border-indigo-800/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 font-extrabold text-indigo-950 dark:text-indigo-200">
                <Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Audyt koszyka: Gdzie uciekają pieniądze w marketach i centrach handlowych?</span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300">
                  {totalReceiptsCount} {totalReceiptsCount === 1 ? 'paragon' : 'paragony'}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                Z paragonów na kwotę <strong>{formatGrosze(totalReceiptsSpentGrosze)}</strong> aż <strong className="text-rose-600 dark:text-rose-400">{formatGrosze(totalLeakageGrosze)} ({overallLeakagePercent}%)</strong> uciekło na przekąski i impulsywne zachcianki ('dobroci') zamiast na podstawowe zakupy spożywcze!
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setFilterType(filterType === 'RECEIPT' ? 'ALL' : 'RECEIPT')}
                className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-colors cursor-pointer border ${
                  filterType === 'RECEIPT'
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white dark:bg-[#1a1c22] text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                }`}
              >
                {filterType === 'RECEIPT' ? 'Pokaż wszystkie' : 'Filtruj paragony'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {filteredTransactions.length === 0 ? (
          <div className="text-center py-12 space-y-2">
            <FileSpreadsheet className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-xs font-semibold text-slate-500">
              Brak transakcji spełniających kryteria wyszukiwania
            </p>
          </div>
        ) : (
          filteredTransactions.map((tx) => {
            const isIncome = tx.amountInGrosze > 0;
            const categoryDef = categories.find((c) => c.name === tx.category || c.id === tx.category);

            return (
              <div
                key={tx.id}
                onClick={() => setEditingTx(tx)}
                className="p-3 rounded-2xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-700/60 shadow-sm transition-all cursor-pointer flex items-center justify-between gap-3 group"
              >
                {/* Left: Category Icon & Details */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-white font-bold text-xs"
                    style={{ backgroundColor: categoryDef?.color || '#6366F1' }}
                  >
                    {isIncome ? (
                      <ArrowUpRight className="w-5 h-5 text-white" />
                    ) : (
                      <ArrowDownLeft className="w-5 h-5 text-white" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                        {tx.recipient}
                      </h4>
                      {/* Special Badges */}
                      {tx.isCashWithdrawal && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                          Gotówka
                        </span>
                      )}
                      {tx.isSavingsDeposit && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          Oszczędności
                        </span>
                      )}
                      {tx.isSavingsInterest && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-950 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800">
                          Odsetki +
                        </span>
                      )}
                      {tx.isB2BCost && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800">
                          JDG -23%
                        </span>
                      )}
                      {tx.isInternalTransfer && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
                          Wewnętrzny
                        </span>
                      )}
                      {tx.matchedExpenseId && (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center gap-0.5">
                          <Link2 className="w-2.5 h-2.5" />
                          <span>Smart Zwrot</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 truncate max-w-[220px]">
                      {tx.title || tx.category}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                      <span>{tx.date}</span>
                      <span>•</span>
                      <span className="font-medium text-slate-600 dark:text-slate-300">
                        {tx.category}
                      </span>
                    </div>

                    {/* Attached Receipt Pill & Leakage Indicator */}
                    {tx.receipt ? (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedReceiptTx(tx);
                          }}
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border shadow-2xs ${
                            tx.receipt.auditSummary.leakagePercent > 35
                              ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-100'
                              : tx.receipt.auditSummary.leakagePercent > 15
                              ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-100'
                              : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                          }`}
                          title="Kliknij, aby otworzyć szczegółowy audyt paragonu i ucieczki kasy"
                        >
                          <Receipt className="w-3 h-3" />
                          <span>
                            Paragon ({tx.receipt.items.length} poz.) • {tx.receipt.auditSummary.leakagePercent}% zachcianki ({formatGrosze(tx.receipt.auditSummary.leakageTotalGrosze)})
                          </span>
                        </button>
                      </div>
                    ) : (
                      tx.amountInGrosze < 0 && !tx.isInternalTransfer && (
                        <div className="mt-1.5 flex items-center">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedReceiptTx(tx);
                            }}
                            className="px-2 py-0.5 rounded-md text-[9px] font-semibold text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 bg-slate-100 hover:bg-indigo-50 dark:bg-slate-800/70 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-800 flex items-center gap-1 transition-colors cursor-pointer"
                            title="Podciągnij paragon fiskalny pod tę transakcję"
                          >
                            <Receipt className="w-2.5 h-2.5 text-indigo-500" />
                            <span>+ Podepnij paragon</span>
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {/* Right: Amount in grosze formatted */}
                <div className="text-right shrink-0">
                  <div
                    className={`text-xs font-bold ${
                      isIncome
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : tx.isInternalTransfer
                        ? 'text-slate-400 dark:text-slate-500'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {formatGrosze(tx.amountInGrosze, true)}
                  </div>
                  {tx.balanceAfterInGrosze !== null && (
                    <div className="text-[10px] text-slate-400">
                      Saldo: {formatGrosze(tx.balanceAfterInGrosze)}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* CSV IMPORT MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#1a1c22] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Import wyciągu bankowego CSV
                </h3>
              </div>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl border-2 border-dashed border-indigo-300 dark:border-indigo-800/80 bg-indigo-50/40 dark:bg-indigo-950/20 text-center space-y-3">
              <Upload className="w-8 h-8 text-indigo-500 mx-auto" />
              <div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Wybierz plik CSV z pamięci urządzenia
                </p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Obsługa UTF-8 i Windows-1250, separator średnik lub przecinek.
                  <br />
                  <strong className="text-indigo-600 dark:text-indigo-400">
                    Deduplikacja SHA-256 chroni przed podwójnym importem!
                  </strong>
                </p>
              </div>

              <label className="inline-block px-4 py-2 rounded-2xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 cursor-pointer shadow-sm">
                <span>Wybierz plik z telefonu / dysku</span>
                <input
                  type="file"
                  accept=".csv,text/csv,text/plain"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* Quick Sample Demo Buttons */}
            <div className="pt-1 space-y-2">
              <button
                onClick={handleLoadSampleCsv}
                className="w-full py-2.5 px-3 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-indigo-500" />
                <span>Załaduj przykładowy wyciąg z konta bieżącego CSV</span>
              </button>

              <button
                onClick={handleLoadSavingsSampleCsv}
                className="w-full py-2.5 px-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-800/60 text-xs font-semibold hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span>Załaduj wyciąg z Konta Oszczędnościowego (OKO / Cele / Lokaty)</span>
              </button>
            </div>

            {/* Import Summary */}
            {importSummary && (
              <div className="p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 space-y-1.5">
                <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Wynik importu i deduplikacji</span>
                </div>
                <div className="text-[11px] text-emerald-900 dark:text-emerald-200 space-y-0.5">
                  <p>Przeanalizowano wierszy: <strong>{importSummary.total}</strong></p>
                  <p>Nowe transakcje: <strong className="text-emerald-600 dark:text-emerald-400">+{importSummary.imported}</strong></p>
                  <p>Pominięte duplikaty (SHA-256): <strong className="text-slate-500">{importSummary.duplicates}</strong></p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EDIT / CATEGORY CHANGE MODAL */}
      {editingTx && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#1a1c22] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Szczegóły transakcji
              </h3>
              <button
                onClick={() => setEditingTx(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">{editingTx.recipient}</h4>
              <p className="text-xs text-slate-500">{editingTx.title || 'Brak tytułu'}</p>
              <div className="text-base font-extrabold text-slate-900 dark:text-white pt-1">
                {formatGrosze(editingTx.amountInGrosze, true)}
              </div>
            </div>

            {/* Category Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                Kategoria wydatku
              </label>
              <select
                value={editingTx.category}
                onChange={(e) => setEditingTx({ ...editingTx, category: e.target.value })}
                className="w-full p-2.5 rounded-2xl bg-slate-100 dark:bg-[#23262d] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* B2B JDG Cost Toggle */}
            <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
              <div>
                <span className="text-xs font-semibold text-slate-900 dark:text-white block">
                  Koszt Firmowy (JDG)
                </span>
                <span className="text-[10px] text-slate-500">
                  Odlicza VAT i obniża Rezerwę Podatkową
                </span>
              </div>
              <input
                type="checkbox"
                checked={editingTx.isB2BCost}
                onChange={(e) => setEditingTx({ ...editingTx, isB2BCost: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 cursor-pointer"
              />
            </div>

            {/* Attached Receipt Section inside Edit Modal */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    Paragon fiskalny & Skład koszyka
                  </span>
                </div>
                {editingTx.receipt && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    editingTx.receipt.auditSummary.leakagePercent > 35
                      ? 'bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                      : 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                  }`}>
                    Ucieczka: {editingTx.receipt.auditSummary.leakagePercent}%
                  </span>
                )}
              </div>

              {editingTx.receipt ? (
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <p className="text-[11px]">
                    Podpięty paragon: <strong>{editingTx.receipt.storeName}</strong> ({editingTx.receipt.items.length} pozycji, suma: {formatGrosze(editingTx.receipt.auditSummary.totalGrosze)}).
                  </p>
                  <div className="flex items-center gap-2 text-[10px] flex-wrap">
                    <span className="text-emerald-600 font-bold">Baza: {formatGrosze(editingTx.receipt.auditSummary.staplesTotalGrosze)}</span>
                    <span>•</span>
                    <span className="text-rose-600 font-bold">Przekąski & Zachcianki: {formatGrosze(editingTx.receipt.auditSummary.leakageTotalGrosze)}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedReceiptTx(editingTx);
                      setEditingTx(null);
                    }}
                    className="w-full mt-1 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-bold text-xs hover:bg-indigo-100 dark:hover:bg-indigo-900/40 cursor-pointer text-center"
                  >
                    Otwórz pełny audyt paragonu
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500">
                    Brak podpiętego paragonu
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedReceiptTx(editingTx);
                      setEditingTx(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer shadow-xs"
                  >
                    + Podepnij paragon
                  </button>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between pt-2">
              <button
                onClick={() => {
                  onDeleteTransaction(editingTx.id);
                  setEditingTx(null);
                }}
                className="flex items-center gap-1 text-xs text-red-600 hover:text-red-700 font-semibold cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Usuń</span>
              </button>

              <button
                onClick={() => {
                  onUpdateTransaction(editingTx);
                  setEditingTx(null);
                }}
                className="px-4 py-2 rounded-2xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 cursor-pointer"
              >
                Zapisz zmiany
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANUAL TRANSACTION ADD MODAL */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-white dark:bg-[#1a1c22] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Dodaj nową transakcję
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const date = (form.elements.namedItem('date') as HTMLInputElement).value;
                const recipient = (form.elements.namedItem('recipient') as HTMLInputElement).value;
                const title = (form.elements.namedItem('title') as HTMLInputElement).value;
                const amountPln = (form.elements.namedItem('amount') as HTMLInputElement).value;
                const category = (form.elements.namedItem('category') as HTMLSelectElement).value;
                const isExpense = (form.elements.namedItem('isExpense') as HTMLInputElement).checked;
                const isB2b = (form.elements.namedItem('isB2b') as HTMLInputElement).checked;

                const amountInGrosze = parsePlnToGrosze(amountPln) * (isExpense ? -1 : 1);
                const uniqueId = sha256(`${date}|${amountInGrosze}|${recipient.trim().toLowerCase()}|manual`);

                onAddTransaction({
                  id: uniqueId,
                  date,
                  recipient,
                  title,
                  amountInGrosze,
                  balanceAfterInGrosze: null,
                  category,
                  isInternalTransfer: false,
                  isFixedCost: category === 'Koszty Stałe i Abonamenty',
                  isCashWithdrawal: category === 'Wypłata gotówki z bankomatu',
                  isB2BCost: isB2b,
                  b2bVatRatePercent: 23,
                });

                setIsAddModalOpen(false);
              }}
              className="space-y-3"
            >
              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Odbiorca / Nadawca
                </label>
                <input
                  name="recipient"
                  required
                  placeholder="np. Biedronka, Klient B2B, Orlen"
                  className="w-full p-2.5 rounded-2xl bg-slate-100 dark:bg-[#23262d] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Tytuł / Opis
                </label>
                <input
                  name="title"
                  placeholder="np. Zakupy spożywcze, Faktura 10/2026"
                  className="w-full p-2.5 rounded-2xl bg-slate-100 dark:bg-[#23262d] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Kwota w PLN
                  </label>
                  <input
                    name="amount"
                    required
                    type="number"
                    step="0.01"
                    placeholder="np. 150.00"
                    className="w-full p-2.5 rounded-2xl bg-slate-100 dark:bg-[#23262d] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                    Data
                  </label>
                  <input
                    name="date"
                    required
                    type="date"
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    className="w-full p-2.5 rounded-2xl bg-slate-100 dark:bg-[#23262d] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Kategoria
                </label>
                <select
                  name="category"
                  className="w-full p-2.5 rounded-2xl bg-slate-100 dark:bg-[#23262d] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-4 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" name="isExpense" defaultChecked className="rounded text-indigo-600" />
                  <span>Wydatek</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" name="isB2b" className="rounded text-indigo-600" />
                  <span>Koszt Firmowy (JDG)</span>
                </label>
              </div>

              <button
                type="submit"
                className="w-full py-2.5 rounded-2xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 cursor-pointer shadow-md mt-2"
              >
                Dodaj transakcję
              </button>
            </form>
          </div>
        </div>
      )}

      {/* RECEIPT AUDIT & LEAKAGE MODAL */}
      {selectedReceiptTx && (
        <ReceiptAuditModal
          transaction={selectedReceiptTx}
          onClose={() => setSelectedReceiptTx(null)}
          onSaveReceipt={(updatedTx) => {
            onUpdateTransaction(updatedTx);
            setSelectedReceiptTx(null);
          }}
          onRemoveReceipt={(updatedTx) => {
            onUpdateTransaction(updatedTx);
            setSelectedReceiptTx(null);
          }}
        />
      )}
    </div>
  );
};
