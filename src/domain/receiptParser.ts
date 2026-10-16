import type { 
  ReceiptItem, 
  ReceiptItemCategory, 
  ReceiptAuditSummary, 
  ReceiptData 
} from './types.ts';
import { parsePlnToGrosze } from './types.ts';
import { sha256 } from './sha256.ts';

/**
 * Classifies an individual line item from a fiscal receipt into one of:
 * - STAPLES: Core groceries (chleb, mleko, nabiał, mięso, warzywa, owoce, jaja)
 * - SNACKS: Przekąski & Słodycze (chipsy, batony, czekolady, ciastka, żelki, słodkie napoje)
 * - GOODIES: Impulsywne zachcianki & "dobroci" (alkohol, gadżety, świeczki, delikatesy)
 * - HOUSEHOLD: Chemia gospodarcza & Kosmetyki & Dom
 * - OTHER: Inne
 */
export function classifyReceiptItem(name: string): ReceiptItemCategory {
  const norm = name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // strip accents for reliable matching

  // 1. SNACKS / PRZEKĄSKI & SŁODYCZE
  const snackKeywords = [
    'chips', 'chrupk', 'lays', 'crunchips', 'nachos', 'cheetos', 'pringles',
    'baton', 'snickers', 'twix', 'mars', 'bounty', 'kitkat', 'kinder', 'bueno',
    'czekolad', 'milka', 'wedel', 'wafel', 'princessa', 'pryncypalki',
    'ciastk', 'ciastecz', 'delicje', 'pieguski', 'herbatnik',
    'zelk', 'haribo', 'mamba', 'skittles', 'mentos', 'guma do zucia',
    'lody', 'magnum', 'kaktus', 'rozki', 'grycan',
    'cola', 'pepsi', 'fanta', 'sprite', 'mirinda', '7up',
    'monster', 'redbull', 'tiger', 'burn', 'energetyk', 'energy drink',
    'orzeszk', 'paluszk', 'krakers', 'precel', 'popcorn', 'lizak', 'draze'
  ];
  if (snackKeywords.some(kw => norm.includes(kw))) {
    return 'SNACKS';
  }

  // 2. GOODIES / IMPULSYWNE ZACHCIANKI & "DOBROCI" (alkohol, gadżety, delikatesy premium)
  const goodiesKeywords = [
    'piwo', 'browar', 'zywiec', 'tyskie', 'warka', 'heineken', 'carlsberg', 'harnas', 'lech',
    'wino', 'wine', 'prosecco', 'cydr', 'aperol', 'szampan',
    'wodka', 'whisky', 'whiskey', 'gin', 'rum', 'likier', 'tequila', 'bourbon',
    'swieca', 'swieczk', 'woodwick', 'yankee', 'zapach', 'dyfuzor',
    'gadzet', 'zabawk', 'gazeta', 'magazyn', 'krzyzowk', 'komiks',
    'kawiarnia', 'deser', 'kawior', 'trufl', 'delikates', 'prezent',
    'kwiat', 'roslina', 'doniczk', 'kubek', 'kieliszek', 'ladowarka',
    'kabanos', 'exclusive'
  ];
  if (goodiesKeywords.some(kw => norm.includes(kw))) {
    return 'GOODIES';
  }

  // 3. HOUSEHOLD / CHEMIA GOSPODARCZA & KOSMETYKI & DOM
  const householdKeywords = [
    'papier toalet', 'recznik papier', 'chustecz',
    'plyn do naczyn', 'fairy', 'pur', 'ludwik',
    'tabletki do zmywark', 'finish', 'somat',
    'proszek do pran', 'kapsulki do pran', 'ariel', 'persil', 'vizir',
    'plyn do plukan', 'lenor', 'silan', 'vanish',
    'domestos', 'cilit', 'ajax', 'bref', 'kret',
    'worki na smiec', 'gabk', 'zmywak', 'scierecz',
    'szampon', 'odzywk', 'mydlo', 'zel pod prysznic', 'dove', 'nivea', 'palmolive',
    'pasta do zeb', 'colgate', 'blend', 'szczoteczk', 'antyperspirant', 'dezodorant',
    'pianka do golen', 'maszynk', 'waciki', 'podpask', 'tampon'
  ];
  if (householdKeywords.some(kw => norm.includes(kw))) {
    return 'HOUSEHOLD';
  }

  // 4. STAPLES / PODSTAWOWE SPOŻYWCZE (Baza codziennej diety)
  const staplesKeywords = [
    'chleb', 'bulka', 'bagietk', 'kajzerk', 'pieczyw', 'tost', 'chrupkie',
    'mleko', 'maslo', 'margaryn', 'ser ', 'ser zolty', 'twarog', 'serek wiejsk', 'mozzarella',
    'jaj', 'jajka', 'jogurt', 'kefir', 'maslank', 'smietan',
    'kurczak', 'piers z kurczak', 'schab', 'szynk', 'mielone', 'wolowin', 'indyk', 'kielbas',
    'ryba', 'losos', 'dorsz', 'makrel', 'tunczyk',
    'ziemniak', 'pomidor', 'ogor', 'cebul', 'czosnek', 'marchew', 'jablk', 'banan',
    'cytryn', 'pomarancz', 'salat', 'szpinak', 'papryk', 'pieczark', 'kapust',
    'ryz', 'kasza', 'makaron', 'platki owsian', 'maka', 'cukier', 'sol',
    'woda', 'woda zrodlan', 'woda mineraln', 'oliwa', 'olej rzepak', 'sos pomidor', 'passata'
  ];
  if (staplesKeywords.some(kw => norm.includes(kw))) {
    return 'STAPLES';
  }

  // Default fallback
  return 'OTHER';
}

