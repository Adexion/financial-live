import type { Transaction } from './types.ts';
import { parsePlnToGrosze } from './types.ts';
import { categorizeTransaction } from './categorizer.ts';
import { sha256 } from './sha256.ts';

export interface CsvParseResult {
  transactions: Transaction[];
  duplicatesSkipped: number;
  newImported: number;
  totalParsedRows: number;
  detectedSeparator: string;
  detectedEncoding: string;
}

/**
 * Robust CSV Line Splitter that respects quoted fields containing separators or newlines
 */
export function splitCsvLine(line: string, separator: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === separator && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Decode byte array into string handling UTF-8 and Windows-1250
 */
export function decodeCsvBytes(bytes: Uint8Array, preferredEncoding?: string): { text: string; encoding: string } {
  // If preferred encoding is specified
  if (preferredEncoding) {
    try {
      const decoder = new TextDecoder(preferredEncoding);
      return { text: decoder.decode(bytes), encoding: preferredEncoding };
    } catch {
      // Fallback
    }
  }

  // Check UTF-8 BOM
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    const decoder = new TextDecoder('utf-8');
    return { text: decoder.decode(bytes.slice(3)), encoding: 'utf-8-bom' };
  }

  // Try decoding as UTF-8 first
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    return { text: decoder.decode(bytes), encoding: 'utf-8' };
  } catch {
    // If fatal error in UTF-8, it is likely Windows-1250 (common in Polish banks like PKO BP, ING, Pekao, Santander, mBank)
    try {
      const decoder = new TextDecoder('windows-1250');
      return { text: decoder.decode(bytes), encoding: 'windows-1250' };
    } catch {
      // Fallback to standard utf-8 without fatal
      const decoder = new TextDecoder('utf-8');
      return { text: decoder.decode(bytes), encoding: 'utf-8-fallback' };
    }
  }
}

/**
 * Standardize dates (e.g. DD.MM.YYYY, DD-MM-YYYY, YYYY-MM-DD, YYYY/MM/DD) to YYYY-MM-DD
 */
