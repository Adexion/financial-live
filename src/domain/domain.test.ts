import test from 'node:test';
import assert from 'node:assert/strict';
import { formatGrosze, parsePlnToGrosze } from './types.ts';
import { categorizeTransaction, calculateCategoryNetTotals } from './categorizer.ts';
import { sha256 } from './sha256.ts';
import { parseBankCsv } from './csvParser.ts';
import { calculateB2BMonthlySummary } from './b2bCalculator.ts';
import { analyzeCadenceAndAnomalies } from './cadenceGuard.ts';
import { generateSeedDatabase } from './seedData.ts';

test('formatGrosze and parsePlnToGrosze handle integer groszy without floating point drift', () => {
  assert.equal(parsePlnToGrosze('100,50 zł'), 10050);
  assert.equal(parsePlnToGrosze('-2 450,99'), -245099);
  assert.equal(parsePlnToGrosze(12.34), 1234);
  assert.equal(formatGrosze(10050), '100,50 zł');
  assert.equal(formatGrosze(-245099), '-2 450,99 zł');
  assert.equal(formatGrosze(1845000), '18 450,00 zł');
});

test('Special Rule: Apteka Sąsiedzka round >=1000 PLN classifies as ATM cash withdrawal', () => {
  // 2000 zł round -> ATM withdrawal
  const resRound2000 = categorizeTransaction('Apteka Sąsiedzka Zabrze', 'Zakup / Gotówka', -200000);
  assert.equal(resRound2000.category, 'Wypłata gotówki z bankomatu');
  assert.equal(resRound2000.isCashWithdrawal, true);

  // 1000 zł round -> ATM withdrawal
  const resRound1000 = categorizeTransaction('Apteka Sasiedzka', 'Wypłata', -100000);
  assert.equal(resRound1000.category, 'Wypłata gotówki z bankomatu');
  assert.equal(resRound1000.isCashWithdrawal, true);

  // 45.80 zł (small, not round) -> Drogerie i Apteki
  const resSmall = categorizeTransaction('Apteka Sąsiedzka', 'Leki i syrop', -4580);
  assert.equal(resSmall.category, 'Drogerie i Apteki');
  assert.equal(resSmall.isCashWithdrawal, false);

  // 1234.50 zł (high but not round) -> Drogerie i Apteki
  const resNotRound = categorizeTransaction('Apteka Sąsiedzka', 'Sprzęt medyczny', -123450);
  assert.equal(resNotRound.category, 'Drogerie i Apteki');
  assert.equal(resNotRound.isCashWithdrawal, false);
});

test('Internal transfer keywords are marked as neutral technical transfers', () => {
  const t1 = categorizeTransaction('Jan Kowalski', 'Przelew własny na drugie konto', -50000);
  assert.equal(t1.isInternalTransfer, true);
  assert.equal(t1.category, 'Przelew Wewnętrzny');

  const t2 = categorizeTransaction('Konto Główne', 'PRZELEW WEWNĘTRZNY WYCHODZĄCY', -100000);
  assert.equal(t2.isInternalTransfer, true);
});

test('Fixed costs keywords categorize as Koszty Stałe i Abonamenty', () => {
  const k1 = categorizeTransaction('Tauron Dystrybucja', 'Prąd domowy', -28500);
  assert.equal(k1.category, 'Koszty Stałe i Abonamenty');
  assert.equal(k1.isFixedCost, true);

  const k2 = categorizeTransaction('WieszowaNET', 'Internet światłowód', -7900);
  assert.equal(k2.category, 'Koszty Stałe i Abonamenty');

  const k3 = categorizeTransaction('Netflix International B.V.', 'Subscription', -6000);
  assert.equal(k3.category, 'Koszty Stałe i Abonamenty');
});

