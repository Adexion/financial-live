import type { Transaction, CategoryContract } from './types.ts';


export interface CategorizationResult {
  category: string;
  isInternalTransfer: boolean;
  isFixedCost: boolean;
  isCashWithdrawal: boolean;
  isB2BCost: boolean;
  isSavingsDeposit?: boolean;
  isSavingsInterest?: boolean;
  ruleMatched: string;
}

// Default initial category definitions with cadence contracts
export const DEFAULT_CATEGORIES: CategoryContract[] = [
  {
    id: 'supermarkety',
    name: 'Supermarkety',
    icon: 'ShoppingCart',
    color: '#10B981', // Emerald
    type: 'LIFE_COST',
    cadenceDays: 4, // Max once every 4 days
    maxMonthlyOccurrences: 8,
    sameDayAsOneEvent: true,
    customTargetBudgetGrosze: 120000, // 1 200.00 zł
  },
  {
    id: 'jedzenie_dostawa',
    name: 'Jedzenie i Dostawa',
    icon: 'UtensilsCrossed',
    color: '#F59E0B', // Amber
    type: 'LIFE_COST',
    cadenceDays: 7, // Max once every 7 days (e.g. weekend dining)
    maxMonthlyOccurrences: 4,
    sameDayAsOneEvent: false,
    customTargetBudgetGrosze: 40000, // 400.00 zł
  },
  {
    id: 'ecommerce',
    name: 'E-commerce i Zakupy',
    icon: 'Package',
    color: '#8B5CF6', // Violet
    type: 'LIFE_COST',
    cadenceDays: 7,
    maxMonthlyOccurrences: 4,
    sameDayAsOneEvent: true,
    customTargetBudgetGrosze: 60000, // 600.00 zł
  },
  {
    id: 'auto_paliwo',
    name: 'Auto i Paliwo',
    icon: 'Fuel',
    color: '#EF4444', // Red
    type: 'LIFE_COST',
    cadenceDays: 14,
    maxMonthlyOccurrences: 2,
    sameDayAsOneEvent: true,
    customTargetBudgetGrosze: 40000, // 400.00 zł
  },
  {
    id: 'drogerie_apteki',
    name: 'Drogerie i Apteki',
    icon: 'HeartPulse',
    color: '#EC4899', // Pink
    type: 'LIFE_COST',
    cadenceDays: 14,
    maxMonthlyOccurrences: 2,
    sameDayAsOneEvent: true,
    customTargetBudgetGrosze: 20000, // 200.00 zł
  },
  {
    id: 'dom_remont',
    name: 'Dom i Remont',
    icon: 'Hammer',
    color: '#6366F1', // Indigo
    type: 'LIFE_COST',
    cadenceDays: 30,
    maxMonthlyOccurrences: 1,
    sameDayAsOneEvent: true,
    customTargetBudgetGrosze: 30000, // 300.00 zł
  },
  {
    id: 'koszty_stale',
    name: 'Koszty Stałe i Abonamenty',
    icon: 'CalendarClock',
    color: '#3B82F6', // Blue
    type: 'FIXED_COST',
    cadenceDays: 30,
    maxMonthlyOccurrences: 15,
    sameDayAsOneEvent: false,
  },
  {
    id: 'koszty_firmowe',
    name: 'Koszty Firmowe (JDG)',
    icon: 'Briefcase',
    color: '#06B6D4', // Cyan
    type: 'B2B_COST',
    cadenceDays: 30,
    maxMonthlyOccurrences: 10,
    sameDayAsOneEvent: false,
  },
  {
    id: 'bankomat_blik',
    name: 'Wypłata gotówki z bankomatu',
    icon: 'Banknote',
    color: '#64748B', // Slate
    type: 'CASH',
    cadenceDays: 14,
    maxMonthlyOccurrences: 2,
    sameDayAsOneEvent: true,
  },
  {
    id: 'przelew_wewnetrzny',
    name: 'Przelew Wewnętrzny',
    icon: 'ArrowLeftRight',
    color: '#94A3B8',
    type: 'INTERNAL',
    cadenceDays: 1,
    maxMonthlyOccurrences: 99,
    sameDayAsOneEvent: true,
  },
  {
    id: 'przychody',
    name: 'Przychody / B2B',
    icon: 'TrendingUp',
    color: '#22C55E',
    type: 'INCOME',
    cadenceDays: 30,
    maxMonthlyOccurrences: 2,
    sameDayAsOneEvent: true,
  },
  {
    id: 'konto_oszczednosciowe',
    name: 'Konto Oszczędnościowe & Lokaty',
    icon: 'PiggyBank',
    color: '#059669',
    type: 'SAVINGS',
    cadenceDays: 30,
    maxMonthlyOccurrences: 10,
    sameDayAsOneEvent: true,
  },
  {
    id: 'inne_wydatki',
    name: 'Inne Wydatki',
    icon: 'MoreHorizontal',
    color: '#A1A1AA',
    type: 'LIFE_COST',
    cadenceDays: 7,
    maxMonthlyOccurrences: 5,
    sameDayAsOneEvent: true,
  },
];

