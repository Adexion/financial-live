import type { Transaction, DatabaseState, ReceiptData } from './types.ts';
import { DEFAULT_CATEGORIES, categorizeTransaction } from './categorizer.ts';
import { DEFAULT_B2B_PROFILE } from './b2bCalculator.ts';
import { sha256 } from './sha256.ts';
import { SAMPLE_RECEIPT_BIEDRONKA, SAMPLE_RECEIPT_LIDL } from './receiptParser.ts';

function createTx(
  date: string,
  recipient: string,
  title: string,
  amountInGrosze: number,
  balanceGrosze: number | null = null,
  overrideCat?: string,
  matchedExpenseId: string | null = null,
  receipt?: ReceiptData
): Transaction {
  const hashKey = `${date}|${amountInGrosze}|${recipient.trim().toLowerCase()}|${balanceGrosze ?? 'none'}`;
  const id = sha256(hashKey);
  const catRes = categorizeTransaction(recipient, title, amountInGrosze);

  const finalReceipt = receipt ? { ...receipt, transactionId: id } : undefined;

  return {
    id,
    date,
    recipient,
    title,
    amountInGrosze,
    balanceAfterInGrosze: balanceGrosze,
    category: overrideCat || catRes.category,
    isInternalTransfer: catRes.isInternalTransfer,
    isFixedCost: catRes.isFixedCost,
    isCashWithdrawal: catRes.isCashWithdrawal,
    isB2BCost: catRes.isB2BCost,
    b2bVatRatePercent: 23,
    isRefund: amountInGrosze > 0 && !catRes.isInternalTransfer,
    matchedExpenseId,
    receipt: finalReceipt,
  };
}

