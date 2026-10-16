import React, { useState } from 'react';
import { 
  AlertTriangle, 
  TrendingDown, 
  Wallet, 
  Building2, 
  CalendarClock, 
  ShoppingBag, 
  ShieldAlert, 
  ArrowUpRight, 
  ArrowDownRight, 
  HelpCircle,
  CopyCheck,
  CheckCircle2,
  ChevronRight,
  Receipt
} from 'lucide-react';
import type { 
  Transaction, 
  CategoryContract, 
  B2BProfile, 
  CadenceGuardAlert, 
  FinancialAnomaly 
} from '../domain/types.ts';
import { formatGrosze } from '../domain/types.ts';
import { calculateB2BMonthlySummary } from '../domain/b2bCalculator.ts';
import { analyzeCadenceAndAnomalies } from '../domain/cadenceGuard.ts';
import { calculateCategoryNetTotals } from '../domain/categorizer.ts';

interface DashboardTabProps {
  transactions: Transaction[];
  categories: CategoryContract[];
  b2bProfile: B2BProfile;
  currentMonth: string; // YYYY-MM
  onSelectCategoryFilter?: (catId: string) => void;
  onNavigateToTransactions?: () => void;
  onNavigateToForecast?: () => void;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  transactions,
  categories,
  b2bProfile,
  currentMonth,
  onSelectCategoryFilter,
  onNavigateToTransactions,
  onNavigateToForecast,
}) => {
  const [selectedChartSegment, setSelectedChartSegment] = useState<string | null>(null);

  // Filter current month transactions
  const monthTransactions = transactions.filter(t => t.date.startsWith(currentMonth));
  
  // 1. Calculate B2B and Income Breakdown
  const b2bSummary = calculateB2BMonthlySummary(transactions, b2bProfile, currentMonth);

  // 2. Koszty Stałe
  const fixedCostTxs = monthTransactions.filter(t => (t.isFixedCost || t.category === 'Koszty Stałe i Abonamenty') && t.amountInGrosze < 0);
  const totalFixedCostsGrosze = fixedCostTxs.reduce((sum, t) => sum + Math.abs(t.amountInGrosze), 0);

  // 3. Koszty Życia (excluding fixed costs, b2b business costs, internal transfers, and cash withdrawals)
  const lifeCostTxs = monthTransactions.filter(t => 
    t.amountInGrosze < 0 && 
    !t.isInternalTransfer && 
    !t.isFixedCost && 
    !t.isB2BCost && 
    !t.isCashWithdrawal &&
    t.category !== 'Koszty Stałe i Abonamenty' &&
    t.category !== 'Koszty Firmowe (JDG)' &&
    t.category !== 'Wypłata gotówki z bankomatu'
  );
  
  // Refund calculation for net balance
  const refundTxs = monthTransactions.filter(t => t.amountInGrosze > 0 && !t.isInternalTransfer && t.category !== 'Przychody / B2B');
  const totalRefundsGrosze = refundTxs.reduce((sum, t) => sum + t.amountInGrosze, 0);
  const grossLifeCostsGrosze = lifeCostTxs.reduce((sum, t) => sum + Math.abs(t.amountInGrosze), 0);
  const netLifeCostsGrosze = Math.max(0, grossLifeCostsGrosze - totalRefundsGrosze);

  // 4. Cadence Guard Analysis & Anomalies
  const cadenceResult = analyzeCadenceAndAnomalies(transactions, categories);
  const { alerts, anomalies, totalProjectedExcessGrosze } = cadenceResult;

  // 5. Category Breakdown for Donut Chart
  const categorySpendingMap = new Map<string, { totalGrosze: number; color: string; count: number }>();
  for (const cat of categories) {
    if (cat.type === 'INTERNAL' || cat.type === 'INCOME') continue;
    const { netSpentGrosze } = calculateCategoryNetTotals(monthTransactions, cat.name);
    if (netSpentGrosze > 0) {
      const count = monthTransactions.filter(t => t.category === cat.name && t.amountInGrosze < 0).length;
      categorySpendingMap.set(cat.name, {
        totalGrosze: netSpentGrosze,
        color: cat.color,
        count,
      });
    }
  }

  const categorySegments = Array.from(categorySpendingMap.entries())
    .map(([name, data]) => ({ name, ...data }))
    .sort((a, b) => b.totalGrosze - a.totalGrosze);

  const totalChartSpendingGrosze = categorySegments.reduce((sum, s) => sum + s.totalGrosze, 0);

  // 6. Receipt Leakage Insights
  const receiptsWithAudit = monthTransactions.filter((t) => t.receipt);
  const totalLeakedGrosze = receiptsWithAudit.reduce((sum, t) => sum + (t.receipt?.auditSummary.leakageTotalGrosze || 0), 0);
  const totalAuditedGrosze = receiptsWithAudit.reduce((sum, t) => sum + (t.receipt?.auditSummary.totalGrosze || 0), 0);
  const overallLeakagePct = totalAuditedGrosze > 0 ? Math.round((totalLeakedGrosze / totalAuditedGrosze) * 100) : 0;

  // SVG Donut calculation
  let accumulatedAngle = 0;
  const radius = 64;
  const strokeWidth = 24;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {/* CADENCE GUARD: Red Alerts & Financial Anomalies */}
      {(alerts.length > 0 || anomalies.length > 0) && (
        <section aria-labelledby="alerts-heading" className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-600 dark:text-red-400">
              <ShieldAlert className="w-4 h-4 animate-pulse" />
              <span id="alerts-heading">Strażnik Częstotliwości & Anomalie</span>
            </div>
            {totalProjectedExcessGrosze > 0 && (
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-950/80 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                Ucieka: ~{formatGrosze(totalProjectedExcessGrosze)}/msc
              </span>
            )}
          </div>

          {/* Broken Rhythm Alerts */}
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className="p-3.5 rounded-2xl bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/40 dark:to-orange-950/20 border-l-4 border-l-red-500 border border-red-200 dark:border-red-900/60 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-red-500 text-white flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-red-900 dark:text-red-200">
                      {alert.message}
                    </h2>
                    <span className="text-[11px] text-red-700 dark:text-red-300 font-medium">
                      Średni odstęp: <strong className="underline">co {alert.actualIntervalDays} dni</strong> (kontrakt: max raz na {alert.contractIntervalDays} dni)
                    </span>
                  </div>
                </div>
                <span className="text-xs font-bold text-red-600 dark:text-red-400 whitespace-nowrap">
                  +{formatGrosze(alert.projectedExcessGrosze)}
                </span>
              </div>
              <p className="mt-2 text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed bg-white/70 dark:bg-black/30 p-2 rounded-xl">
                {alert.details}
              </p>
            </div>
          ))}

          {/* Anomalies (Double charges / Subscription spikes) */}
          {anomalies.map((anom) => (
            <div
              key={anom.id}
              className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border-l-4 border-l-amber-500 border border-amber-200 dark:border-amber-900/60 flex items-start gap-2.5 shadow-sm"
            >
              <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                <CopyCheck className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-amber-900 dark:text-amber-200 truncate">
                    {anom.title}
                  </h3>
                  <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                    {formatGrosze(anom.amountGrosze)}
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                  {anom.description}
                </p>
              </div>
            </div>
          ))}
        </section>
      )}

      {/* 4 PRIMARY KPI SUMMARY CARDS */}
      <section aria-label="Podsumowanie finansowe miesiąca" className="grid grid-cols-2 gap-2.5">
        {/* 1. Czysty Dochód Domowy Netto */}
        <div className="p-3.5 rounded-3xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/40 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 uppercase tracking-tight">
              Czysty Dochód Domowy
            </span>
            <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-emerald-950 dark:text-emerald-100">
            {formatGrosze(b2bSummary.takeHomeDisposableIncomeGrosze)}
          </div>
          <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1 flex items-center gap-1 font-medium">
            <ArrowUpRight className="w-3 h-3 text-emerald-600" />
            <span>Po podatkach i ZUS</span>
          </div>
        </div>

        {/* 2. Wirtualna Rezerwa Podatkowa (VAT + PIT + ZUS) */}
        <div className="p-3.5 rounded-3xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-800/40 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-blue-800 dark:text-blue-300 uppercase tracking-tight">
              Rezerwa Podatki + ZUS
            </span>
            <Building2 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-blue-950 dark:text-blue-100">
            {formatGrosze(b2bSummary.remainingTaxReserveGrosze)}
          </div>
          <div className="text-[10px] text-blue-700 dark:text-blue-400 mt-1 font-medium truncate">
            VAT: {formatGrosze(b2bSummary.vatOutputGrosze)} | PIT: {formatGrosze(b2bSummary.pitDueGrosze)}
          </div>
        </div>

        {/* 3. Koszty Stałe i Abonamenty */}
        <div className="p-3.5 rounded-3xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-tight">
              Koszty Stałe (Abo)
            </span>
            <CalendarClock className="w-4 h-4 text-slate-500" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-slate-100">
            {formatGrosze(totalFixedCostsGrosze)}
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
            {fixedCostTxs.length} pozycji subskrypcyjnych
          </div>
        </div>

        {/* 4. Koszty Życia Netto */}
        <div className="p-3.5 rounded-3xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-200/80 dark:border-violet-800/40 relative overflow-hidden shadow-sm">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-violet-800 dark:text-violet-300 uppercase tracking-tight">
              Koszty Życia (Netto)
            </span>
            <ShoppingBag className="w-4 h-4 text-violet-600 dark:text-violet-400" />
          </div>
          <div className="text-base sm:text-lg font-extrabold text-violet-950 dark:text-violet-100">
            {formatGrosze(netLifeCostsGrosze)}
          </div>
          <div className="text-[10px] text-violet-700 dark:text-violet-400 mt-1 font-medium">
            {totalRefundsGrosze > 0 ? `Po odliczeniu zwrotów (-${formatGrosze(totalRefundsGrosze)})` : `${lifeCostTxs.length} transakcji`}
          </div>
        </div>
      </section>

      {/* B2B JDG TAX RESERVE DETAILS CARD */}
      <section aria-labelledby="b2b-summary-title" className="p-4 rounded-3xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs">
              JDG
            </div>
            <div>
              <h3 id="b2b-summary-title" className="text-xs font-bold text-slate-900 dark:text-white">
                Rozliczenie B2B & Rezerwy Podatkowej
              </h3>
              <p className="text-[10px] text-slate-500">
                {b2bProfile.name} • VAT {b2bProfile.vatRatePercent}%
              </p>
            </div>
          </div>
          <span className="text-xs font-extrabold text-slate-900 dark:text-white">
            Brutto: {formatGrosze(b2bSummary.grossRevenueGrosze)}
          </span>
        </div>

        {/* Progress bar split */}
        <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
          {b2bSummary.grossRevenueGrosze > 0 && (
            <>
              {/* Disposable */}
              <div 
                style={{ width: `${(b2bSummary.takeHomeDisposableIncomeGrosze / b2bSummary.grossRevenueGrosze) * 100}%` }}
                className="bg-emerald-500 h-full"
                title={`Czysty dochód domowy: ${formatGrosze(b2bSummary.takeHomeDisposableIncomeGrosze)}`}
              />
              {/* VAT */}
              <div 
                style={{ width: `${(b2bSummary.vatOutputGrosze / b2bSummary.grossRevenueGrosze) * 100}%` }}
                className="bg-blue-500 h-full"
                title={`Rezerwa VAT: ${formatGrosze(b2bSummary.vatOutputGrosze)}`}
              />
              {/* PIT */}
              <div 
                style={{ width: `${(b2bSummary.pitDueGrosze / b2bSummary.grossRevenueGrosze) * 100}%` }}
                className="bg-indigo-500 h-full"
                title={`Rezerwa PIT: ${formatGrosze(b2bSummary.pitDueGrosze)}`}
              />
              {/* ZUS */}
              <div 
                style={{ width: `${(b2bSummary.zusDueGrosze / b2bSummary.grossRevenueGrosze) * 100}%` }}
                className="bg-amber-500 h-full"
                title={`ZUS stały: ${formatGrosze(b2bSummary.zusDueGrosze)}`}
              />
            </>
          )}
        </div>

        {/* Details grid */}
        <div className="grid grid-cols-4 gap-2 pt-1 text-[11px]">
          <div className="text-center p-2 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
            <span className="block text-[10px] text-emerald-700 dark:text-emerald-400 font-medium">Na konto domowe</span>
            <strong className="text-emerald-900 dark:text-emerald-200">{formatGrosze(b2bSummary.takeHomeDisposableIncomeGrosze)}</strong>
          </div>
          <div className="text-center p-2 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30">
            <span className="block text-[10px] text-blue-700 dark:text-blue-400 font-medium">Rezerwa VAT</span>
            <strong className="text-blue-900 dark:text-blue-200">{formatGrosze(b2bSummary.vatOutputGrosze)}</strong>
          </div>
          <div className="text-center p-2 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30">
            <span className="block text-[10px] text-indigo-700 dark:text-indigo-400 font-medium">Rezerwa PIT</span>
            <strong className="text-indigo-900 dark:text-indigo-200">{formatGrosze(b2bSummary.pitDueGrosze)}</strong>
          </div>
          <div className="text-center p-2 rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/30">
            <span className="block text-[10px] text-amber-700 dark:text-amber-400 font-medium">ZUS (stały)</span>
            <strong className="text-amber-900 dark:text-amber-200">{formatGrosze(b2bSummary.zusDueGrosze)}</strong>
          </div>
        </div>

        {/* Business costs deduction info */}
        {b2bSummary.businessCostsGrosze > 0 && (
          <div className="p-2.5 rounded-2xl bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800/40 text-[11px] text-cyan-900 dark:text-cyan-200 flex items-center justify-between">
            <span>Koszty firmowe JDG: <strong>{formatGrosze(b2bSummary.businessCostsGrosze)}</strong></span>
            <span className="font-semibold text-cyan-700 dark:text-cyan-300">
              Odliczony VAT: -{formatGrosze(b2bSummary.vatInputDeductedGrosze)}
            </span>
          </div>
        )}
      </section>

      {/* RECEIPT AUDIT / LEAKAGE CALLOUT */}
      {receiptsWithAudit.length > 0 && (
        <div 
          onClick={onNavigateToTransactions}
          className="p-3.5 rounded-3xl bg-gradient-to-r from-amber-50 to-rose-50 dark:from-amber-950/40 dark:to-rose-950/30 border border-amber-200/80 dark:border-amber-900/50 flex items-center justify-between gap-3 shadow-xs cursor-pointer hover:border-amber-300 transition-all"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                  Audyt paragonów: {overallLeakagePct}% koszyka to przekąski i zachcianki!
                </span>
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-100 dark:bg-rose-900 text-rose-700 dark:text-rose-300">
                  Ucieka {formatGrosze(totalLeakedGrosze)}
                </span>
              </div>
              <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                W marketach wydano <strong>{formatGrosze(totalAuditedGrosze)}</strong>, z czego aż <strong>{formatGrosze(totalLeakedGrosze)}</strong> poszło na niepotrzebne 'dobroci' i słodycze zamiast na podstawowe zakupy spożywcze.
              </p>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </div>
      )}

      {/* CATEGORY BREAKDOWN & DONUT CHART */}
      <section aria-labelledby="category-breakdown-heading" className="p-4 rounded-3xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <h3 id="category-breakdown-heading" className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Struktura Wydatków (Koszty Życia i Stałe)
          </h3>
          <span className="text-xs font-extrabold text-slate-800 dark:text-slate-200">
            Suma: {formatGrosze(totalChartSpendingGrosze)}
          </span>
        </div>

        {/* Visual Donut Chart */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6 py-2">
          <div className="relative w-44 h-44 flex items-center justify-center">
            <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90 transform">
              <circle
                cx="80"
                cy="80"
                r={radius}
                fill="transparent"
                stroke="currentColor"
                strokeWidth={strokeWidth}
                className="text-slate-100 dark:text-slate-800"
              />
              {categorySegments.map((segment) => {
                const fraction = segment.totalGrosze / totalChartSpendingGrosze;
                const dashArray = fraction * circumference;
                const dashOffset = -accumulatedAngle;
                accumulatedAngle += dashArray;

                const isSelected = selectedChartSegment === segment.name;

                return (
                  <circle
                    key={segment.name}
                    cx="80"
                    cy="80"
                    r={radius}
                    fill="transparent"
                    stroke={segment.color}
                    strokeWidth={isSelected ? strokeWidth + 4 : strokeWidth}
                    strokeDasharray={`${dashArray} ${circumference - dashArray}`}
                    strokeDashoffset={dashOffset}
                    className="transition-all duration-300 cursor-pointer hover:opacity-90"
                    onClick={() => setSelectedChartSegment(isSelected ? null : segment.name)}
                  />
                );
              })}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-4">
              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-tight">
                {selectedChartSegment || 'Wydatki'}
              </span>
              <span className="text-sm font-extrabold text-slate-900 dark:text-white truncate max-w-[110px]">
                {selectedChartSegment
                  ? formatGrosze(categorySpendingMap.get(selectedChartSegment)?.totalGrosze || 0)
                  : formatGrosze(totalChartSpendingGrosze)}
              </span>
            </div>
          </div>

          {/* Legend and category list */}
          <div className="flex-1 w-full space-y-1.5 max-h-48 overflow-y-auto pr-1">
            {categorySegments.map((seg) => {
              const percent = Math.round((seg.totalGrosze / totalChartSpendingGrosze) * 100);
              const isSelected = selectedChartSegment === seg.name;

              return (
                <button
                  key={seg.name}
                  onClick={() => {
                    setSelectedChartSegment(isSelected ? null : seg.name);
                    if (onSelectCategoryFilter) onSelectCategoryFilter(seg.name);
                  }}
                  className={`w-full flex items-center justify-between p-2 rounded-2xl text-left text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 ring-1 ring-indigo-500'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span 
                      className="w-2.5 h-2.5 rounded-full shrink-0" 
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {seg.name}
                    </span>
                    <span className="text-[10px] text-slate-400">({seg.count}x)</span>
                  </div>
                  <div className="flex items-center gap-2 text-right">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {formatGrosze(seg.totalGrosze)}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 min-w-[28px]">
                      {percent}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* QUICK LINK TO FORECAST & SIMULATOR */}
      <div 
        onClick={onNavigateToForecast}
        className="p-3.5 rounded-3xl bg-gradient-to-r from-indigo-600 to-indigo-800 text-white flex items-center justify-between shadow-md cursor-pointer hover:opacity-95 transition-all"
      >
        <div className="space-y-0.5">
          <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-200">
            Predykcja Następnego Miesiąca
          </div>
          <div className="text-xs font-semibold text-white">
            Porównaj Scenariusz Trendu ze Scenariuszem Planowym
          </div>
        </div>
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
          <ChevronRight className="w-4 h-4 text-white" />
        </div>
      </div>
    </div>
  );
};
