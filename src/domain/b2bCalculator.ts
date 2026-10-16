import type { B2BProfile, Transaction } from './types.ts';

export interface B2BSplitResult {
  grossRevenueGrosze: number;
  netRevenueGrosze: number;
  vatOutputGrosze: number;
  pitDueGrosze: number;
  zusDueGrosze: number;
  totalTaxReserveGrosze: number;
  takeHomeDisposableIncomeGrosze: number;
  businessCostsGrosze: number;
  vatInputDeductedGrosze: number;
  taxesPaidToUsZusGrosze: number;
  remainingTaxReserveGrosze: number;
}

export const DEFAULT_B2B_PROFILE: B2BProfile = {
  name: 'Programista B2B (Ryczałt 12%)',
  vatRatePercent: 23,
  pitRatePercent: 12,
  zusFixedGrosze: 160000, // 1600.00 PLN (Duży ZUS z chorobowym)
  taxType: 'RYCZALT_12',
};

/**
 * Calculates monthly B2B breakdown, tax reserves, and business cost deductions
 */
export function calculateB2BMonthlySummary(
  transactions: Transaction[],
  b2bProfile: B2BProfile,
  yearMonth?: string // e.g. "2026-10"
): B2BSplitResult {
  let grossRevenueGrosze = 0;
  let businessCostsGrosze = 0;
  let taxesPaidToUsZusGrosze = 0;

  const filtered = yearMonth 
    ? transactions.filter(t => t.date.startsWith(yearMonth))
    : transactions;

  for (const t of filtered) {
    if (t.isInternalTransfer) continue;

    // Check if tax transfer to ZUS / US
    const text = `${t.recipient} ${t.title}`.toUpperCase();
    const isTaxOfficeOrZus = 
      text.includes('ZAKŁAD UBEZPIECZEŃ SPOŁECZNYCH') || 
      text.includes('ZUS') || 
      text.includes('URZĄD SKARBOWY') || 
      text.includes('URZAD SKARBOWY') || 
      text.includes('FIRST SKARBOWY') ||
      text.includes('PODATEK VAT') ||
      text.includes('PODATEK PIT') ||
      text.includes('MIKRORACHUNEK');

    if (t.amountInGrosze < 0 && isTaxOfficeOrZus) {
      taxesPaidToUsZusGrosze += Math.abs(t.amountInGrosze);
      continue;
    }

    // Revenue
    if (t.amountInGrosze > 0 && (t.category === 'Przychody / B2B' || text.includes('FAKTURA') || text.includes('B2B') || text.includes('KONTRAKT'))) {
      grossRevenueGrosze += t.amountInGrosze;
    }

    // B2B business cost
    if (t.amountInGrosze < 0 && (t.isB2BCost || t.category === 'Koszty Firmowe (JDG)')) {
      businessCostsGrosze += Math.abs(t.amountInGrosze);
    }
  }

  // Calculate Net Revenue from Gross (assuming Gross = Net * (1 + VAT%))
  // Net = Gross / (1 + vatRate/100)
  const vatMultiplier = 1 + (b2bProfile.vatRatePercent / 100);
  const netRevenueGrosze = grossRevenueGrosze > 0 
    ? Math.round(grossRevenueGrosze / vatMultiplier)
    : 0;
  
  const vatOutputGrosze = grossRevenueGrosze - netRevenueGrosze;

  // Calculate VAT input from business costs (e.g. 23% VAT on laptop, software)
  const vatInputDeductedGrosze = businessCostsGrosze > 0
    ? Math.round(businessCostsGrosze - (businessCostsGrosze / vatMultiplier))
    : 0;

  // Net VAT due after deductible business expenses
  const netVatDueGrosze = Math.max(0, vatOutputGrosze - vatInputDeductedGrosze);

  // PIT calculation:
  // If Ryczałt: PIT = netRevenue * pitRate (expenses do not reduce income base, but reduce VAT)
  // If Liniowy 19%: PIT = (netRevenue - businessCostsNet) * 19%
  let pitDueGrosze = 0;
  if (b2bProfile.taxType === 'LINIOWY_19') {
    const netBusinessCosts = businessCostsGrosze - vatInputDeductedGrosze;
    const taxableBase = Math.max(0, netRevenueGrosze - netBusinessCosts);
    pitDueGrosze = Math.round(taxableBase * (b2bProfile.pitRatePercent / 100));
  } else {
    // Ryczałt or default
    pitDueGrosze = Math.round(netRevenueGrosze * (b2bProfile.pitRatePercent / 100));
  }

  // ZUS: apply if revenue exists or default
  const zusDueGrosze = grossRevenueGrosze > 0 ? b2bProfile.zusFixedGrosze : 0;

  // Total Tax Reserve that must be set aside
  const totalTaxReserveGrosze = netVatDueGrosze + pitDueGrosze + zusDueGrosze;

  // Take-home disposable income for household
  // Disposable = Gross - Tax Reserve - Business Costs
  const takeHomeDisposableIncomeGrosze = Math.max(
    0,
    grossRevenueGrosze - totalTaxReserveGrosze - businessCostsGrosze
  );

  // Remaining tax reserve after actual tax transfers
  const remainingTaxReserveGrosze = Math.max(0, totalTaxReserveGrosze - taxesPaidToUsZusGrosze);

  return {
    grossRevenueGrosze,
    netRevenueGrosze,
    vatOutputGrosze: netVatDueGrosze,
    pitDueGrosze,
    zusDueGrosze,
    totalTaxReserveGrosze,
    takeHomeDisposableIncomeGrosze,
    businessCostsGrosze,
    vatInputDeductedGrosze,
    taxesPaidToUsZusGrosze,
    remainingTaxReserveGrosze,
  };
}