test('Savings accounts (OKO / Cele / Lokaty) and interest capitalization are recognized', () => {
  const s1 = categorizeTransaction('Konto Oszczędnościowe OKO', 'Wpłata na cel', -200000);
  assert.equal(s1.category, 'Konto Oszczędnościowe & Lokaty');
  assert.equal(s1.isSavingsDeposit, true);
  assert.equal(s1.isInternalTransfer, true);

  const s2 = categorizeTransaction('ING Bank Śląski', 'Kapitalizacja odsetek - Rachunek Oszczędnościowy', 8540);
  assert.equal(s2.category, 'Konto Oszczędnościowe & Lokaty');
  assert.equal(s2.isSavingsInterest, true);
  assert.equal(s2.isInternalTransfer, false);
});

test('CSV Parser identifies columns and deduplicates rows using SHA-256', () => {
  const csv = `Data operacji;Odbiorca;Tytuł;Kwota;Saldo po operacji
2026-10-01;Biedronka;Zakupy;-100,00;1000,00
2026-10-02;Lidl;Spożywcze;-50,00;950,00
2026-10-01;Biedronka;Zakupy;-100,00;1000,00`;

  const parsed = parseBankCsv(csv);
  assert.equal(parsed.totalParsedRows, 3);
  assert.equal(parsed.newImported, 2);
  assert.equal(parsed.duplicatesSkipped, 1);
  assert.equal(parsed.transactions.length, 2);
  assert.equal(parsed.transactions[0].amountInGrosze, -10000);
  assert.equal(parsed.transactions[0].category, 'Supermarkety');
});

test('B2B Calculator accurately splits Gross Revenue into VAT Reserve, PIT, ZUS, and Net Household Income', () => {
  const seed = generateSeedDatabase();
  const summary = calculateB2BMonthlySummary(seed.transactions, seed.b2bProfile);

  assert.equal(summary.grossRevenueGrosze, 1845000); // 18 450.00 PLN gross
  assert.equal(summary.netRevenueGrosze, 1500000); // 15 000.00 PLN netto
  assert.equal(summary.zusDueGrosze, 160000); // 1 600.00 PLN ZUS
  // Business expenses reduce VAT
  assert.ok(summary.vatInputDeductedGrosze > 0);
  assert.ok(summary.takeHomeDisposableIncomeGrosze > 0);
});

test('Cadence Guard flags broken rhythm when purchasing frequency exceeds contract', () => {
  const seed = generateSeedDatabase();
  const analysis = analyzeCadenceAndAnomalies(seed.transactions, seed.categories, `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-15`);

  // Jedzenie i Dostawa had 6 visits in 14 days vs 4 per month target
  const jedzenieAlert = analysis.alerts.find(a => a.categoryName === 'Jedzenie i Dostawa');
  assert.ok(jedzenieAlert, 'Should detect broken rhythm in Jedzenie i Dostawa');
  assert.equal(jedzenieAlert?.severity, 'CRITICAL');
  assert.ok(jedzenieAlert?.projectedExcessGrosze && jedzenieAlert.projectedExcessGrosze > 0);

  // Anomaly: Double charge on Shell should be detected
  const doubleCharge = analysis.anomalies.find(a => a.type === 'DOUBLE_CHARGE');
  assert.ok(doubleCharge, 'Should detect double charge on Shell');
  assert.equal(doubleCharge?.amountGrosze, 18500);
});

test('Savings Account Statement CSV is recognized and marked with accountType SAVINGS', () => {
  const savingsCsv = `Wyciąg z rachunku oszczędnościowego OKO
Data operacji;Odbiorca;Tytuł;Kwota;Saldo
2026-10-01;Konto Oszczędnościowe OKO;Wpłata na cel: Poduszka Finansowa;-2500,00;28000,00
2026-10-15;ING Bank Śląski;Kapitalizacja odsetek;115,20;28115,20`;

  const parsed = parseBankCsv(savingsCsv);
  assert.equal(parsed.transactions.length, 2);
  assert.equal(parsed.transactions[0].category, 'Konto Oszczędnościowe & Lokaty');
  assert.equal(parsed.transactions[0].accountType, 'SAVINGS');
  assert.equal(parsed.transactions[0].isSavingsDeposit, true);
  assert.equal(parsed.transactions[1].isSavingsInterest, true);
});

