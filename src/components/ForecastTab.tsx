import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  Calendar, 
  Layers, 
  Sparkles, 
  PiggyBank, 
  CalendarDays,
  BarChart3,
  RotateCcw,
  Pencil,
  Coins,
  Check,
  SlidersHorizontal,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  Wallet,
  ArrowUpRight,
  Target
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  Cell
} from 'recharts';
import type { 
  Transaction, 
  CategoryContract, 
  B2BProfile, 
  MonthlyForecast 
} from '../domain/types.ts';
import { formatGrosze, parsePlnToGrosze } from '../domain/types.ts';
import { generateMonthlyForecast, calculateMedian, countWeekendDays } from '../domain/forecasting.ts';
import { parseBankCsv, decodeCsvBytes } from '../domain/csvParser.ts';

interface ForecastTabProps {
  transactions: Transaction[];
  categories: CategoryContract[];
  b2bProfile: B2BProfile;
  onUpdateCategories?: (updatedCategories: CategoryContract[]) => void;
  onImportTransactions?: (newTxs: Transaction[]) => void;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: any[];
  label?: string;
}

const CustomForecastTooltip: React.FC<CustomTooltipProps> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const trendItem = payload.find(p => p.dataKey === 'trendPLN');
    const planItem = payload.find(p => p.dataKey === 'targetPlanPLN');
    const savingsItem = payload.find(p => p.dataKey === 'savingsPLN');

    const trendVal = trendItem ? Number(trendItem.value) : 0;
    const planVal = planItem ? Number(planItem.value) : 0;
    const directSavingsVal = savingsItem ? Number(savingsItem.value) : Math.max(0, trendVal - planVal);
    const savingsPercent = trendVal > 0 ? Math.round((directSavingsVal / trendVal) * 100) : 0;

    return (
      <div className="bg-slate-900/95 text-white p-3.5 rounded-2xl shadow-xl border border-slate-700 text-xs space-y-2 backdrop-blur-md min-w-[240px]">
        <div className="font-extrabold text-slate-200 border-b border-slate-700/80 pb-1 flex justify-between items-center">
          <span>{label}</span>
          <span className="text-[10px] text-slate-400 font-normal">Prognoza</span>
        </div>

        {trendItem && (
          <div className="flex justify-between items-center text-indigo-300">
            <span>Średnia historyczna (Trend):</span>
            <strong className="font-mono">{trendVal.toFixed(2).replace('.', ',')} zł</strong>
          </div>
        )}

        {planItem && (
          <div className="flex justify-between items-center text-emerald-400">
            <span>Twój Deklarowany Plan:</span>
            <strong className="font-mono">{planVal.toFixed(2).replace('.', ',')} zł</strong>
          </div>
        )}

        <div className="flex justify-between items-center text-amber-300 font-bold pt-1 border-t border-slate-800">
          <span>Potencjalna Oszczędność:</span>
          <span className="font-mono text-emerald-300">
            {directSavingsVal > 0 ? `+${directSavingsVal.toFixed(2).replace('.', ',')} zł (-${savingsPercent}%)` : '0,00 zł'}
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export const ForecastTab: React.FC<ForecastTabProps> = ({
  transactions,
  categories,
  b2bProfile,
  onUpdateCategories,
  onImportTransactions,
}) => {
  const forecast: MonthlyForecast = generateMonthlyForecast(transactions, categories, b2bProfile);

  // Planning mode: 'AMOUNT' (direct PLN input) vs 'FREQUENCY' (slider visits)
  const [planningMode, setPlanningMode] = useState<'AMOUNT' | 'FREQUENCY'>('AMOUNT');
  const [chartViewMode, setChartViewMode] = useState<'COMPARISON' | 'SAVINGS' | 'TOTAL'>('COMPARISON');
  const [savingsImportSuccess, setSavingsImportSuccess] = useState<string | null>(null);

  // Calculate medians for simulator categories
  const categoryMedians = useMemo(() => {
    const map = new Map<string, number>();
    for (const cat of categories) {
      if (cat.type !== 'LIFE_COST') continue;
      const txs = transactions.filter(t => t.category === cat.name && t.amountInGrosze < 0);
      const amounts = txs.map(t => Math.abs(t.amountInGrosze));
      const median = amounts.length > 0 ? calculateMedian(amounts) : 10000; // default 100 zł
      map.set(cat.id, median);
    }
    return map;
  }, [transactions, categories]);

  // Compute trend baseline per category (historical average with weekend correction)
  const categoryTrends = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    let nextYear = now.getFullYear();
    let nextMonth = now.getMonth() + 2;
    if (nextMonth > 12) {
      nextMonth = 1;
      nextYear++;
    }
    const nextWeekends = countWeekendDays(nextYear, nextMonth);
    const weekendMultiplier = 1 + ((nextWeekends - 8) * 0.035);

    for (const cat of categories) {
      if (cat.type !== 'LIFE_COST') continue;
      const txs = transactions.filter(t => t.category === cat.name && t.amountInGrosze < 0);
      const totalSpent = txs.reduce((sum, t) => sum + Math.abs(t.amountInGrosze), 0);
      const median = categoryMedians.get(cat.id) || 10000;
      
      const baseTrend = totalSpent > 0 ? Math.round(totalSpent * 1.1) : (cat.maxMonthlyOccurrences || 4) * median * 1.3;
      map.set(cat.id, Math.round(baseTrend * weekendMultiplier));
    }
    return map;
  }, [transactions, categories, categoryMedians]);

  // User-defined target budget amounts in grosze (cat.id -> grosze)
  const [userDeclaredBudgets, setUserDeclaredBudgets] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const c of categories) {
      if (c.type === 'LIFE_COST') {
        if (c.customTargetBudgetGrosze && c.customTargetBudgetGrosze > 0) {
          initial[c.id] = c.customTargetBudgetGrosze;
        } else {
          // Default: frequency * median
          const median = categoryMedians.get(c.id) || 10000;
          initial[c.id] = (c.maxMonthlyOccurrences || 4) * median;
        }
      }
    }
    return initial;
  });

  // Frequency slider values (cat.id -> count)
  const [simulatorFrequencies, setSimulatorFrequencies] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    for (const c of categories) {
      if (c.type === 'LIFE_COST') {
        const median = categoryMedians.get(c.id) || 10000;
        const currentDeclared = c.customTargetBudgetGrosze || ((c.maxMonthlyOccurrences || 4) * median);
        initial[c.id] = Math.max(0, Math.round(currentDeclared / median));
      }
    }
    return initial;
  });

  // Handle direct PLN amount input change
  const handleAmountChange = (catId: string, plnValueStr: string) => {
    const grosze = parsePlnToGrosze(plnValueStr);
    setUserDeclaredBudgets(prev => ({ ...prev, [catId]: grosze }));

    // Keep frequency in sync: freq = round(grosze / median)
    const median = categoryMedians.get(catId) || 10000;
    const computedFreq = Math.max(0, Math.round(grosze / median));
    setSimulatorFrequencies(prev => ({ ...prev, [catId]: computedFreq }));

    // Persist to categories contract if handler available
    if (onUpdateCategories) {
      const updated = categories.map(c => 
        c.id === catId ? { ...c, customTargetBudgetGrosze: grosze } : c
      );
      onUpdateCategories(updated);
    }
  };

  // Quick preset handlers per category
  const handleSetCategoryToTrend = (catId: string) => {
    const trend = categoryTrends.get(catId) || 100000;
    handleAmountChange(catId, (trend / 100).toFixed(2));
  };

  const handleSetCategoryDiscount = (catId: string, percent: number) => {
    const trend = categoryTrends.get(catId) || 100000;
    const discounted = Math.round(trend * (1 - percent / 100));
    handleAmountChange(catId, (discounted / 100).toFixed(2));
  };

  const handleSetCategoryToCadenceMedian = (catId: string) => {
    const cat = categories.find(c => c.id === catId);
    const median = categoryMedians.get(catId) || 10000;
    const defaultGrosze = (cat?.maxMonthlyOccurrences || 4) * median;
    handleAmountChange(catId, (defaultGrosze / 100).toFixed(2));
  };

  // Handle frequency slider change
  const handleFrequencyChange = (catId: string, count: number) => {
    setSimulatorFrequencies(prev => ({ ...prev, [catId]: count }));

    // Update declared budget based on count * median
    const median = categoryMedians.get(catId) || 10000;
    const newGrosze = count * median;
    setUserDeclaredBudgets(prev => ({ ...prev, [catId]: newGrosze }));

    if (onUpdateCategories) {
      const updated = categories.map(c => 
        c.id === catId ? { ...c, customTargetBudgetGrosze: newGrosze } : c
      );
      onUpdateCategories(updated);
    }
  };

  // Global Presets: Apply 20% cut to all categories
  const handleApply20PercentCut = () => {
    const nextBudgets: Record<string, number> = {};
    const nextFreqs: Record<string, number> = {};

    for (const cat of categories) {
      if (cat.type !== 'LIFE_COST') continue;
      const trend = categoryTrends.get(cat.id) || 100000;
      const reduced = Math.round(trend * 0.8);
      nextBudgets[cat.id] = reduced;

      const median = categoryMedians.get(cat.id) || 10000;
      nextFreqs[cat.id] = Math.max(0, Math.round(reduced / median));
    }

    setUserDeclaredBudgets(nextBudgets);
    setSimulatorFrequencies(nextFreqs);

    if (onUpdateCategories) {
      const updated = categories.map(c => 
        nextBudgets[c.id] !== undefined ? { ...c, customTargetBudgetGrosze: nextBudgets[c.id] } : c
      );
      onUpdateCategories(updated);
    }
  };

  // Global Presets: Reset to median contracts
  const handleResetToMedianContracts = () => {
    const nextBudgets: Record<string, number> = {};
    const nextFreqs: Record<string, number> = {};

    for (const cat of categories) {
      if (cat.type !== 'LIFE_COST') continue;
      const defaultFreq = cat.maxMonthlyOccurrences || 4;
      const median = categoryMedians.get(cat.id) || 10000;
      nextFreqs[cat.id] = defaultFreq;
      nextBudgets[cat.id] = defaultFreq * median;
    }

    setUserDeclaredBudgets(nextBudgets);
    setSimulatorFrequencies(nextFreqs);

    if (onUpdateCategories) {
      const updated = categories.map(c => 
        nextBudgets[c.id] !== undefined ? { ...c, customTargetBudgetGrosze: nextBudgets[c.id] } : c
      );
      onUpdateCategories(updated);
    }
  };

  // Compute total planned/declared life costs
  const totalDeclaredLifeCostsGrosze = useMemo(() => {
    let sum = 0;
    for (const cat of categories) {
      if (cat.type !== 'LIFE_COST') continue;
      sum += userDeclaredBudgets[cat.id] || 0;
    }
    return sum;
  }, [categories, userDeclaredBudgets]);

  const totalDeclaredForecastGrosze = 
    forecast.layer1TotalGrosze + 
    forecast.layer2RareAnnualGrosze + 
    totalDeclaredLifeCostsGrosze;

  const totalDeclaredSavingsVersusTrend = Math.max(0, forecast.totalTrendForecastGrosze - totalDeclaredForecastGrosze);

  // Recharts Data: Category Comparison
  const categoryComparisonChartData = useMemo(() => {
    return categories
      .filter(c => c.type === 'LIFE_COST')
      .map(cat => {
        const trendGrosze = categoryTrends.get(cat.id) || 0;
        const targetPlanGrosze = userDeclaredBudgets[cat.id] || 0;

        const trendPLN = Number((trendGrosze / 100).toFixed(2));
        const targetPlanPLN = Number((targetPlanGrosze / 100).toFixed(2));
        const savingsPLN = Math.max(0, Number(((trendGrosze - targetPlanGrosze) / 100).toFixed(2)));

        return {
          id: cat.id,
          name: cat.name.replace(' i Zakupy', '').replace(' i Dostawa', ''),
          fullName: cat.name,
          trendPLN,
          targetPlanPLN,
          savingsPLN,
          color: cat.color,
        };
      });
  }, [categories, categoryTrends, userDeclaredBudgets]);

  // Recharts Data: Savings Only Breakdown (sorted descending by savings)
  const savingsOnlyChartData = useMemo(() => {
    return [...categoryComparisonChartData].sort((a, b) => b.savingsPLN - a.savingsPLN);
  }, [categoryComparisonChartData]);

  // Recharts Data: Total Summary
  const totalSummaryChartData = useMemo(() => {
    const trendTotalPLN = Number((forecast.totalTrendForecastGrosze / 100).toFixed(2));
    const targetPlanTotalPLN = Number((totalDeclaredForecastGrosze / 100).toFixed(2));
    const totalSavingsPLN = Math.max(0, Number((totalDeclaredSavingsVersusTrend / 100).toFixed(2)));

    return [
      {
        name: 'Wydatki Miesiąca',
        trendPLN: trendTotalPLN,
        targetPlanPLN: targetPlanTotalPLN,
        savingsPLN: totalSavingsPLN,
      },
    ];
  }, [forecast.totalTrendForecastGrosze, totalDeclaredForecastGrosze, totalDeclaredSavingsVersusTrend]);

  // Savings Accounts (Wyciągi z kont oszczędnościowych) calculations
  const savingsStats = useMemo(() => {
    let depositGrosze = 0;
    let interestGrosze = 0;
    let savingsTxCount = 0;

    for (const tx of transactions) {
      if (tx.isSavingsDeposit || (tx.category === 'Konto Oszczędnościowe & Lokaty' && tx.amountInGrosze < 0)) {
        depositGrosze += Math.abs(tx.amountInGrosze);
        savingsTxCount++;
      } else if (tx.isSavingsInterest || (tx.category === 'Konto Oszczędnościowe & Lokaty' && tx.amountInGrosze > 0)) {
        interestGrosze += Math.abs(tx.amountInGrosze);
        savingsTxCount++;
      }
    }

    const totalSavedFromStatements = depositGrosze + interestGrosze;
    const projectedCombinedGrowth = totalSavedFromStatements + totalDeclaredSavingsVersusTrend;

    return {
      depositGrosze,
      interestGrosze,
      totalSavedFromStatements,
      projectedCombinedGrowth,
      savingsTxCount,
    };
  }, [transactions, totalDeclaredSavingsVersusTrend]);

  // Handle direct Savings Statement CSV upload
  const handleSavingsCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImportTransactions) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result;
      if (!buffer) return;

      const bytes = new Uint8Array(buffer as ArrayBuffer);
      const { text } = decodeCsvBytes(bytes);
      
      const existingIds = new Set(transactions.map((t) => t.id));
      const result = parseBankCsv(text, existingIds);

      if (result.transactions.length > 0) {
        onImportTransactions(result.transactions);
        setSavingsImportSuccess(`Wczytano ${result.newImported} operacji z wyciągu oszczędnościowego!`);
      } else {
        setSavingsImportSuccess('Wszystkie pozycje z tego wyciągu już istnieją w bazie (deduplikacja SHA-256).');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Sample Savings Statement Quick Loader
  const handleLoadSampleSavingsStatement = () => {
    if (!onImportTransactions) return;
    const sampleSavingsCsv = `Data transakcji;Odbiorca/Nadawca;Tytuł;Kwota;Saldo
2026-10-01;Konto Oszczędnościowe OKO ING;Wpłata na cel: Poduszka Finansowa;-2500,00;28000,00
2026-10-08;Moje Cele mBank;Automatyczne oszczędzanie po zakupach;-250,00;28250,00
2026-10-15;ING Bank Śląski;Kapitalizacja odsetek - Rachunek Oszczędnościowy;115,20;28365,20
2026-10-16;Lokata Santander 6M;Zakończenie lokaty terminowej z zyskiem;5240,00;33605,20`;

    const existingIds = new Set(transactions.map((t) => t.id));
    const result = parseBankCsv(sampleSavingsCsv, existingIds);

    if (result.transactions.length > 0) {
      onImportTransactions(result.transactions);
      setSavingsImportSuccess(`Wczytano przykładowy wyciąg: +${result.newImported} transakcji oszczędnościowych!`);
    } else {
      setSavingsImportSuccess('Przykładowy wyciąg oszczędnościowy został już wcześniej dodany.');
    }
  };

  const formatTargetMonth = (ym: string) => {
    const [year, month] = ym.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
  };

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {/* Target Month Header Banner */}
      <div className="p-4 rounded-3xl bg-gradient-to-r from-indigo-900 via-indigo-950 to-slate-900 text-white shadow-md border border-indigo-800/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-300">
              Silnik Predykcji Finansowej
            </span>
          </div>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-800/70 text-indigo-200">
            {formatTargetMonth(forecast.targetMonth)}
          </span>
        </div>
        <h2 className="text-sm sm:text-base font-extrabold text-white">
          Prognoza wydatków i symulator oszczędności
        </h2>
        <p className="text-[11px] text-slate-300 leading-relaxed">
          Aplikacja wylicza <strong>średnią historyczną (trend)</strong>, ale pozwala Ci <strong>wpisać przewidywane kwoty</strong> na konkretne kategorie, aby zaplanować dokładnie tyle, ile faktycznie chcesz przeznaczyć.
        </p>
      </div>

      {/* SUMMARY COMPARISON METRIC CARDS */}
      <section aria-label="Podsumowanie scenariuszy" className="grid grid-cols-2 gap-2.5">
        {/* Scenariusz Trendu (Ze średniej historycznej) */}
        <div className="p-3.5 rounded-3xl bg-slate-50 dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-tight text-slate-500">
              Średnia z Historii (Trend)
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-indigo-400" />
          </div>
          <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white font-mono">
            {formatGrosze(forecast.totalTrendForecastGrosze)}
          </div>
          <p className="text-[10px] text-slate-500 leading-tight">
            Tyle wydasz, jeśli utrzymasz obecne tempo zakupów.
          </p>
        </div>

        {/* Twój Budżet Docelowy (Wpisany przez Ciebie / po symulatorze) */}
        <div className="p-3.5 rounded-3xl bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800/60 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-tight text-emerald-800 dark:text-emerald-300">
              Twój Plan / Budżet
            </span>
            <PiggyBank className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-base sm:text-lg font-black text-emerald-950 dark:text-emerald-100 font-mono">
            {formatGrosze(totalDeclaredForecastGrosze)}
          </div>
          <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 leading-tight">
            {totalDeclaredSavingsVersusTrend > 0
              ? `Oszczędzasz: +${formatGrosze(totalDeclaredSavingsVersusTrend)}`
              : 'Kwota równa lub wyższa od średniej'}
          </div>
        </div>
      </section>

      {/* RECHARTS COMPARATIVE VISUALIZATION: TREND VS USER TARGET BUDGET */}
      <section aria-labelledby="recharts-comparison-heading" className="p-4 rounded-3xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 id="recharts-comparison-heading" className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Wykres Porównawczy (Recharts)
              </h3>
              <p className="text-[10px] text-slate-500">
                Wizualizacja: Średnia historyczna (Trend) vs Twój deklarowany budżet i oszczędności
              </p>
            </div>
          </div>

          {/* Chart View Mode Switcher */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-[10px] font-bold">
            <button
              onClick={() => setChartViewMode('COMPARISON')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                chartViewMode === 'COMPARISON'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Trend vs Plan
            </button>
            <button
              onClick={() => setChartViewMode('SAVINGS')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                chartViewMode === 'SAVINGS'
                  ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-300 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Tylko Oszczędności
            </button>
            <button
              onClick={() => setChartViewMode('TOTAL')}
              className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                chartViewMode === 'TOTAL'
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Suma
            </button>
          </div>
        </div>

        {/* Visual Chart Container */}
        <div className="w-full h-64 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            {chartViewMode === 'COMPARISON' ? (
              <BarChart
                data={categoryComparisonChartData}
                margin={{ top: 10, right: 10, left: -15, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: '#888888' }} 
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#888888' }}
                  tickFormatter={(v) => `${v} zł`}
                />
                <Tooltip content={<CustomForecastTooltip />} />
                <Legend 
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  formatter={(val) => {
                    if (val === 'trendPLN') return <span className="text-slate-700 dark:text-slate-300 font-medium">Średnia Historyczna (Trend)</span>;
                    if (val === 'targetPlanPLN') return <span className="text-emerald-600 dark:text-emerald-400 font-bold">Twój Plan / Budżet</span>;
                    return val;
                  }}
                />
                <Bar 
                  dataKey="trendPLN" 
                  name="trendPLN" 
                  fill="#6366F1" 
                  radius={[6, 6, 0, 0]} 
                  maxBarSize={32}
                />
                <Bar 
                  dataKey="targetPlanPLN" 
                  name="targetPlanPLN" 
                  fill="#10B981" 
                  radius={[6, 6, 0, 0]} 
                  maxBarSize={32}
                />
              </BarChart>
            ) : chartViewMode === 'SAVINGS' ? (
              <BarChart
                data={savingsOnlyChartData}
                margin={{ top: 10, right: 10, left: -15, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: '#888888' }} 
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#888888' }}
                  tickFormatter={(v) => `${v} zł`}
                />
                <Tooltip content={<CustomForecastTooltip />} />
                <Legend 
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  formatter={() => (
                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                      Zaoszczędzona Kwota w Przyszłym Miesiącu (PLN)
                    </span>
                  )}
                />
                <Bar 
                  dataKey="savingsPLN" 
                  name="savingsPLN" 
                  fill="#059669" 
                  radius={[6, 6, 0, 0]} 
                  maxBarSize={38}
                >
                  {savingsOnlyChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.savingsPLN > 0 ? '#10B981' : '#94A3B8'} />
                  ))}
                </Bar>
              </BarChart>
            ) : (
              <BarChart
                data={totalSummaryChartData}
                margin={{ top: 10, right: 20, left: 0, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#888888' }} />
                <YAxis 
                  tick={{ fontSize: 10, fill: '#888888' }}
                  tickFormatter={(v) => `${v} zł`}
                />
                <Tooltip content={<CustomForecastTooltip />} />
                <Legend 
                  wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }}
                  formatter={(val) => {
                    if (val === 'trendPLN') return <span className="text-slate-700 dark:text-slate-300 font-medium">Średnia Łączna (Trend)</span>;
                    if (val === 'targetPlanPLN') return <span className="text-emerald-600 dark:text-emerald-400 font-bold">Twój Plan Łączny</span>;
                    if (val === 'savingsPLN') return <span className="text-amber-500 font-bold">Zaoszczędzisz</span>;
                    return val;
                  }}
                />
                <Bar dataKey="trendPLN" name="trendPLN" fill="#6366F1" radius={[8, 8, 0, 0]} maxBarSize={48} />
                <Bar dataKey="targetPlanPLN" name="targetPlanPLN" fill="#10B981" radius={[8, 8, 0, 0]} maxBarSize={48} />
                <Bar dataKey="savingsPLN" name="savingsPLN" fill="#F59E0B" radius={[8, 8, 0, 0]} maxBarSize={48} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>

        {/* Live Delta Savings Highlight Banner */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-emerald-950/20 border border-emerald-300 dark:border-emerald-800/60 flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 dark:text-emerald-300 block">
              Zaoszczędzisz względem średniej historycznej
            </span>
            <div className="text-base sm:text-lg font-black text-emerald-950 dark:text-emerald-100 font-mono">
              +{formatGrosze(totalDeclaredSavingsVersusTrend)}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handleApply20PercentCut}
              className="px-2.5 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold border border-indigo-200 dark:border-indigo-800 cursor-pointer hover:bg-indigo-100 transition-colors"
              title="Obetnij o 20% względem trendu"
            >
              -20% od trendu
            </button>
            <button
              onClick={handleResetToMedianContracts}
              className="p-1.5 rounded-xl bg-white/80 dark:bg-slate-800/80 hover:bg-white text-slate-700 dark:text-slate-200 text-[11px] font-semibold border border-slate-200 dark:border-slate-700 cursor-pointer transition-colors"
              title="Przywróć kwoty wyliczone z mediany"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </section>

      {/* DEDICATED SECTION: KONTA OSZCZĘDNOŚCIOWE & AKUMULACJA Z WYCIĄGÓW CSV */}
      <section aria-labelledby="savings-accounts-heading" className="p-4 rounded-3xl bg-white dark:bg-[#1a1c22] border border-emerald-200 dark:border-emerald-800/50 shadow-sm space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <h3 id="savings-accounts-heading" className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                <span>Konta Oszczędnościowe & Lokaty</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-bold">
                  Wyciągi CSV
                </span>
              </h3>
              <p className="text-[10px] text-slate-500">
                Wpłaty na cele, kapitalizacja odsetek i transfer zaoszczędzonych środków z planu
              </p>
            </div>
          </div>

          {/* Quick upload / sample action */}
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold hover:bg-emerald-100 transition-colors cursor-pointer">
              <Upload className="w-3 h-3" />
              <span>Wgraj wyciąg CSV</span>
              <input
                type="file"
                accept=".csv,text/csv,text/plain"
                onChange={handleSavingsCsvUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={handleLoadSampleSavingsStatement}
              className="p-1 px-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-[10px] font-semibold border border-slate-200 dark:border-slate-700 cursor-pointer"
              title="Załaduj przykładowy wyciąg oszczędnościowy"
            >
              Próbka
            </button>
          </div>
        </div>

        {savingsImportSuccess && (
          <div className="p-2.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 text-[11px] flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{savingsImportSuccess}</span>
          </div>
        )}

        {/* Savings Grid Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          {/* Card 1: Wpłaty z wyciągów */}
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#20232a] border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] text-slate-500 font-semibold uppercase">
              Wpłaty na Oszczędności (z CSV)
            </div>
            <div className="text-sm font-black text-slate-900 dark:text-white font-mono mt-0.5">
              +{formatGrosze(savingsStats.depositGrosze)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Przelewy na OKO, Moje Cele, Lokaty
            </div>
          </div>

          {/* Card 2: Skapitalizowane Odsetki */}
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#20232a] border border-slate-200 dark:border-slate-800">
            <div className="text-[10px] text-teal-600 dark:text-teal-400 font-semibold uppercase">
              Odsetki Bankowe (Zysk)
            </div>
            <div className="text-sm font-black text-teal-700 dark:text-teal-300 font-mono mt-0.5">
              +{formatGrosze(savingsStats.interestGrosze)}
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              Kapitalizacja odsetek z lokat i kont
            </div>
          </div>

          {/* Card 3: Prognozowany Przyrost z Twojego Planu */}
          <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <div className="text-[10px] text-emerald-800 dark:text-emerald-300 font-bold uppercase">
              Prognozowany Wzrost Oszczędności
            </div>
            <div className="text-sm font-black text-emerald-700 dark:text-emerald-400 font-mono mt-0.5">
              +{formatGrosze(savingsStats.projectedCombinedGrowth)}
            </div>
            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
              Bieżące wpłaty + Zaoszczędzone z planu
            </div>
          </div>
        </div>
      </section>

      {/* DEKLARACJA BUDŻETU: WPISYWANIE KWOT ORAZ SUWAKI CZĘSTOTLIWOŚCI */}
      <section aria-labelledby="custom-budget-heading" className="p-4 rounded-3xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3.5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <div>
              <h3 id="custom-budget-heading" className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                Ile faktycznie chcesz przeznaczyć na dany cel?
              </h3>
              <p className="text-[10px] text-slate-500">
                Średnia wylicza tempo, a Ty decydujesz o ostatecznej kwocie
              </p>
            </div>
          </div>

          {/* Mode Switch: Tryb Kwotowy vs Tryb Częstotliwości */}
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl text-[10px] font-bold">
            <button
              onClick={() => setPlanningMode('AMOUNT')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                planningMode === 'AMOUNT'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <Pencil className="w-3 h-3" />
              <span>Wpisz Kwoty (PLN)</span>
            </button>
            <button
              onClick={() => setPlanningMode('FREQUENCY')}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                planningMode === 'FREQUENCY'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <SlidersHorizontal className="w-3 h-3" />
              <span>Suwaki Wizyt</span>
            </button>
          </div>
        </div>

        {/* List of categories with interactive budget inputs and frequency meters */}
        <div className="space-y-3 pt-1">
          {categories
            .filter((c) => c.type === 'LIFE_COST')
            .map((cat) => {
              const currentGrosze = userDeclaredBudgets[cat.id] ?? 0;
              const currentFreq = simulatorFrequencies[cat.id] ?? (cat.maxMonthlyOccurrences || 4);
              const medianAmt = categoryMedians.get(cat.id) || 10000;
              const trendGrosze = categoryTrends.get(cat.id) || 0;
              const diffGrosze = trendGrosze - currentGrosze;
              const cadenceSuggestedGrosze = (cat.maxMonthlyOccurrences || 4) * medianAmt;

              // Display PLN formatted for input
              const plnValue = (currentGrosze / 100).toFixed(2);
              const equivalentVisits = medianAmt > 0 ? (currentGrosze / medianAmt).toFixed(1) : '0';

              return (
                <div 
                  key={cat.id} 
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#20232a] border border-slate-200 dark:border-slate-800 space-y-2.5 transition-all hover:border-indigo-300 dark:hover:border-indigo-800"
                >
                  {/* Category Header */}
                  <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="font-bold text-slate-900 dark:text-white text-xs">{cat.name}</span>
                    </div>

                    <div className="flex items-center gap-2 text-[10px]">
                      <span className="text-slate-500">
                        Wyliczone ze średniej (Trend): <strong className="text-slate-700 dark:text-slate-200 font-mono">{formatGrosze(trendGrosze)}</strong>
                      </span>
                    </div>
                  </div>

                  {/* Mode 1: Direct Amount Input (PLN) */}
                  {planningMode === 'AMOUNT' ? (
                    <div className="space-y-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase block mb-1">
                            Twoja deklarowana kwota (PLN):
                          </label>
                          <div className="relative">
                            <input
                              type="number"
                              step="10"
                              min="0"
                              value={plnValue}
                              onChange={(e) => handleAmountChange(cat.id, e.target.value)}
                              className="w-full px-3 py-1.5 text-xs font-extrabold rounded-xl bg-white dark:bg-[#16181d] border border-slate-300 dark:border-slate-700 text-emerald-600 dark:text-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                              placeholder="np. 400.00"
                            />
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 pointer-events-none">
                              zł
                            </span>
                          </div>
                        </div>

                        <div className="text-left sm:text-right text-xs">
                          <span className="text-[10px] text-slate-500 block">Odpowiada to:</span>
                          <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            ~{equivalentVisits} wizytom w miesiącu
                          </span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            (mediana {formatGrosze(medianAmt)} / zakup)
                          </span>
                        </div>
                      </div>

                      {/* Quick Adjustment Chips */}
                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5 text-[10px]">
                        <span className="text-slate-400">Szybka korekta:</span>
                        <button
                          onClick={() => handleSetCategoryToTrend(cat.id)}
                          className="px-2 py-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-700/60 hover:bg-slate-300 text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                        >
                          Średnia (Trend)
                        </button>
                        <button
                          onClick={() => handleSetCategoryDiscount(cat.id, 10)}
                          className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-medium cursor-pointer"
                        >
                          -10%
                        </button>
                        <button
                          onClick={() => handleSetCategoryDiscount(cat.id, 20)}
                          className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 text-indigo-700 dark:text-indigo-300 font-medium cursor-pointer"
                        >
                          -20%
                        </button>
                        <button
                          onClick={() => handleSetCategoryToCadenceMedian(cat.id)}
                          className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/70 hover:bg-emerald-100 text-emerald-700 dark:text-emerald-300 font-medium cursor-pointer"
                        >
                          Limit wizyt ({formatGrosze(cadenceSuggestedGrosze)})
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Mode 2: Frequency Slider */
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-[11px] text-slate-500">Liczba wizyt w miesiącu:</span>
                        <div className="text-right">
                          <strong className="text-indigo-600 dark:text-indigo-400">{currentFreq}x</strong>
                          <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 ml-1.5 font-mono">
                            (= {formatGrosze(currentGrosze)})
                          </span>
                        </div>
                      </div>

                      <input
                        type="range"
                        min="0"
                        max="15"
                        step="1"
                        value={currentFreq}
                        onChange={(e) => handleFrequencyChange(cat.id, parseInt(e.target.value))}
                        className="w-full accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg"
                      />

                      <div className="flex justify-between text-[10px] text-slate-400 font-medium">
                        <span>0 wizyt (0 zł)</span>
                        <span>Mediana: {formatGrosze(medianAmt)}</span>
                        <span>15 wizyt</span>
                      </div>
                    </div>
                  )}

                  {/* Savings delta footer per category */}
                  <div className="pt-1.5 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px]">
                    <span className="text-slate-500">
                      Różnica względem średniej historycznej:
                    </span>
                    <strong className={diffGrosze >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-mono' : 'text-amber-500 font-mono'}>
                      {diffGrosze >= 0 ? `+${formatGrosze(diffGrosze)} (Zaoszczędzisz)` : `${formatGrosze(diffGrosze)} (Powyżej trendu)`}
                    </strong>
                  </div>
                </div>
              );
            })}
        </div>

        {/* Real-time Summary Box */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-700 text-white flex items-center justify-between shadow-sm">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">
              Twój Deklarowany Budżet Całkowity
            </span>
            <div className="text-base font-black font-mono">
              {formatGrosze(totalDeclaredForecastGrosze)}
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-emerald-100 font-medium">Zaoszczędzisz vs Średnia:</span>
            <div className="text-sm font-extrabold text-white font-mono">
              +{formatGrosze(totalDeclaredSavingsVersusTrend)}
            </div>
          </div>
        </div>
      </section>

      {/* 4 WARSTWY WYDATKÓW PRZYSZŁEGO MIESIĄCA */}
      <section aria-labelledby="layers-heading" className="p-4 rounded-3xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-500" />
          <h3 id="layers-heading" className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            4 Warstwy Wydatków Przyszłego Miesiąca
          </h3>
        </div>

        <div className="space-y-2 text-xs">
          {/* Layer 1 */}
          <div className="p-3 rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-blue-900 dark:text-blue-200">
                1. Pewne Koszty Stałe + Podatki B2B & ZUS
              </span>
              <strong className="text-blue-950 dark:text-blue-100 font-extrabold font-mono">
                {formatGrosze(forecast.layer1TotalGrosze)}
              </strong>
            </div>
            <div className="text-[11px] text-blue-800 dark:text-blue-300 space-y-0.5">
              <div className="flex justify-between">
                <span>• Abonamenty i rachunki cykliczne:</span>
                <span className="font-mono">{formatGrosze(forecast.layer1FixedCostsGrosze)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Podatki B2B do US (VAT + PIT):</span>
                <span className="font-mono">{formatGrosze(forecast.layer1B2BTaxesGrosze)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Składka ZUS (stała):</span>
                <span className="font-mono">{formatGrosze(forecast.layer1ZusGrosze)}</span>
              </div>
            </div>
          </div>

          {/* Layer 2 */}
          <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-800 dark:text-slate-200">
                2. Wydatki Rzadkie i Roczne
              </span>
              <strong className="text-slate-900 dark:text-slate-100 font-mono">
                {formatGrosze(forecast.layer2RareAnnualGrosze)}
              </strong>
            </div>
            <p className="text-[10px] text-slate-500 mt-0.5">
              Ubezpieczenia OC/AC, podatki od nieruchomości, roczne licencje.
            </p>
          </div>

          {/* Layer 3 */}
          <div className="p-3 rounded-2xl bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/40">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-violet-900 dark:text-violet-200">
                3. Koszty Życia (Średnia Historyczna vs Twój Budżet)
              </span>
            </div>
            <div className="flex justify-between text-[11px] text-violet-800 dark:text-violet-300">
              <span>Trend historyczny (weekend-adjusted):</span>
              <strong className="font-mono">{formatGrosze(forecast.layer3TrendLifeCostsGrosze)}</strong>
            </div>
            <div className="flex justify-between text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold mt-0.5">
              <span>Twój Budżet Docelowy (Własne kwoty):</span>
              <strong className="font-mono">{formatGrosze(totalDeclaredLifeCostsGrosze)}</strong>
            </div>
          </div>
        </div>
      </section>

      {/* KALENDARZ NADCHODZĄCYCH PŁATNOŚCI (ZUS, US, RACHUNKI) */}
      <section aria-labelledby="calendar-heading" className="p-4 rounded-3xl bg-white dark:bg-[#1a1c22] border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-indigo-500" />
          <h3 id="calendar-heading" className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
            Harmonogram Nadchodzących Opłat (Terminarz)
          </h3>
        </div>

        <div className="space-y-2">
          {forecast.upcomingObligations.map((item, idx) => (
            <div
              key={idx}
              className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#20232a] border border-slate-200 dark:border-slate-800/80 flex items-center justify-between text-xs"
            >
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-extrabold flex flex-col items-center justify-center leading-none">
                  <span className="text-[10px] uppercase">Dzień</span>
                  <span className="text-sm">{item.dayOfMonth}</span>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">{item.title}</h4>
                  <span className="text-[10px] text-slate-500">{item.category}</span>
                </div>
              </div>
              <span className="font-extrabold text-slate-900 dark:text-white font-mono">
                {formatGrosze(item.amountGrosze)}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
};
