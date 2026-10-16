import type { Transaction, CategoryContract, CadenceGuardAlert, FinancialAnomaly } from './types.ts';
import { formatGrosze } from './types.ts';

export interface CadenceAnalysisResult {
  alerts: CadenceGuardAlert[];
  anomalies: FinancialAnomaly[];
  totalProjectedExcessGrosze: number;
}

/**
 * Cadence Guard Engine: Analyzes purchase frequencies, broken rhythms,
 * budget leaks, double charges, and subscription price spikes.
 */
export function analyzeCadenceAndAnomalies(
  transactions: Transaction[],
  categories: CategoryContract[],
  referenceDateStr?: string // default current date
): CadenceAnalysisResult {
  const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
  const currentYear = refDate.getFullYear();
  const currentMonth = refDate.getMonth(); // 0-indexed
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const dayOfMonth = Math.max(1, refDate.getDate());
  const yearMonthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

  // Filter current month expenses (excluding internal transfers)
  const currentMonthExpenses = transactions.filter(t => 
    t.date.startsWith(yearMonthPrefix) && 
    t.amountInGrosze < 0 && 
    !t.isInternalTransfer
  );

  const alerts: CadenceGuardAlert[] = [];
  let totalProjectedExcessGrosze = 0;

  // 1. Analyze Cadence Contracts per Category
  for (const cat of categories) {
    if (cat.type !== 'LIFE_COST') continue; // Cadence guard monitors living costs
    if (!cat.cadenceDays || cat.cadenceDays <= 0) continue;

    const catTxs = currentMonthExpenses.filter(t => t.category === cat.name || t.category === cat.id);
    if (catTxs.length === 0) continue;

    // Group by date if sameDayAsOneEvent is enabled
    let eventsList: Array<{ date: string; totalGrosze: number }> = [];
    if (cat.sameDayAsOneEvent) {
      const byDate = new Map<string, number>();
      for (const t of catTxs) {
        const existing = byDate.get(t.date) || 0;
        byDate.set(t.date, existing + Math.abs(t.amountInGrosze));
      }
      eventsList = Array.from(byDate.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([date, totalGrosze]) => ({ date, totalGrosze }));
    } else {
      eventsList = catTxs.map(t => ({ date: t.date, totalGrosze: Math.abs(t.amountInGrosze) }));
    }

    const actualCount = eventsList.length;
    if (actualCount === 0) continue;

    const totalCategorySpent = eventsList.reduce((sum, e) => sum + e.totalGrosze, 0);
    const avgEventGrosze = Math.round(totalCategorySpent / actualCount);

    // Calculate actual delta t (average interval in days)
    // If only 1 event, delta t is daysElapsed; if multiple, daysElapsed / actualCount
    const actualIntervalDays = Number((dayOfMonth / actualCount).toFixed(1));

    // Pace projection for entire month
    const projectedMonthEndCount = Math.round((actualCount / dayOfMonth) * daysInMonth);
    const excessOccurrences = Math.max(0, projectedMonthEndCount - cat.maxMonthlyOccurrences);

    // Check if rhythm is broken:
    // Either actual interval is noticeably shorter than target interval (e.g. buying every 2 days instead of 7)
    // or projected count strictly exceeds contract limit
    const isRhythmBroken = 
      (actualCount >= 2 && actualIntervalDays < cat.cadenceDays * 0.75) ||
      excessOccurrences > 0;

    if (isRhythmBroken) {
      const projectedExcessGrosze = excessOccurrences * avgEventGrosze;
      totalProjectedExcessGrosze += projectedExcessGrosze;

      const severity = excessOccurrences >= 2 || actualIntervalDays <= cat.cadenceDays * 0.5 
        ? 'CRITICAL' 
        : 'WARNING';

      alerts.push({
        id: `cadence-alert-${cat.id}`,
        categoryId: cat.id,
        categoryName: cat.name,
        actualIntervalDays,
        contractIntervalDays: cat.cadenceDays,
        actualMonthlyCount: actualCount,
        contractMaxCount: cat.maxMonthlyOccurrences,
        projectedExcessGrosze,
        projectedExcessOccurrences: excessOccurrences,
        severity,
        message: `Złamany rytm w kategorii „${cat.name}”`,
        details: `Kupujesz średnio co ${actualIntervalDays} dni (zamiast planowanych ${cat.cadenceDays} dni). Przy tym tempie do końca miesiąca ucieknie dodatkowo ${formatGrosze(projectedExcessGrosze)} (${excessOccurrences} nadmiarowych wizyt).`,
      });
    }
  }

  // 2. Financial Anomalies: Double Charges & Subscription Spikes
  const anomalies: FinancialAnomaly[] = [];

  // Double charges check: same recipient and same amount within 48h
  const sortedExpenses = [...transactions]
    .filter(t => t.amountInGrosze < 0 && !t.isInternalTransfer)
    .sort((a, b) => a.date.localeCompare(b.date));

  for (let i = 0; i < sortedExpenses.length - 1; i++) {
    const t1 = sortedExpenses[i];
    const t2 = sortedExpenses[i + 1];

    if (
      t1.recipient.trim().toLowerCase() === t2.recipient.trim().toLowerCase() &&
      t1.amountInGrosze === t2.amountInGrosze &&
      t1.id !== t2.id
    ) {
      const d1 = new Date(t1.date).getTime();
      const d2 = new Date(t2.date).getTime();
      const diffHours = Math.abs(d2 - d1) / (1000 * 60 * 60);

      if (diffHours <= 48) {
        anomalies.push({
          id: `anomaly-double-${t1.id}`,
          type: 'DOUBLE_CHARGE',
          title: `Podejrzenie podwójnego obciążenia: ${t1.recipient}`,
          description: `Wykryto dwie identyczne transakcje na kwotę ${formatGrosze(t1.amountInGrosze)} w odstępie poniżej 48h (${t1.date} i ${t2.date}).`,
          date: t2.date,
          amountGrosze: Math.abs(t1.amountInGrosze),
          relatedTransactionIds: [t1.id, t2.id],
        });
      }
    }
  }

  // Subscription spikes check: fixed cost with same recipient having >15% higher price than prior occurrences
  const fixedCostTxs = transactions.filter(t => t.isFixedCost || t.category === 'Koszty Stałe i Abonamenty');
  const groupedByRecipient = new Map<string, Transaction[]>();
  for (const t of fixedCostTxs) {
    const key = t.recipient.trim().toLowerCase();
    const list = groupedByRecipient.get(key) || [];
    list.push(t);
    groupedByRecipient.set(key, list);
  }

  groupedByRecipient.forEach((txList, recipientName) => {
    if (txList.length >= 2) {
      txList.sort((a, b) => a.date.localeCompare(b.date));
      const latest = txList[txList.length - 1];
      const previous = txList[txList.length - 2];

      const latestAmt = Math.abs(latest.amountInGrosze);
      const prevAmt = Math.abs(previous.amountInGrosze);

      if (prevAmt > 0 && latestAmt > prevAmt * 1.15) {
        const percentIncrease = Math.round(((latestAmt - prevAmt) / prevAmt) * 100);
        anomalies.push({
          id: `anomaly-sub-spike-${latest.id}`,
          type: 'SUBSCRIPTION_SPIKE',
          title: `Skok ceny subskrypcji: ${latest.recipient}`,
          description: `Koszt wzrósł o ${percentIncrease}% (z ${formatGrosze(prevAmt)} na ${formatGrosze(latestAmt)}).`,
          date: latest.date,
          amountGrosze: latestAmt - prevAmt,
          relatedTransactionIds: [latest.id, previous.id],
        });
      }
    }
  });

  return {
    alerts,
    anomalies,
    totalProjectedExcessGrosze,
  };
}