// Fixed costs keywords
const FIXED_COSTS_KEYWORDS = [
  'ING',
  'UNICREDIT',
  'WIESZOWANET',
  'PLUS GSM',
  'PWIK',
  'ZABRZANSKIE PRZEDSIĘBIORSTWO',
  'ZABRZANSKIE PRZEDSIĘBIORSTWO',
  'ZABRZANSKIE PRZEDSIEB',
  'TAURON',
  'URZAD MIEJSKI',
  'URZĄD MIEJSKI',
  'MICROSOFT',
  'YOUTUBE',
  'NETFLIX',
  'DEAGOSTINI',
  'GOOGLE PLAY',
  'UNIQA',
  'BANK MILLENNIUM',
  'TUZ UBEZPIECZENIA',
  'SPOTIFY',
  'DISNEY',
  'HBO',
  'CANAL+',
  'UPC',
  'PLAY',
  'ORANGE',
  'T-MOBILE',
];

// B2B business costs keywords
const B2B_COSTS_KEYWORDS = [
  'JETBRAINS',
  'HOSTING',
  'FAKTUROWNIA',
  'INFAKT',
  'OVH',
  'HETZNER',
  'AWS',
  'GITHUB',
  'GOOGLE CLOUD',
  'KSIEGOWOSC',
  'KSIĘGOWOŚĆ',
  'DIGITALOCEAN',
  'SLACK',
  'ATLASSIAN',
  'JIRA',
  'DOMENA',
];