test('classifyReceiptItem categorizes items into Staples, Snacks, Goodies, and Household', async () => {
  const { classifyReceiptItem, calculateReceiptAudit, parseReceiptText } = await import('./receiptParser.ts');

  // Snacks & Sweets
  assert.equal(classifyReceiptItem('Chipsy Lays Papryka 130g'), 'SNACKS');
  assert.equal(classifyReceiptItem('Czekolada Milka Oreo'), 'SNACKS');
  assert.equal(classifyReceiptItem('Baton Kinder Bueno'), 'SNACKS');
  assert.equal(classifyReceiptItem('Coca-Cola Zero 1.5L'), 'SNACKS');
  assert.equal(classifyReceiptItem('Lody Magnum Almond'), 'SNACKS');

  // Goodies & Impulses
  assert.equal(classifyReceiptItem('Piwo Żywiec Butelka 500ml'), 'GOODIES');
  assert.equal(classifyReceiptItem('Wino Prosecco Treviso'), 'GOODIES');
  assert.equal(classifyReceiptItem('Świeca zapachowa WoodWick'), 'GOODIES');
  assert.equal(classifyReceiptItem('Kabanosy Exclusive'), 'GOODIES');

  // Household & Cleaning
  assert.equal(classifyReceiptItem('Płyn do naczyń Fairy 900ml'), 'HOUSEHOLD');
  assert.equal(classifyReceiptItem('Papier toaletowy Velvet 8 rolek'), 'HOUSEHOLD');

  // Core Grocery Staples
  assert.equal(classifyReceiptItem('Chleb żytni 500g'), 'STAPLES');
  assert.equal(classifyReceiptItem('Mleko świeże 3.2% 1L'), 'STAPLES');
  assert.equal(classifyReceiptItem('Jaja ściółkowe klasa L'), 'STAPLES');
  assert.equal(classifyReceiptItem('Pierś z kurczaka świeża'), 'STAPLES');
  assert.equal(classifyReceiptItem('Ziemniaki myte 2.5kg'), 'STAPLES');
});

test('calculateReceiptAudit computes exact budget leakage percentage from snacks and goodies', async () => {
  const { calculateReceiptAudit } = await import('./receiptParser.ts');

  const items = [
    { id: '1', name: 'Chleb', priceGrosze: 500, quantity: 1, category: 'STAPLES' as const },
    { id: '2', name: 'Mleko', priceGrosze: 400, quantity: 1, category: 'STAPLES' as const },
    { id: '3', name: 'Chipsy Lay\'s', priceGrosze: 800, quantity: 1, category: 'SNACKS' as const },
    { id: '4', name: 'Piwo', priceGrosze: 500, quantity: 1, category: 'GOODIES' as const },
  ];

  const audit = calculateReceiptAudit(items, 2200); // 22.00 zł total
  assert.equal(audit.staplesTotalGrosze, 900); // 9.00 zł
  assert.equal(audit.snacksTotalGrosze, 800); // 8.00 zł
  assert.equal(audit.goodiesTotalGrosze, 500); // 5.00 zł
  assert.equal(audit.leakageTotalGrosze, 1300); // 13.00 zł (8.00 + 5.00)
  assert.equal(audit.leakagePercent, 59); // 1300 / 2200 * 100 = 59%
});

test('parseReceiptText extracts items, store name, and audit from raw receipt text', async () => {
  const { parseReceiptText } = await import('./receiptParser.ts');

  const text = `BIEDRONKA UL. WOLNOSCI
CHLEB ZYTNI 4,50 A
MLEKO SWIEZE 3,80 A
CHIPSY LAYS 8,90 B
BATON TWIX 3,20 B
SUMA PLN: 20,40`;

  const parsed = parseReceiptText(text);
  assert.equal(parsed.storeName, 'Biedronka');
  assert.equal(parsed.items.length, 4);
  assert.equal(parsed.totalGrosze, 2040);
  assert.ok(parsed.auditSummary.leakageTotalGrosze > 0);
  assert.equal(parsed.auditSummary.leakagePercent, 59);
});