export function generateSeedDatabase(): DatabaseState {
  // Current month reference
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const ym = `${year}-${month}`;

  // Seed transactions demonstrating all requested logic:
  // 1. B2B Income (+18 450.00 PLN gross)
  // 2. Apteka Sąsiedzka 2000 zł (triggers special rule: Wypłata gotówki z bankomatu)
  // 3. Apteka Sąsiedzka 45.80 zł (standard Drogerie i Apteki)
  // 4. Koszty Stałe (Tauron, WieszowaNET, Netflix, PWiK, Plus GSM)
  // 5. Jedzenie i Dostawa with Broken Rhythm (bought 6 times in 14 days, cadence = 7 days)
  // 6. Supermarkety (Biedronka, Lidl, Dino)
  // 7. B2B business costs (JetBrains, OVH Hosting, Księgowość)
  // 8. Financial Anomaly: Double charge on Shell (2x 185.00 PLN within 18 hours)
  // 9. Smart Matching: Allegro purchase 299.00 PLN with return +150.00 PLN

  const transactions: Transaction[] = [
    // B2B Revenue
    createTx(`${ym}-02`, 'Software Solutions Sp. z o.o.', 'Faktura FV/2026/10/01 Kontrakt B2B IT', 1845000, 2450000),

    // Special Rule: Apteka Sąsiedzka high round cash withdrawal (2000 zł)
    createTx(`${ym}-03`, 'Apteka Sąsiedzka', 'Wypłata gotówki przy kasie / Cash Back', -200000, 2250000),

    // Apteka Sąsiedzka small purchase
    createTx(`${ym}-08`, 'Apteka Sąsiedzka', 'Witaminy i leki przeciwbólowe', -4580, 2245420),

    // Koszty Stałe i Abonamenty
    createTx(`${ym}-04`, 'Tauron Dystrybucja S.A.', 'Prąd - faktura za energię elektryczną', -28540, 1959980),
    createTx(`${ym}-05`, 'WieszowaNET', 'Abonament Internet światłowodowy 600/300', -7900, 1952080),
    createTx(`${ym}-06`, 'PWiK Zabrze', 'Zużycie wody i odprowadzanie ścieków', -14250, 1937830),
    createTx(`${ym}-07`, 'Plus GSM Polkomtel', 'Abonament telefoniczny 5G', -6500, 1931330),
    createTx(`${ym}-08`, 'NETFLIX Polska', 'Plan Premium 4K subskrypcja', -6000, 1925330),
    createTx(`${ym}-09`, 'MICROSOFT 365', 'Subskrypcja roczna Office Family', -4299, 1921031),

    // Koszty Firmowe JDG (redukujące rezerwę podatkową)
    createTx(`${ym}-04`, 'JetBrains s.r.o.', 'All Products Pack Subscription 1yr', -24900, 1896131),
    createTx(`${ym}-07`, 'OVH Hosting & Cloud', 'Serwer VPS + Domena .pl', -18450, 1877681),
    createTx(`${ym}-10`, 'Biuro Rachunkowe Bilans', 'Obsługa księgowa JDG ryczałt', -35000, 1842681),

    // ZŁAMANY RYTM: Jedzenie i Dostawa (Restauracje / Pyszne.pl / McDonald's / Kebab)
    // 6 wizyt w ciągu 14 dni! (średnio co 2.3 dnia zamiast co 7 dni)
    createTx(`${ym}-02`, 'Pyszne.pl', 'Zamówienie obiadu Pizza & Pasta', -8950, 1833731),
    createTx(`${ym}-05`, 'McDonald\'s Katowice', 'McZestaw Powiększony + Kawa', -5240, 1828491),
    createTx(`${ym}-07`, 'Restauracja Pod Dębem', 'Kolacja biznesowa ze znajomym', -17800, 1810691),
    createTx(`${ym}-10`, 'Kebab King Zabrze', 'Rollo kebab duży + Ayran', -3800, 1806891),
    createTx(`${ym}-12`, 'Glovo Polska', 'Burger & Fries delivery', -7400, 1799491),
    createTx(`${ym}-14`, 'Pyszne.pl', 'Sushi lunch set z dostawą', -11500, 1787991),

    // Supermarkety (z dołączonymi paragonami i audytem ucieczki kasy)
    createTx(`${ym}-03`, 'Biedronka Zabrze ul. Wolności', 'Zakupy spożywcze na weekend', -19850, 1768141, undefined, null, SAMPLE_RECEIPT_BIEDRONKA),
    createTx(`${ym}-06`, 'Lidl Polska Sklep 142', 'Pieczywo, owoce, nabiał', -14520, 1753621, undefined, null, SAMPLE_RECEIPT_LIDL),
    createTx(`${ym}-11`, 'Dino Polska S.A.', 'Uzupełnienie zapasów domowych', -8460, 1745161),
    createTx(`${ym}-15`, 'Biedronka Zabrze', 'Zakupy tygodniowe', -21040, 1724121),

    // Anomalia: Podwójne obciążenie na stacji Shell
    createTx(`${ym}-12`, 'Stacja Shell Katowice', 'Paliwo V-Power 95', -18500, 1705621),
    createTx(`${ym}-13`, 'Stacja Shell Katowice', 'Paliwo V-Power 95 (Błąd terminala / duplikat)', -18500, 1687121),

    // Smart Matching: Zakup Allegro i Zwrot
    createTx(`${ym}-09`, 'Allegro.pl PayU', 'Kabel HDMI 2.1 + Słuchawki', -28900, 1658221),
    createTx(`${ym}-14`, 'Allegro.pl Zwrot', 'Zwrot środków za zwrócony kabel HDMI', 8900, 1667121),

    // Drogerie
    createTx(`${ym}-05`, 'Rossmann Polska', 'Kosmetyki i chemia gospodarcza', -12450, 1654671),

    // Dom i Remont
    createTx(`${ym}-08`, 'Castorama Gliwice', 'Materiały malarskie i kołki', -23000, 1631671),

    // Rachunek Oszczędnościowy i Lokaty
    createTx(`${ym}-05`, 'Konto Oszczędnościowe OKO ING', 'Wpłata na cel: Poduszka Finansowa', -150000, 1517121),
    createTx(`${ym}-15`, 'ING Bank Śląski', 'Kapitalizacja odsetek - Rachunek Oszczędnościowy', 4250, 1521371),

    // Przelew wewnętrzny (neutralny technicznie)
    createTx(`${ym}-03`, 'Przelew własny na konto oszczędnościowe', 'PRZELEW WEWNĘTRZNY WYCHODZĄCY', -500000, 1131671),
  ];

  return {
    version: 1,
    transactions,
    categories: DEFAULT_CATEGORIES,
    b2bProfile: DEFAULT_B2B_PROFILE,
    incomeProfiles: [
      {
        id: 'inc-b2b',
        name: 'Główny Kontrakt B2B (Programista)',
        type: 'B2B_JDG',
        monthlyBaseGrosze: 1845000,
        b2bConfig: DEFAULT_B2B_PROFILE,
      },
      {
        id: 'inc-800plus',
        name: 'Świadczenie Rodzina 800+',
        type: 'UOP_BENEFIT',
        monthlyBaseGrosze: 80000,
      },
    ],
    cloudSync: {
      enabled: false,
      lastSyncDate: null,
      accountEmail: null,
      autoBackup: false,
    },
  };
}