export function normalizeDate(rawDate: string): string {
  const cleaned = rawDate.trim().replace(/"/g, '');
  
  // Format YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return cleaned;
  }
  
  // Format DD.MM.YYYY or DD-MM-YYYY or DD/MM/YYYY
  const partsDmy = cleaned.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
  if (partsDmy) {
    const day = partsDmy[1].padStart(2, '0');
    const month = partsDmy[2].padStart(2, '0');
    const year = partsDmy[3];
    return `${year}-${month}-${day}`;
  }

  // Format YYYY.MM.DD
  const partsYmd = cleaned.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
  if (partsYmd) {
    const year = partsYmd[1];
    const month = partsYmd[2].padStart(2, '0');
    const day = partsYmd[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Fallback to today if unparseable
  return new Date().toISOString().slice(0, 10);
}

/**
 * Parses raw CSV string, auto-identifies columns, calculates SHA-256 deduplication key,
 * runs auto-categorization and returns clean transactions.
 */
export function parseBankCsv(
  csvContent: string,
  existingTransactionIds: Set<string> = new Set()
): CsvParseResult {
  const lines = csvContent.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length === 0) {
    return {
      transactions: [],
      duplicatesSkipped: 0,
      newImported: 0,
      totalParsedRows: 0,
      detectedSeparator: ';',
      detectedEncoding: 'utf-8',
    };
  }

  // Detect separator: count ';' vs ',' in the first few non-empty lines
  let semicolonCount = 0;
  let commaCount = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    semicolonCount += (lines[i].match(/;/g) || []).length;
    commaCount += (lines[i].match(/,/g) || []).length;
  }
  const separator = semicolonCount >= commaCount ? ';' : ',';

  // Find header row: look for keywords in first 10 rows
  let headerIndex = -1;
  let dateCol = -1;
  let recipientCol = -1;
  let titleCol = -1;
  let amountCol = -1;
  let balanceCol = -1;

  for (let i = 0; i < Math.min(15, lines.length); i++) {
    const columns = splitCsvLine(lines[i], separator).map(c => c.toLowerCase().replace(/['"]/g, '').trim());
    
    const dIdx = columns.findIndex(c => c.includes('data'));
    const aIdx = columns.findIndex(c => c.includes('kwota') || c.includes('amount') || c.includes('wartość') || c.includes('wartosc'));
    
    if (dIdx !== -1 && aIdx !== -1) {
      headerIndex = i;
      dateCol = dIdx;
      amountCol = aIdx;
      
      recipientCol = columns.findIndex(c => 
        c.includes('odbiorca') || c.includes('nadawca') || c.includes('kontrahent') || c.includes('partner') || c.includes('payee')
      );
      titleCol = columns.findIndex(c => 
        c.includes('tytuł') || c.includes('tytul') || c.includes('opis') || c.includes('szczegóły') || c.includes('szczegoly') || c.includes('title')
      );
      balanceCol = columns.findIndex(c => 
        c.includes('saldo') || c.includes('balance') || c.includes('dostępne') || c.includes('dostepne')
      );
      break;
    }
  }

  // Fallbacks if no explicit header found
  if (headerIndex === -1) {
    headerIndex = 0;
    dateCol = 0;
    recipientCol = 1;
    titleCol = 2;
    amountCol = 3;
    balanceCol = 4;
  } else {
    if (recipientCol === -1) recipientCol = dateCol === 0 ? 1 : 0;
    if (titleCol === -1) titleCol = recipientCol === 1 ? 2 : 1;
  }

  const transactions: Transaction[] = [];
  let duplicatesSkipped = 0;
  let totalParsed = 0;

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    const cells = splitCsvLine(rawLine, separator).map(c => c.replace(/^["']|["']$/g, '').trim());
    if (cells.length <= Math.max(dateCol, amountCol)) continue;

    const rawDate = cells[dateCol];
    const rawAmount = cells[amountCol];
    if (!rawDate || !rawAmount) continue;

    const normalizedDate = normalizeDate(rawDate);
    const amountInGrosze = parsePlnToGrosze(rawAmount);
    
    // Ignore rows where amount is invalid
    if (isNaN(amountInGrosze)) continue;

    const recipient = recipientCol !== -1 && cells[recipientCol] ? cells[recipientCol] : 'Brak danych odbiorcy';
    const title = titleCol !== -1 && cells[titleCol] ? cells[titleCol] : '';
    const balanceAfterInGrosze = balanceCol !== -1 && cells[balanceCol] ? parsePlnToGrosze(cells[balanceCol]) : null;

    // Deduplication Key: SHA-256(Data + Kwota_w_groszach + Odbiorca + Saldo)
    const hashPayload = `${normalizedDate}|${amountInGrosze}|${recipient.trim().toLowerCase()}|${balanceAfterInGrosze ?? 'none'}`;
    const uniqueId = sha256(hashPayload);

    totalParsed++;

    if (existingTransactionIds.has(uniqueId)) {
      duplicatesSkipped++;
      continue;
    }

    // Categorization
    const catResult = categorizeTransaction(recipient, title, amountInGrosze);

    const isSavingsFile = /oszczęd|oszczed|lokata|rachunek oszczęd|oko|moje cele|skarbonka|depozyt/i.test(csvContent.slice(0, 2000));
    const effectiveCategory = (isSavingsFile && catResult.category === 'Inne Wydatki') 
      ? 'Konto Oszczędnościowe & Lokaty' 
      : catResult.category;

    const isSavings = catResult.isSavingsDeposit || catResult.isSavingsInterest || isSavingsFile || effectiveCategory === 'Konto Oszczędnościowe & Lokaty';

    transactions.push({
      id: uniqueId,
      date: normalizedDate,
      recipient,
      title,
      amountInGrosze,
      balanceAfterInGrosze,
      category: effectiveCategory,
      isInternalTransfer: catResult.isInternalTransfer,
      isFixedCost: catResult.isFixedCost,
      isCashWithdrawal: catResult.isCashWithdrawal,
      isB2BCost: catResult.isB2BCost,
      isSavingsDeposit: catResult.isSavingsDeposit ?? isSavings,
      isSavingsInterest: catResult.isSavingsInterest ?? false,
      accountType: isSavings ? 'SAVINGS' : 'CHECKING',
      b2bVatRatePercent: 23,
      isRefund: amountInGrosze > 0 && !catResult.isInternalTransfer && !isSavings,
    });

    // Mark as seen so duplicates inside same CSV don't double import
    existingTransactionIds.add(uniqueId);
  }

  return {
    transactions,
    duplicatesSkipped,
    newImported: transactions.length,
    totalParsedRows: totalParsed,
    detectedSeparator: separator,
    detectedEncoding: 'utf-8',
  };
}
