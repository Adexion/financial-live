import type { Transaction, CategoryContract, MonthlyForecast, B2BProfile } from './types.ts';
import { calculateB2BMonthlySummary } from './b2bCalculator.ts';

/**
 * Counts weekend days (Saturdays and Sundays) in a given year and month (1-12)
 */
export function countWeekendDays(year: number, month1Indexed: number): number {
  const daysInMonth = new Date(year, month1Indexed, 0).getDate();
  let weekends = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month1Indexed - 1, day);
    const dayOfWeek = d.getDay(); // 0 is Sunday, 6 is Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      weekends++;
    }
  }
  return weekends;
}

/**
 * Calculates median of an array of numbers
 */
export function calculateMedian(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  const sorted = [...numbers].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/**
 * Generates 4-layer prediction for the upcoming month
 */
export function generateMonthlyForecast(
  transactions: Transaction[],
  categories: CategoryContract[],
  b2bProfile: B2BProfile,
  referenceDateStr?: string
): MonthlyForecast {
  const refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
  
  // Target next month
  let nextYear = refDate.getFullYear();
  let nextMonth0Indexed = refDate.getMonth() + 1;
  if (nextMonth0Indexed > 11) {
    nextMonth0Indexed = 0;
    nextYear++;
  }
  const nextMonth1Indexed = nextMonth0Indexed + 1;
  const targetMonthStr = `${nextYear}-${String(nextMonth1Indexed).padStart(2, '0')}`;

  // Current month string
  const currentMonthStr = `${refDate.getFullYear()}-${String(refDate.getMonth() + 1).padStart(2, '0')}`;

  // 1. LAYER 1: Certain Fixed Costs + B2B Taxes & ZUS
  // Group fixed costs by recipient to find repeating active subscriptions
  const fixedCostTxs = transactions.filter(t => (t.isFixedCost || t.category === 'Koszty Stałe i Abonamenty') && t.amountInGrosze < 0);
  const latestFixedByRecipient = new Map<string, number>();
  for (const t of fixedCostTxs) {
    const key = t.recipient.trim();
    latestFixedByRecipient.set(key, Math.abs(t.amountInGrosze));
  }
  let layer1FixedCostsGrosze = 0;
  latestFixedByRecipient.forEach(amt => {
    layer1FixedCostsGrosze += amt;
  });

  // Calculate current month's B2B taxes due next month (VAT + PIT + ZUS)
  const b2bCurrentMonth = calculateB2BMonthlySummary(transactions, b2bProfile, currentMonthStr);
  const layer1B2BTaxesGrosze = b2bCurrentMonth.vatOutputGrosze + b2bCurrentMonth.pitDueGrosze;
  const layer1ZusGrosze = b2bCurrentMonth.zusDueGrosze;
  const layer1TotalGrosze = layer1FixedCostsGrosze + layer1B2BTaxesGrosze + layer1ZusGrosze;

  // 2. LAYER 2: Rare / Annual Expenses due next month
  let layer2RareAnnualGrosze = 0;
  for (const cat of categories) {
    if (cat.isAnnualOrRare && cat.annualDueMonth === nextMonth1Indexed && cat.annualEstimatedGrosze) {
      layer2RareAnnualGrosze += cat.annualEstimatedGrosze;
    }
  }

  // 3. LAYER 3: Life Costs in 2 Parallel Scenarios
  // Compute median transaction amount per category from historical life costs
  const lifeCostTxs = transactions.filter(t => 
    t.amountInGrosze < 0 && 
    !t.isInternalTransfer && 
    !t.isFixedCost && 
    !t.isB2BCost &&
    t.category !== 'Koszty Stałe i Abonamenty' &&
    t.category !== 'Koszty Firmowe (JDG)'
  );

  const amountsByCategory = new Map<string, number[]>();
  for (const t of lifeCostTxs) {
    const list = amountsByCategory.get(t.category) || [];
    list.push(Math.abs(t.amountInGrosze));
    amountsByCategory.set(t.category, list);
  }

  // Scenario Planowy: user contract limit * median purchase amount
  let layer3PlannedLifeCostsGrosze = 0;
  for (const cat of categories) {
    if (cat.type !== 'LIFE_COST') continue;
    const catAmounts = amountsByCategory.get(cat.name) || amountsByCategory.get(cat.id) || [];
    const medianAmt = catAmounts.length > 0 ? calculateMedian(catAmounts) : 10000; // default 100 zł
    const plannedCount = cat.maxMonthlyOccurrences || 4;
    layer3PlannedLifeCostsGrosze += (plannedCount * medianAmt);
  }

  // Scenario Trend: weighted historical average adjusted for number of weekends
  // Current month's pace adjusted by weekend ratio
  const nextMonthWeekends = countWeekendDays(nextYear, nextMonth1Indexed);
  const baselineWeekends = 8; // standard 4 weekends = 8 days
  const weekendMultiplier = 1 + ((nextMonthWeekends - baselineWeekends) * 0.035); // each extra weekend day adds ~3.5% leisure spending

  // Sum recent life costs
  const recentMonthSums: number[] = [];
  const currentMonthLifeSum = transactions
    .filter(t => t.date.startsWith(currentMonthStr) && t.amountInGrosze < 0 && !t.isInternalTransfer && !t.isFixedCost && !t.isB2BCost)
    .reduce((sum, t) => sum + Math.abs(t.amountInGrosze), 0);
  
  // Annualize/project full current month
  const dayOfMonth = Math.max(1, refDate.getDate());
  const daysInCurrentMonth = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
  const projectedCurrentMonthLife = Math.round((currentMonthLifeSum / dayOfMonth) * daysInCurrentMonth);
  recentMonthSums.push(projectedCurrentMonthLife);

  const baseTrendLife = recentMonthSums[0] || (layer3PlannedLifeCostsGrosze * 1.2);
  const layer3TrendLifeCostsGrosze = Math.round(baseTrendLife * weekendMultiplier);

  // Totals
  const totalTrendForecastGrosze = layer1TotalGrosze + layer2RareAnnualGrosze + layer3TrendLifeCostsGrosze;
  const totalPlannedForecastGrosze = layer1TotalGrosze + layer2RareAnnualGrosze + layer3PlannedLifeCostsGrosze;
  const potentialSavingsGrosze = Math.max(0, totalTrendForecastGrosze - totalPlannedForecastGrosze);

  // Calendar of upcoming obligations
  const upcomingObligations = [
    {
      date: `${targetMonthStr}-10`,
      dayOfMonth: 10,
      title: 'Składka ZUS (Wirtualna Rezerwa B2B)',
      amountGrosze: layer1ZusGrosze,
      category: 'Podatki i Składki',
      isTax: true,
    },
    {
      date: `${targetMonthStr}-20`,
      dayOfMonth: 20,
      title: 'Zaliczka na podatek dochodowy PIT',
      amountGrosze: b2bCurrentMonth.pitDueGrosze,
      category: 'Podatki i Składki',
      isTax: true,
    },
    {
      date: `${targetMonthStr}-25`,
      dayOfMonth: 25,
      title: 'Podatek VAT (JPK_V7)',
      amountGrosze: b2bCurrentMonth.vatOutputGrosze,
      category: 'Podatki i Składki',
      isTax: true,
    },
    {
      date: `${targetMonthStr}-01`,
      dayOfMonth: 1,
      title: 'Suma abonamentów i kosztów stałych',
      amountGrosze: layer1FixedCostsGrosze,
      category: 'Koszty Stałe i Abonamenty',
      isTax: false,
    },
  ].filter(o => o.amountGrosze > 0).sort((a, b) => a.dayOfMonth - b.dayOfMonth);

  return {
    targetMonth: targetMonthStr,
    layer1FixedCostsGrosze,
    layer1B2BTaxesGrosze,
    layer1ZusGrosze,
    layer1TotalGrosze,
    layer2RareAnnualGrosze,
    layer3TrendLifeCostsGrosze,
    layer3PlannedLifeCostsGrosze,
    totalTrendForecastGrosze,
    totalPlannedForecastGrosze,
    potentialSavingsGrosze,
    upcomingObligations,
  };
}

/**
 * Interactive Cadence Simulator:
 * Computes how much the user saves next month by adjusting frequency sliders.
 */
export function simulateCategoryCadenceSavings(
  categoryName: string,
  newMonthlyFrequency: number,
  contractFrequency: number,
  medianExpenseGrosze: number
): { savedGrosze: number; newTotalGrosze: number } {
  const diffOccurrences = Math.max(0, contractFrequency - newMonthlyFrequency);
  const savedGrosze = diffOccurrences * medianExpenseGrosze;
  const newTotalGrosze = newMonthlyFrequency * medianExpenseGrosze;
  return { savedGrosze, newTotalGrosze };
}