/**
 * Calculates comprehensive audit metrics for a list of receipt items
 */
export function calculateReceiptAudit(
  items: ReceiptItem[], 
  totalGroszeOverride?: number
): ReceiptAuditSummary {
  let staplesTotal = 0;
  let snacksTotal = 0;
  let goodiesTotal = 0;
  let householdTotal = 0;
  let otherTotal = 0;

  for (const item of items) {
    const itemTotal = item.priceGrosze * (item.quantity || 1);
    switch (item.category) {
      case 'STAPLES':
        staplesTotal += itemTotal;
        break;
      case 'SNACKS':
        snacksTotal += itemTotal;
        break;
      case 'GOODIES':
        goodiesTotal += itemTotal;
        break;
      case 'HOUSEHOLD':
        householdTotal += itemTotal;
        break;
      default:
        otherTotal += itemTotal;
        break;
    }
  }

  const calculatedTotal = staplesTotal + snacksTotal + goodiesTotal + householdTotal + otherTotal;
  const totalGrosze = totalGroszeOverride !== undefined && totalGroszeOverride > 0
    ? totalGroszeOverride 
    : calculatedTotal;

  const leakageTotalGrosze = snacksTotal + goodiesTotal;
  const leakagePercent = totalGrosze > 0 
    ? Math.round((leakageTotalGrosze / totalGrosze) * 100) 
    : 0;
  const staplesPercent = totalGrosze > 0 
    ? Math.round((staplesTotal / totalGrosze) * 100) 
    : 0;

  return {
    staplesTotalGrosze: staplesTotal,
    snacksTotalGrosze: snacksTotal,
    goodiesTotalGrosze: goodiesTotal,
    householdTotalGrosze: householdTotal,
    otherTotalGrosze: otherTotal,
    totalGrosze,
    leakageTotalGrosze,
    leakagePercent,
    staplesPercent,
  };
}

/**
 * Parses raw receipt text (pasted or OCR output) into a structured ReceiptData
 */