export function categorizeTransaction(
  recipient: string,
  title: string,
  amountInGrosze: number
): CategorizationResult {
  const combined = `${recipient} ${title}`.toUpperCase();
  const absGrosze = Math.abs(amountInGrosze);

  // 1. Technical Internal Transfers check
  if (
    combined.includes('PRZELEW WŁASNY') ||
    combined.includes('PRZELEW WLASNY') ||
    combined.includes('PRZELEW WEWNĘTRZNY WYCHODZĄCY') ||
    combined.includes('PRZELEW WEWNETRZNY WYCHODZACY') ||
    combined.includes('PRZELEW WEWNĘTRZNY') ||
    combined.includes('PRZELEW WEWNETRZNY')
  ) {
    // Check if transfer is to savings account
    if (
      combined.includes('OSZCZĘDNOŚC') ||
      combined.includes('OSZCZEDNOSC') ||
      combined.includes('OKO') ||
      combined.includes('CEL') ||
      combined.includes('SKARBONKA') ||
      combined.includes('LOKAT')
    ) {
      return {
        category: 'Konto Oszczędnościowe & Lokaty',
        isInternalTransfer: true,
        isFixedCost: false,
        isCashWithdrawal: false,
        isB2BCost: false,
        isSavingsDeposit: true,
        isSavingsInterest: false,
        ruleMatched: 'Oszczędności: Przelew na konto oszczędnościowe / lokatę',
      };
    }

    return {
      category: 'Przelew Wewnętrzny',
      isInternalTransfer: true,
      isFixedCost: false,
      isCashWithdrawal: false,
      isB2BCost: false,
      ruleMatched: 'Reguła: Przelew Wewnętrzny',
    };
  }

  // 1b. Direct Savings Account / Lokaty / Kapitalizacja Odsetek / Wyciągi oszczędnościowe
  if (
    combined.includes('KONTO OSZCZĘDNOŚCIOWE') ||
    combined.includes('KONTO OSZCZEDNOSCIOWE') ||
    combined.includes('OTWARTE KONTO OSZCZĘDNOŚCIOWE') ||
    combined.includes('RACHUNEK OSZCZĘDNOŚCIOWY') ||
    combined.includes('RACHUNEK OSZCZEDNOSCIOWY') ||
    combined.includes('MOJE CELE') ||
    combined.includes('CEL OSZCZĘDNOŚCIOWY') ||
    combined.includes('LOKATA') ||
    combined.includes('KAPITALIZACJA ODSETEK') ||
    combined.includes('ODSETKI OD WKŁADU') ||
    combined.includes('AUTOOSZCZĘDZANIE') ||
    combined.includes('AUTO-OSZCZĘDZANIE') ||
    combined.includes('SMART SAVER') ||
    combined.includes('SKARBONKA') ||
    combined.includes('KONTO SYSTEMATYCZNE') ||
    combined.includes('PODUSZKA FINANSOWA') ||
    combined.includes('ZYSK Z LOKATY') ||
    combined.includes('ROZLICZENIE ODSETEK')
  ) {
    const isInterest = combined.includes('KAPITALIZACJA') || combined.includes('ODSETKI') || combined.includes('ZYSK Z LOKATY');
    return {
      category: 'Konto Oszczędnościowe & Lokaty',
      isInternalTransfer: !isInterest,
      isFixedCost: false,
      isCashWithdrawal: false,
      isB2BCost: false,
      isSavingsDeposit: !isInterest,
      isSavingsInterest: isInterest,
      ruleMatched: isInterest ? 'Oszczędności: Kapitalizacja odsetek' : 'Oszczędności: Rachunek oszczędnościowy',
    };
  }

  // 2. SPECIAL RULE: "Apteka Sąsiedzka"
  // If recipient or description contains "Apteka Sąsiedzka" (or "Apteka Sasiedzka")
  // and expense is high and round (>= 1000 zł [100 000 groszy] and divisible by 100 zł [10 000 groszy], e.g. 1000, 2000, 4000 zł)
  // classify as "Wypłata gotówki z bankomatu". Smaller or non-round -> "Drogerie i Apteki".
  if (combined.includes('APTEKA SĄSIEDZKA') || combined.includes('APTEKA SASIEDZKA')) {
    const isHighRound = absGrosze >= 100000 && absGrosze % 10000 === 0;
    if (isHighRound) {
      return {
        category: 'Wypłata gotówki z bankomatu',
        isInternalTransfer: false,
        isFixedCost: false,
        isCashWithdrawal: true,
        isB2BCost: false,
        ruleMatched: 'Reguła Specjalna: Apteka Sąsiedzka (Wypłata bankomatowa)',
      };
    } else {
      return {
        category: 'Drogerie i Apteki',
        isInternalTransfer: false,
        isFixedCost: false,
        isCashWithdrawal: false,
        isB2BCost: false,
        ruleMatched: 'Reguła Specjalna: Apteka Sąsiedzka (Drogerie i Apteki standard)',
      };
    }
  }

  // 3. Fixed Costs & Subscriptions
  for (const kw of FIXED_COSTS_KEYWORDS) {
    if (combined.includes(kw)) {
      return {
        category: 'Koszty Stałe i Abonamenty',
        isInternalTransfer: false,
        isFixedCost: true,
        isCashWithdrawal: false,
        isB2BCost: false,
        ruleMatched: `Reguła: Koszty Stałe (${kw})`,
      };
    }
  }

  // 4. B2B Company Costs
  for (const kw of B2B_COSTS_KEYWORDS) {
    if (combined.includes(kw)) {
      return {
        category: 'Koszty Firmowe (JDG)',
        isInternalTransfer: false,
        isFixedCost: false,
        isCashWithdrawal: false,
        isB2BCost: true,
        ruleMatched: `Reguła: Koszt Firmowy JDG (${kw})`,
      };
    }
  }

  // 5. Living Costs by Keywords
  // Supermarkety (Biedronka, Lidl, Auchan, Kaufland, Dino, Żabka)
  if (
    combined.includes('BIEDRONKA') ||
    combined.includes('LIDL') ||
    combined.includes('AUCHAN') ||
    combined.includes('KAUFLAND') ||
    combined.includes('DINO') ||
    combined.includes('ŻABKA') ||
    combined.includes('ZABKA') ||
    combined.includes('CARREFOUR') ||
    combined.includes('STOKROTKA') ||
    combined.includes('NETTO')
  ) {
    return {
      category: 'Supermarkety',
      isInternalTransfer: false,
      isFixedCost: false,
      isCashWithdrawal: false,
      isB2BCost: false,
      ruleMatched: 'Słowo kluczowe: Supermarkety',
    };
  }

  // E-commerce (Allegro, Amazon, Vinted, OLX, Temu)
  if (
    combined.includes('ALLEGRO') ||
    combined.includes('AMAZON') ||
    combined.includes('VINTED') ||
    combined.includes('OLX') ||
    combined.includes('TEMU') ||
    combined.includes('ALIEXPRESS') ||
    combined.includes('ZALANDO')
  ) {
    return {
      category: 'E-commerce i Zakupy',
      isInternalTransfer: false,
      isFixedCost: false,
      isCashWithdrawal: false,
      isB2BCost: false,
      ruleMatched: 'Słowo kluczowe: E-commerce',
    };
  }

  // Jedzenie i Dostawa (Restauracje, Pyszne, Glovo, McDonald's, KFC, Pizza, Kebab)
  if (
    combined.includes('PYSZNE') ||
    combined.includes('GLOVO') ||
    combined.includes('UBER EATS') ||
    combined.includes('WOLT') ||
    combined.includes('MCDONALD') ||
    combined.includes('KFC') ||
    combined.includes('PIZZA') ||
    combined.includes('KEBAB') ||
    combined.includes('BURGER') ||
    combined.includes('RESTAURACJ') ||
    combined.includes('KAWIARNIA') ||
    combined.includes('SUSHI')
  ) {
    return {
      category: 'Jedzenie i Dostawa',
      isInternalTransfer: false,
      isFixedCost: false,
      isCashWithdrawal: false,
      isB2BCost: false,
      ruleMatched: 'Słowo kluczowe: Jedzenie i Dostawa',
    };
  }

  // Dom i Remont (Castorama, Leroy Merlin, Obi, Ikea, Action, Pepco)
  if (
    combined.includes('CASTORAMA') ||
    combined.includes('LEROY MERLIN') ||
    combined.includes('OBI') ||
    combined.includes('IKEA') ||
    combined.includes('ACTION') ||
    combined.includes('PEPCO') ||
    combined.includes('BRICO') ||
    combined.includes('MRÓWKA') ||
    combined.includes('MROWKA') ||
    combined.includes('JYSK')
  ) {
    return {
      category: 'Dom i Remont',
      isInternalTransfer: false,
      isFixedCost: false,
      isCashWithdrawal: false,
      isB2BCost: false,
      ruleMatched: 'Słowo kluczowe: Dom i Remont',
    };
  }

  // Auto i Paliwo (Orlen, BP, Shell, Circle K, Moya)
  if (
    combined.includes('ORLEN') ||
    combined.includes('BP ') ||
    combined.includes('SHELL') ||
    combined.includes('CIRCLE K') ||
    combined.includes('MOYA') ||
    combined.includes('STACJA PALIW') ||
    combined.includes('AUTOPAY') ||
    combined.includes('PARKING')
  ) {
    return {
      category: 'Auto i Paliwo',
      isInternalTransfer: false,
      isFixedCost: false,
      isCashWithdrawal: false,
      isB2BCost: false,
      ruleMatched: 'Słowo kluczowe: Auto i Paliwo',
    };
  }

  // Drogerie i Apteki (Rossmann, Hebe, DOZ, Apteka)
  if (
    combined.includes('ROSSMANN') ||
    combined.includes('HEBE') ||
    combined.includes('DOZ') ||
    combined.includes('APTEKA') ||
    combined.includes('SUPER-PHARM') ||
    combined.includes('SEPHORA')
  ) {
    return {
      category: 'Drogerie i Apteki',
      isInternalTransfer: false,
      isFixedCost: false,
      isCashWithdrawal: false,
      isB2BCost: false,
      ruleMatched: 'Słowo kluczowe: Drogerie i Apteki',
    };
  }

  // Wypłaty BLIK / Gotówka
  if (
    combined.includes('WYPŁATA BLIK') ||
    combined.includes('WYPLATA BLIK') ||
    combined.includes('BLIK BANKOMAT') ||
    combined.includes('BANKOMAT') ||
    combined.includes('EURONET') ||
    combined.includes('PLANET CASH')
  ) {
    return {
      category: 'Wypłata gotówki z bankomatu',
      isInternalTransfer: false,
      isFixedCost: false,
      isCashWithdrawal: true,
      isB2BCost: false,
      ruleMatched: 'Słowo kluczowe: Wypłata z bankomatu / BLIK',
    };
  }

  // Positive income
  if (amountInGrosze > 0) {
    return {
      category: 'Przychody / B2B',
      isInternalTransfer: false,
      isFixedCost: false,
      isCashWithdrawal: false,
      isB2BCost: false,
      ruleMatched: 'Kwota dodatnia (Przychód)',
    };
  }

  return {
    category: 'Inne Wydatki',
    isInternalTransfer: false,
    isFixedCost: false,
    isCashWithdrawal: false,
    isB2BCost: false,
    ruleMatched: 'Domyślna kategoria',
  };
}

/**
 * Smart Matching for refunds:
 * Links refund transactions (e.g., positive income from Allegro or store)
 * to original matching negative expense in the same category or merchant.
 */
export function calculateCategoryNetTotals(
  transactions: Transaction[],
  categoryId: string
): { totalSpentGrosze: number; totalRefundsGrosze: number; netSpentGrosze: number } {
  let totalSpentGrosze = 0;
  let totalRefundsGrosze = 0;

  for (const tx of transactions) {
    if (tx.isInternalTransfer) continue;
    
    // Check if directly assigned or refund
    if (tx.category === categoryId) {
      if (tx.amountInGrosze < 0) {
        totalSpentGrosze += Math.abs(tx.amountInGrosze);
      } else {
        totalRefundsGrosze += tx.amountInGrosze;
      }
    }
  }

  return {
    totalSpentGrosze,
    totalRefundsGrosze,
    netSpentGrosze: Math.max(0, totalSpentGrosze - totalRefundsGrosze),
  };
}
