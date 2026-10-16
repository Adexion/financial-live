/**
 * FinGuard - Domain Models & Types
 * All amounts are strictly stored as integer GROSZE (Long in SQLite/Room)
 * 1 PLN = 100 groszy. Avoids floating-point precision errors.
 */

export interface Transaction {
  id: string; // SHA-256 hash of Date + AmountGrosze + Recipient + Saldo
  date: string; // YYYY-MM-DD
  recipient: string;
  title: string;
  amountInGrosze: number; // Negative for expense (-2550 = -25.50 PLN), positive for income (+1200000 = +12,000.00 PLN)
  balanceAfterInGrosze: number | null;
  category: string;
  isInternalTransfer: boolean;
  isFixedCost: boolean;
  isCashWithdrawal: boolean;
  isB2BCost: boolean;
  b2bVatRatePercent?: number; // e.g. 23%
  isRefund?: boolean;
  matchedExpenseId?: string | null; // For Smart Matching with original expense
  isSavingsDeposit?: boolean; // Transfer to/from savings account
  isSavingsInterest?: boolean; // Capitalized interest
  accountType?: 'CHECKING' | 'SAVINGS' | 'DEPOSIT';
  notes?: string;
  receipt?: ReceiptData; // Attached fiscal receipt with itemized breakdown and leakage audit
}

export type ReceiptItemCategory = 
  | 'STAPLES'    // Podstawowe spożywcze (chleb, mleko, jaja, warzywa, mięso, woda)
  | 'SNACKS'     // Przekąski & Słodycze (chipsy, batony, ciastka, żelki, napoje słodzone)
  | 'GOODIES'    // Zachcianki & Dobroci / Impulsowe (alkohol, gadżety, delikatesy premium, pamiątki)
  | 'HOUSEHOLD'  // Chemia & Kosmetyki & Dom (proszki, środki czystości, szampony)
  | 'OTHER';     // Inne pozycje

export interface ReceiptItem {
  id: string;
  name: string;
  priceGrosze: number; // e.g. 849 = 8.49 PLN
  quantity: number; // e.g. 1
  category: ReceiptItemCategory;
  isImpulseOrLeakage?: boolean; // computed: true for SNACKS and GOODIES
}

export interface ReceiptAuditSummary {
  staplesTotalGrosze: number;
  snacksTotalGrosze: number;
  goodiesTotalGrosze: number;
  householdTotalGrosze: number;
  otherTotalGrosze: number;
  totalGrosze: number;
  leakageTotalGrosze: number; // snacks + goodies
  leakagePercent: number; // e.g. 42 (%)
  staplesPercent: number;
}

export interface ReceiptData {
  id: string;
  transactionId?: string;
  storeName: string;
  date: string;
  totalGrosze: number;
  items: ReceiptItem[];
  auditSummary: ReceiptAuditSummary;
  rawText?: string;
  imageUrl?: string;
  uploadedAt: string;
}

export type CategoryType = 
  | 'LIFE_COST' 
  | 'FIXED_COST' 
  | 'B2B_COST' 
  | 'INTERNAL' 
  | 'INCOME' 
  | 'CASH'
  | 'SAVINGS';

export interface CategoryContract {
  id: string;
  name: string;
  icon: string;
  color: string;
  type: CategoryType;
  cadenceDays: number; // e.g. 7 = should occur at most once per 7 days
  maxMonthlyOccurrences: number; // e.g. 4 times/month
  sameDayAsOneEvent: boolean; // Combine multiple transactions on the same date as 1 cadence event
  isAnnualOrRare?: boolean;
  annualDueMonth?: number; // 1-12
  annualEstimatedGrosze?: number;
  customTargetBudgetGrosze?: number; // User-defined target budget amount in grosze (e.g. 150000 = 1500.00 PLN)
}

export interface B2BProfile {
  name: string;
  vatRatePercent: number; // e.g. 23%
  pitRatePercent: number; // e.g. 12% (ryczałt) or 19% (liniowy)
  zusFixedGrosze: number; // e.g. 160000 groszy = 1600.00 PLN
  taxType: 'RYCZALT_12' | 'LINIOWY_19' | 'SKALA_12';
}

export interface IncomeProfile {
  id: string;
  name: string;
  type: 'B2B_JDG' | 'UOP_BENEFIT';
  monthlyBaseGrosze: number;
  b2bConfig?: B2BProfile;
}

export interface CadenceGuardAlert {
  id: string;
  categoryId: string;
  categoryName: string;
  actualIntervalDays: number;
  contractIntervalDays: number;
  actualMonthlyCount: number;
  contractMaxCount: number;
  projectedExcessGrosze: number;
  projectedExcessOccurrences: number;
  severity: 'CRITICAL' | 'WARNING';
  message: string;
  details: string;
}

export interface FinancialAnomaly {
  id: string;
  type: 'DOUBLE_CHARGE' | 'SUBSCRIPTION_SPIKE';
  title: string;
  description: string;
  date: string;
  amountGrosze: number;
  relatedTransactionIds: string[];
}

export interface MonthlyForecast {
  targetMonth: string; // YYYY-MM
  layer1FixedCostsGrosze: number;
  layer1B2BTaxesGrosze: number;
  layer1ZusGrosze: number;
  layer1TotalGrosze: number;
  layer2RareAnnualGrosze: number;
  layer3TrendLifeCostsGrosze: number;
  layer3PlannedLifeCostsGrosze: number;
  totalTrendForecastGrosze: number;
  totalPlannedForecastGrosze: number;
  potentialSavingsGrosze: number;
  upcomingObligations: Array<{
    date: string;
    dayOfMonth: number;
    title: string;
    amountGrosze: number;
    category: string;
    isTax: boolean;
  }>;
}

export interface BackupMetadata {
  version: number;
  createdAt: string;
  deviceInfo: string;
  transactionCount: number;
  checksum: string;
  encrypted: boolean;
}

export interface DatabaseState {
  version: number;
  transactions: Transaction[];
  categories: CategoryContract[];
  b2bProfile: B2BProfile;
  incomeProfiles: IncomeProfile[];
  cloudSync: {
    enabled: boolean;
    lastSyncDate: string | null;
    accountEmail: string | null;
    autoBackup: boolean;
  };
}

// Grosze Formatting & Calculation Utilities
export function formatGrosze(grosze: number, showSign: boolean = false): string {
  const isNegative = grosze < 0;
  const absGrosze = Math.abs(grosze);
  const zloty = Math.floor(absGrosze / 100);
  const remainder = absGrosze % 100;
  const centsStr = remainder.toString().padStart(2, '0');
  
  // Format with polish space thousands separator
  const formattedZloty = zloty.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  
  if (grosze === 0) return '0,00 zł';
  
  if (showSign) {
    return `${isNegative ? '-' : '+'}${formattedZloty},${centsStr} zł`;
  }
  return `${isNegative ? '-' : ''}${formattedZloty},${centsStr} zł`;
}

export function parsePlnToGrosze(plnInput: string | number): number {
  if (typeof plnInput === 'number') {
    return Math.round(plnInput * 100);
  }
  if (!plnInput) return 0;
  // Clean string: replace comma with dot, remove spaces and currency symbols
  const cleaned = plnInput.replace(/\s+/g, '').replace('zł', '').replace('PLN', '').replace(',', '.');
  const parsed = parseFloat(cleaned);
  if (isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}