export function parseReceiptText(text: string, storeHint?: string): ReceiptData {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const items: ReceiptItem[] = [];
  let detectedStore = storeHint || 'Sklep / Centrum Handlowe';
  let date = new Date().toISOString().slice(0, 10);
  let parsedTotalGrosze: number | undefined;

  // Regex patterns
  const dateRegex = /\b(202\d[-/.](?:0[1-9]|1[0-2])[-/.](?:0[1-9]|[12]\d|3[01]))\b/;
  const sumRegex = /(?:SUMA|RAZEM|TOTAL|DO ZAPŁATY|WARTOSC).*?([\d\s]+[.,]\d{2})/i;
  // Item line pattern: e.g. "CHIPSY LAYS 130G  8,99 A" or "CHLEB ZYTNIO-PSZENNY  4.50" or "2 x 3.50 7.00"
  const priceAtEndRegex = /^(.*?)\s+([\d\s]+[.,]\d{2})(?:\s+[A-Za-z*])?$/;
  const quantityMultiRegex = /^(\d+)\s*[xX*]\s*([\d\s]+[.,]\d{2})\s*=\s*([\d\s]+[.,]\d{2})/;

  for (const line of lines) {
    // Store detection
    if (/biedronka/i.test(line)) detectedStore = 'Biedronka';
    else if (/lidl/i.test(line)) detectedStore = 'Lidl';
    else if (/auchan/i.test(line)) detectedStore = 'Auchan';
    else if (/carrefour/i.test(line)) detectedStore = 'Carrefour';
    else if (/rossmann/i.test(line)) detectedStore = 'Rossmann';
    else if (/dino/i.test(line)) detectedStore = 'Dino';
    else if (/zabka|żabka/i.test(line)) detectedStore = 'Żabka';
    else if (/galeria|arkadia|mokotow|posnania|manufaktura/i.test(line)) detectedStore = line;

    // Date detection
    const dateMatch = line.match(dateRegex);
    if (dateMatch) {
      date = dateMatch[1].replace(/[/.]/g, '-');
    }

    // Sum detection
    const sumMatch = line.match(sumRegex);
    if (sumMatch) {
      parsedTotalGrosze = parsePlnToGrosze(sumMatch[1]);
      continue;
    }

    // Ignore receipt header/footer junk
    if (/paragon fiskalny|nip:|nr wydruku|kasa:|kasjer:|reszta|karta|pln|ptum|spolka|ul\.|kod/i.test(line)) {
      continue;
    }

    // Line item matching
    const match = line.match(priceAtEndRegex);
    if (match) {
      const rawName = match[1].replace(/^\d+[\s.-]+/, '').trim();
      const rawPrice = match[2];

      if (rawName.length > 2 && !/suma|razem|gotowka|karta|bilon/i.test(rawName)) {
        const priceGrosze = parsePlnToGrosze(rawPrice);
        if (priceGrosze > 0) {
          const category = classifyReceiptItem(rawName);
          const isImpulse = category === 'SNACKS' || category === 'GOODIES';
          items.push({
            id: sha256(`${rawName}|${priceGrosze}|${items.length}`),
            name: rawName,
            priceGrosze,
            quantity: 1,
            category,
            isImpulseOrLeakage: isImpulse,
          });
        }
      }
    }
  }

  // Fallback: If no line matched with strict regex, split lines with commas or tabs
  if (items.length === 0) {
    for (const line of lines) {
      const parts = line.split(/[;\t]/);
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const price = parsePlnToGrosze(parts[1].trim());
        if (price > 0 && name.length > 1) {
          const category = classifyReceiptItem(name);
          items.push({
            id: sha256(`${name}|${price}|${items.length}`),
            name,
            priceGrosze: price,
            quantity: 1,
            category,
            isImpulseOrLeakage: category === 'SNACKS' || category === 'GOODIES',
          });
        }
      }
    }
  }

  const auditSummary = calculateReceiptAudit(items, parsedTotalGrosze);

  return {
    id: sha256(`receipt|${detectedStore}|${date}|${auditSummary.totalGrosze}`),
    storeName: detectedStore,
    date,
    totalGrosze: auditSummary.totalGrosze,
    items,
    auditSummary,
    rawText: text,
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Sample Predefined Receipts for quick 1-click testing
 */
export const SAMPLE_RECEIPT_BIEDRONKA: ReceiptData = (() => {
  const items: ReceiptItem[] = [
    // Podstawowe spożywcze (Baza)
    { id: 'b-1', name: 'Chleb żytni bez drożdży 500g', priceGrosze: 489, quantity: 1, category: 'STAPLES' },
    { id: 'b-2', name: 'Mleko świeże 3.2% Mleczna Dolina', priceGrosze: 369, quantity: 2, category: 'STAPLES' },
    { id: 'b-3', name: 'Jaja z chowu ściółkowego klasa L 10szt', priceGrosze: 999, quantity: 1, category: 'STAPLES' },
    { id: 'b-4', name: 'Pierś z kurczaka świeża k-pack', priceGrosze: 2450, quantity: 1, category: 'STAPLES' },
    { id: 'b-5', name: 'Ziemniaki myte 2.5kg', priceGrosze: 849, quantity: 1, category: 'STAPLES' },
    { id: 'b-6', name: 'Banany świeże bio 1kg', priceGrosze: 699, quantity: 1, category: 'STAPLES' },
    { id: 'b-7', name: 'Masło ekstra 82% 200g', priceGrosze: 699, quantity: 1, category: 'STAPLES' },
    // Przekąski & Słodycze (Ucieczka kasy!)
    { id: 'b-8', name: 'Chipsy Lay\'s Max Papryka 200g', priceGrosze: 949, quantity: 2, category: 'SNACKS', isImpulseOrLeakage: true },
    { id: 'b-9', name: 'Czekolada Milka Alpenmilch z orzechami', priceGrosze: 629, quantity: 2, category: 'SNACKS', isImpulseOrLeakage: true },
    { id: 'b-10', name: 'Batony Kinder Bueno multipack 3szt', priceGrosze: 1149, quantity: 1, category: 'SNACKS', isImpulseOrLeakage: true },
    { id: 'b-11', name: 'Coca-Cola Zero Butelka 1.5L', priceGrosze: 899, quantity: 2, category: 'SNACKS', isImpulseOrLeakage: true },
    { id: 'b-12', name: 'Żelki Haribo Złote Misie 175g', priceGrosze: 689, quantity: 1, category: 'SNACKS', isImpulseOrLeakage: true },
    // Zachcianki & Dobroci / Impulsowe
    { id: 'b-13', name: 'Piwo Żywiec APA Butelka 500ml', priceGrosze: 549, quantity: 4, category: 'GOODIES', isImpulseOrLeakage: true },
    { id: 'b-14', name: 'Kabanosy Exclusive drobiowe 120g', priceGrosze: 899, quantity: 1, category: 'GOODIES', isImpulseOrLeakage: true },
    // Chemia / Dom
    { id: 'b-15', name: 'Płyn do naczyń Fairy Cytryna 900ml', priceGrosze: 1190, quantity: 1, category: 'HOUSEHOLD' },
    { id: 'b-16', name: 'Ręcznik papierowy Queen Mega', priceGrosze: 1290, quantity: 1, category: 'HOUSEHOLD' },
  ];

  const totalGrosze = 19850; // matches Biedronka transaction in seedData: -198.50 PLN
  const auditSummary = calculateReceiptAudit(items, totalGrosze);

  return {
    id: 'receipt-sample-biedronka-1',
    transactionId: '',
    storeName: 'Biedronka Zabrze ul. Wolności',
    date: '2026-10-03',
    totalGrosze,
    items,
    auditSummary,
    rawText: `BIEDRONKA ZABRZE UL. WOLNOSCI 120
PARAGON FISKALNY
CHLEB ZYTNI BEZ DROZDZY 4,89 A
MLEKO SWIEZE 3.2% 2x3.69 7,38 A
JAJA SCIOLKOWE L 10SZT 9,99 A
PIERS Z KURCZAKA SWIEZA 24,50 A
ZIEMNIAKI MYTE 2.5KG 8,49 A
BANANY BIO 6,99 A
MASLO EKSTRA 82% 6,99 A
CHIPSY LAYS MAX PAPRYKA 2x9.49 18,98 B
CZEKOLADA MILKA ORZECH 2x6.29 12,58 B
BATONY KINDER BUENO 3PK 11,49 B
COCA-COLA ZERO 1.5L 2x8.99 17,98 B
ZELKI HARIBO ZLOTE MISIE 6,89 B
PIWO ZYWIEC APA 4x5.49 21,96 C
KABANOSY EXCLUSIVE 8,99 A
PLYN DO NACZYN FAIRY 11,90 A
RECZNIK PAPIEROWY QUEEN 12,90 A
---------------------------------
SUMA PLN: 198,50`,
    uploadedAt: new Date().toISOString(),
  };
})();

export const SAMPLE_RECEIPT_LIDL: ReceiptData = (() => {
  const items: ReceiptItem[] = [
    // Podstawowe spożywcze (Baza)
    { id: 'l-1', name: 'Chleb żytni z ziarnami Bio', priceGrosze: 549, quantity: 1, category: 'STAPLES' },
    { id: 'l-2', name: 'Twaróg Pilos Klinek 250g', priceGrosze: 429, quantity: 2, category: 'STAPLES' },
    { id: 'l-3', name: 'Płatki owsiane górskie 500g', priceGrosze: 349, quantity: 2, category: 'STAPLES' },
    { id: 'l-4', name: 'Oliwa z oliwek Extra Virgin 750ml', priceGrosze: 3490, quantity: 1, category: 'STAPLES' },
    { id: 'l-5', name: 'Łosoś atlantycki filet świeży 300g', priceGrosze: 2990, quantity: 1, category: 'STAPLES' },
    { id: 'l-6', name: 'Pomidory malinowe 1kg', priceGrosze: 1290, quantity: 1, category: 'STAPLES' },
    { id: 'l-7', name: 'Szpinak myty bio 200g', priceGrosze: 599, quantity: 1, category: 'STAPLES' },
    { id: 'l-8', name: 'Jogurt naturalny grecki 400g', priceGrosze: 450, quantity: 2, category: 'STAPLES' },
    { id: 'l-9', name: 'Borówki amerykańskie 300g', priceGrosze: 1190, quantity: 1, category: 'STAPLES' },
    // Drobna przekąska
    { id: 'l-10', name: 'Czekolada Bellarom Dark 85%', priceGrosze: 845, quantity: 1, category: 'SNACKS', isImpulseOrLeakage: true },
    // Chemia
    { id: 'l-11', name: 'Worki na śmieci ze ściągaczem 60L', priceGrosze: 890, quantity: 1, category: 'HOUSEHOLD' },
  ];

  const totalGrosze = 14520; // matches Lidl transaction in seedData: -145.20 PLN
  const auditSummary = calculateReceiptAudit(items, totalGrosze);

  return {
    id: 'receipt-sample-lidl-1',
    transactionId: '',
    storeName: 'Lidl Polska Sklep 142',
    date: '2026-10-06',
    totalGrosze,
    items,
    auditSummary,
    rawText: `LIDL POLSKA SKLEP NR 142
PARAGON FISKALNY
CHLEB ZYTNI Z ZIARNAMI 5,49 A
TWAROG PILOS KLINEK 2x4.29 8,58 A
PLATKI OWSIANE GORSKIE 2x3.49 6,98 A
OLIWA Z OLIWEK EXTRA VIRGIN 34,90 A
LOSOS ATLANTYCKI FILET 29,90 A
POMIDORY MALINOWE 12,90 A
SZPINAK MYTY BIO 5,99 A
JOGURT GRECKI 2x4.50 9,00 A
BOROWKI AMERYKANSKIE 11,90 A
CZEKOLADA BELLAROM 85% 8,45 B
WORKI NA SMIECI 60L 8,90 A
---------------------------------
SUMA PLN: 145,20`,
    uploadedAt: new Date().toISOString(),
  };
})();

export const SAMPLE_RECEIPT_GALERIA: ReceiptData = (() => {
  const items: ReceiptItem[] = [
    // Podstawowe
    { id: 'g-1', name: 'Makaron Barilla Tagliatelle 500g', priceGrosze: 1099, quantity: 1, category: 'STAPLES' },
    { id: 'g-2', name: 'Sos Pesto Genovese Barilla', priceGrosze: 1490, quantity: 1, category: 'STAPLES' },
    { id: 'g-3', name: 'Ser Grana Padano 200g', priceGrosze: 1890, quantity: 1, category: 'STAPLES' },
    { id: 'g-4', name: 'Pomidorki koktajlowe bio', priceGrosze: 890, quantity: 1, category: 'STAPLES' },
    // Przekąski i Słodycze (Ucieczka!)
    { id: 'g-5', name: 'Chipsy Pringles Sour Cream & Onion', priceGrosze: 1399, quantity: 2, category: 'SNACKS', isImpulseOrLeakage: true },
    { id: 'g-6', name: 'Lody Häagen-Dazs Salted Caramel 460ml', priceGrosze: 2999, quantity: 1, category: 'SNACKS', isImpulseOrLeakage: true },
    { id: 'g-7', name: 'Ciastka Oreo Golden 176g', priceGrosze: 799, quantity: 2, category: 'SNACKS', isImpulseOrLeakage: true },
    // Zachcianki & Dobroci w galerii handlowej
    { id: 'g-8', name: 'Świeca zapachowa WoodWick Fireside', priceGrosze: 6500, quantity: 1, category: 'GOODIES', isImpulseOrLeakage: true },
    { id: 'g-9', name: 'Wino Prosecco Mionetto Treviso Brut', priceGrosze: 4290, quantity: 1, category: 'GOODIES', isImpulseOrLeakage: true },
    { id: 'g-10', name: 'Kawa ziarnista Lavazza Crema 1kg', priceGrosze: 5800, quantity: 1, category: 'GOODIES', isImpulseOrLeakage: true },
  ];

  const totalGrosze = 28900;
  const auditSummary = calculateReceiptAudit(items, totalGrosze);

  return {
    id: 'receipt-sample-galeria-1',
    transactionId: '',
    storeName: 'Carrefour Galeria Mokotów',
    date: '2026-10-10',
    totalGrosze,
    items,
    auditSummary,
    rawText: `CARREFOUR GALERIA MOKOTOW
PARAGON FISKALNY
MAKARON BARILLA TAGLIATELLE 10,99 A
SOS PESTO GENOVESE 14,90 A
SER GRANA PADANO 200G 18,90 A
POMIDORKI KOKTAJLOWE BIO 8,90 A
CHIPSY PRINGLES SOUR CREAM 2x13.99 27,98 B
LODY HAAGEN-DAZS CARAMEL 29,99 B
CIASTKA OREO GOLDEN 2x7.99 15,98 B
SWIECA ZAPACHOWA WOODWICK 65,00 A
WINO PROSECCO MIONETTO 42,90 C
KAWA ZIARNISTA LAVAZZA 1KG 58,00 A
---------------------------------
SUMA PLN: 289,00`,
    uploadedAt: new Date().toISOString(),
  };
})();
