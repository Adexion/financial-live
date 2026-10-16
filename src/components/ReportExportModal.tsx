import React, { useState } from 'react';
import { 
  X, 
  Share2, 
  Download, 
  Copy, 
  Check, 
  FileSpreadsheet, 
  FileText, 
  Printer 
} from 'lucide-react';
import type { Transaction, CategoryContract, B2BProfile } from '../domain/types.ts';
import { formatGrosze } from '../domain/types.ts';
import { calculateB2BMonthlySummary } from '../domain/b2bCalculator.ts';
import { calculateCategoryNetTotals } from '../domain/categorizer.ts';

interface ReportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  categories: CategoryContract[];
  b2bProfile: B2BProfile;
  currentMonth: string;
}

export const ReportExportModal: React.FC<ReportExportModalProps> = ({
  isOpen,
  onClose,
  transactions,
  categories,
  b2bProfile,
  currentMonth,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const monthTxs = transactions.filter((t) => t.date.startsWith(currentMonth));
  const b2bSummary = calculateB2BMonthlySummary(transactions, b2bProfile, currentMonth);

  // Categories spending
  const catRows: Array<{ name: string; netGrosze: number; count: number }> = [];
  for (const cat of categories) {
    if (cat.type === 'INTERNAL' || cat.type === 'INCOME') continue;
    const { netSpentGrosze } = calculateCategoryNetTotals(monthTxs, cat.name);
    if (netSpentGrosze > 0) {
      const count = monthTxs.filter((t) => t.category === cat.name && t.amountInGrosze < 0).length;
      catRows.push({ name: cat.name, netGrosze: netSpentGrosze, count });
    }
  }
  catRows.sort((a, b) => b.netGrosze - a.netGrosze);
  const totalSpentGrosze = catRows.reduce((sum, c) => sum + c.netGrosze, 0);

  // Generate plain text summary for clipboard or sharing
  const generateTextSummary = () => {
    let text = `📊 FinGuard - Raport Finansowy (${currentMonth})\n`;
    text += `--------------------------------------\n`;
    text += `💰 Czysty Dochód Domowy: ${formatGrosze(b2bSummary.takeHomeDisposableIncomeGrosze)}\n`;
    text += `🏛️ Rezerwa Podatkowa B2B (VAT+PIT+ZUS): ${formatGrosze(b2bSummary.remainingTaxReserveGrosze)}\n`;
    text += `🛍️ Łączne Wydatki: ${formatGrosze(totalSpentGrosze)}\n\n`;
    text += `Kategorie:\n`;
    for (const r of catRows) {
      text += `• ${r.name}: ${formatGrosze(r.netGrosze)} (${r.count}x)\n`;
    }
    return text;
  };

  // Android Native Share Sheet handler
  const handleNativeShare = async () => {
    const text = generateTextSummary();
    if (navigator.share) {
      try {
        await navigator.share({
          title: `FinGuard Raport - ${currentMonth}`,
          text: text,
        });
      } catch (err) {
        // Dismissed or unsupported
      }
    } else {
      // Fallback to copy
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  // CSV Export download
  const handleDownloadCsv = () => {
    let csv = `Data transakcji;Odbiorca;Tytuł;Kategoria;Kwota w PLN;Koszt Firmowy JDG;Wypłata Bankomat\n`;
    for (const t of monthTxs) {
      const pln = (t.amountInGrosze / 100).toFixed(2).replace('.', ',');
      csv += `"${t.date}";"${t.recipient.replace(/"/g, '""')}";"${t.title.replace(/"/g, '""')}";"${t.category}";"${pln}";"${t.isB2BCost ? 'TAK' : 'NIE'}";"${t.isCashWithdrawal ? 'TAK' : 'NIE'}"\n`;
    }

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FinGuard_Raport_${currentMonth}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Printable HTML Report
  const handlePrintHtml = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    let html = `<!DOCTYPE html>
<html>
<head>
  <title>FinGuard - Raport ${currentMonth}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 30px; color: #1e293b; max-width: 800px; margin: 0 auto; }
    h1 { color: #4338ca; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; font-size: 13px; }
    th, td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
    th { background: #f1f5f9; }
    .kpi { display: flex; gap: 16px; margin: 20px 0; }
    .kpi-card { flex: 1; padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
    .kpi-val { font-size: 18px; font-weight: bold; margin-top: 4px; }
  </style>
</head>
<body>
  <h1>FinGuard - Raport Finansowy</h1>
  <p>Okres: <strong>${currentMonth}</strong> | Wygenerowano: ${new Date().toLocaleDateString('pl-PL')}</p>
  
  <div class="kpi">
    <div class="kpi-card">
      <div>Czysty Dochód Domowy:</div>
      <div class="kpi-val" style="color:#059669">${formatGrosze(b2bSummary.takeHomeDisposableIncomeGrosze)}</div>
    </div>
    <div class="kpi-card">
      <div>Rezerwa Podatkowa B2B:</div>
      <div class="kpi-val" style="color:#2563eb">${formatGrosze(b2bSummary.remainingTaxReserveGrosze)}</div>
    </div>
    <div class="kpi-card">
      <div>Suma Wydatków:</div>
      <div class="kpi-val" style="color:#dc2626">${formatGrosze(totalSpentGrosze)}</div>
    </div>
  </div>

  <h2>Wydatki wg Kategorii</h2>
  <table>
    <thead><tr><th>Kategoria</th><th>Liczba operacji</th><th>Kwota Netto</th></tr></thead>
    <tbody>
      ${catRows.map(r => `<tr><td>${r.name}</td><td>${r.count}</td><td><strong>${formatGrosze(r.netGrosze)}</strong></td></tr>`).join('')}
    </tbody>
  </table>

  <h2>Szczegóły Transakcji (${monthTxs.length})</h2>
  <table>
    <thead><tr><th>Data</th><th>Odbiorca</th><th>Tytuł</th><th>Kategoria</th><th>Kwota</th></tr></thead>
    <tbody>
      ${monthTxs.map(t => `<tr><td>${t.date}</td><td>${t.recipient}</td><td>${t.title}</td><td>${t.category}</td><td>${formatGrosze(t.amountInGrosze, true)}</td></tr>`).join('')}
    </tbody>
  </table>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => printWindow.print(), 250);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-[#1a1c22] rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Eksportuj Raport Finansowy ({currentMonth})
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          {/* Android Share Sheet */}
          <button
            onClick={handleNativeShare}
            className="p-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-colors"
          >
            <Share2 className="w-4 h-4" />
            <span>Udostępnij (Share Sheet)</span>
          </button>

          {/* Download CSV */}
          <button
            onClick={handleDownloadCsv}
            className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
            <span>Pobierz plik CSV</span>
          </button>

          {/* Print / HTML */}
          <button
            onClick={handlePrintHtml}
            className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            <Printer className="w-4 h-4 text-blue-500" />
            <span>Drukuj / PDF (HTML)</span>
          </button>

          {/* Copy to clipboard */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(generateTextSummary());
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            }}
            className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-slate-400" />}
            <span>{copied ? 'Skopiowano!' : 'Kopiuj tekst'}</span>
          </button>
        </div>

        {/* Preview of summary */}
        <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#20232a] border border-slate-200 dark:border-slate-800 font-mono text-[11px] text-slate-600 dark:text-slate-300 max-h-48 overflow-y-auto whitespace-pre-wrap">
          {generateTextSummary()}
        </div>
      </div>
    </div>
  );
};
