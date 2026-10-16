import React, { useState } from 'react';
import { 
  Receipt, 
  X, 
  Sparkles, 
  AlertTriangle, 
  CheckCircle2, 
  Trash2, 
  Plus, 
  Camera, 
  Upload, 
  FileText, 
  Cookie, 
  ShoppingBag, 
  Wine, 
  Home, 
  Check, 
  RefreshCw,
  HelpCircle,
  Eye,
  Percent,
  TrendingDown,
  ArrowRight
} from 'lucide-react';
import type { 
  Transaction, 
  ReceiptData, 
  ReceiptItem, 
  ReceiptItemCategory 
} from '../domain/types.ts';
import { formatGrosze, parsePlnToGrosze } from '../domain/types.ts';
import { 
  calculateReceiptAudit, 
  classifyReceiptItem, 
  parseReceiptText,
  SAMPLE_RECEIPT_BIEDRONKA,
  SAMPLE_RECEIPT_LIDL,
  SAMPLE_RECEIPT_GALERIA
} from '../domain/receiptParser.ts';
import { sha256 } from '../domain/sha256.ts';

interface ReceiptAuditModalProps {
  transaction: Transaction;
  onClose: () => void;
  onSaveReceipt: (updatedTx: Transaction) => void;
  onRemoveReceipt: (updatedTx: Transaction) => void;
}

export const ReceiptAuditModal: React.FC<ReceiptAuditModalProps> = ({
  transaction,
  onClose,
  onSaveReceipt,
  onRemoveReceipt,
}) => {
  // If transaction already has a receipt, clone it for local editing, else initialize empty
  const [activeTab, setActiveTab] = useState<'AUDIT' | 'SCAN' | 'TEXT' | 'PRESETS'>('AUDIT');
  
  const [receipt, setReceipt] = useState<ReceiptData>(() => {
    if (transaction.receipt) {
      return JSON.parse(JSON.stringify(transaction.receipt));
    }
    // Default draft
    const initialItems: ReceiptItem[] = [];
    const totalGrosze = Math.abs(transaction.amountInGrosze);
    const auditSummary = calculateReceiptAudit(initialItems, totalGrosze);
    return {
      id: sha256(`receipt|${transaction.id}|draft`),
      transactionId: transaction.id,
      storeName: transaction.recipient || 'Sklep / Galeria Handlowa',
      date: transaction.date,
      totalGrosze,
      items: initialItems,
      auditSummary,
      uploadedAt: new Date().toISOString(),
    };
  });

  // New item form state
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<ReceiptItemCategory>('STAPLES');

  // OCR Text input state
  const [pastedText, setPastedText] = useState(receipt.rawText || '');
  const [isScanningSimulated, setIsScanningSimulated] = useState(false);
  const [uploadedImagePreview, setUploadedImagePreview] = useState<string | null>(receipt.imageUrl || null);

  // Re-calculate audit whenever items change
  const updateItems = (newItems: ReceiptItem[], newTotal?: number) => {
    const total = newTotal !== undefined ? newTotal : receipt.totalGrosze;
    const audit = calculateReceiptAudit(newItems, total);
    setReceipt(prev => ({
      ...prev,
      items: newItems,
      auditSummary: audit,
      totalGrosze: total,
    }));
  };

  // Change category of an item
  const handleItemCategoryChange = (itemId: string, category: ReceiptItemCategory) => {
    const updated = receipt.items.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          category,
          isImpulseOrLeakage: category === 'SNACKS' || category === 'GOODIES',
        };
      }
      return item;
    });
    updateItems(updated);
  };

  // Remove an item
  const handleRemoveItem = (itemId: string) => {
    const updated = receipt.items.filter(item => item.id !== itemId);
    updateItems(updated);
  };

  // Add new item
  const handleAddItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim() || !newItemPrice) return;
    const priceGrosze = parsePlnToGrosze(newItemPrice);
    if (priceGrosze <= 0) return;

    const newItem: ReceiptItem = {
      id: sha256(`${newItemName}|${priceGrosze}|${Date.now()}`),
      name: newItemName.trim(),
      priceGrosze,
      quantity: 1,
      category: newItemCategory,
      isImpulseOrLeakage: newItemCategory === 'SNACKS' || newItemCategory === 'GOODIES',
    };

    updateItems([...receipt.items, newItem]);
    setNewItemName('');
    setNewItemPrice('');
  };

  // Auto-detect category on new item input change
  const handleNewItemNameChange = (val: string) => {
    setNewItemName(val);
    if (val.trim().length >= 3) {
      const detected = classifyReceiptItem(val);
      if (detected !== 'OTHER') {
        setNewItemCategory(detected);
      }
    }
  };

  // Handle Text parse
  const handleParseText = () => {
    if (!pastedText.trim()) return;
    const parsed = parseReceiptText(pastedText, transaction.recipient);
    setReceipt({
      ...parsed,
      transactionId: transaction.id,
      imageUrl: uploadedImagePreview || undefined,
    });
    setActiveTab('AUDIT');
  };

  // Handle Preset load
  const handleLoadPreset = (preset: ReceiptData) => {
    const cloned = JSON.parse(JSON.stringify(preset));
    cloned.transactionId = transaction.id;
    cloned.date = transaction.date;
    setReceipt(cloned);
    setPastedText(cloned.rawText || '');
    setActiveTab('AUDIT');
  };

  // Handle image upload with simulated OCR scan
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setUploadedImagePreview(dataUrl);
      setIsScanningSimulated(true);

      // Simulate OCR processing delay for optical recognition
      setTimeout(() => {
        setIsScanningSimulated(false);
        // Load smart sample based on store or fallback to Biedronka
        let sample = SAMPLE_RECEIPT_BIEDRONKA;
        if (/lidl/i.test(transaction.recipient)) {
          sample = SAMPLE_RECEIPT_LIDL;
        } else if (/galeria|carrefour|auchan/i.test(transaction.recipient)) {
          sample = SAMPLE_RECEIPT_GALERIA;
        }
        
        const cloned = JSON.parse(JSON.stringify(sample));
        cloned.transactionId = transaction.id;
        cloned.imageUrl = dataUrl;
        cloned.date = transaction.date;
        setReceipt(cloned);
        setPastedText(cloned.rawText || '');
        setActiveTab('AUDIT');
      }, 900);
    };
    reader.readAsDataURL(file);
  };

  // Save changes
  const handleSave = () => {
    const updatedTx: Transaction = {
      ...transaction,
      receipt: {
        ...receipt,
        transactionId: transaction.id,
      },
    };
    onSaveReceipt(updatedTx);
    onClose();
  };

  // Unpin / Remove receipt
  const handleRemove = () => {
    const updatedTx: Transaction = {
      ...transaction,
      receipt: undefined,
    };
    onRemoveReceipt(updatedTx);
    onClose();
  };

  const audit = receipt.auditSummary;
  const absTxAmount = Math.abs(transaction.amountInGrosze);
  const isMatchingAmount = Math.abs(audit.totalGrosze - absTxAmount) <= 100; // within 1 PLN
  const hasItems = receipt.items.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="w-full max-w-2xl bg-white dark:bg-[#181a20] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#14151a]">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                    Audyt Paragonu Fiskalnego & Detekcja Ucieczki Kasy
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Podciągnij paragon pod transakcję i zobacz ile zeszło na podstawowe zakupy, a ile na zachcianki i przekąski.
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Linked Transaction Pill Info */}
          <div className="mt-3 p-2.5 rounded-2xl bg-white dark:bg-[#1f222a] border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                Podpięte pod
              </span>
              <strong className="text-slate-900 dark:text-white truncate">
                {transaction.recipient}
              </strong>
              <span className="text-slate-400">•</span>
              <span className="text-slate-500">{transaction.date}</span>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] text-slate-400 mr-1.5">Wyciąg z banku:</span>
              <strong className="font-extrabold text-slate-900 dark:text-white">
                {formatGrosze(transaction.amountInGrosze)}
              </strong>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex items-center gap-1.5 mt-3 overflow-x-auto pb-0.5 no-scrollbar text-xs">
            <button
              onClick={() => setActiveTab('AUDIT')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'AUDIT'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <ShoppingBag className="w-3.5 h-3.5" />
              <span>Skład & Audyt Koszyka ({receipt.items.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('SCAN')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'SCAN'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Skanuj / Zdjęcie paragonu</span>
            </button>

            <button
              onClick={() => setActiveTab('TEXT')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'TEXT'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Wklej e-paragon</span>
            </button>

            <button
              onClick={() => setActiveTab('PRESETS')}
              className={`px-3 py-1.5 rounded-xl font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'PRESETS'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Gotowe Szablony (1 klik)</span>
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          
          {/* TAB 1: AUDIT & ITEMS BREAKDOWN */}
          {activeTab === 'AUDIT' && (
            <div className="space-y-4">
              {/* LEAKAGE CARD & ANALYSIS METRICS */}
              {hasItems ? (
                <div className="p-4 rounded-3xl bg-slate-50 dark:bg-[#1e2027] border border-slate-200 dark:border-slate-800 space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                        Wskaźnik ucieczki pieniędzy
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black ${
                          audit.leakagePercent > 35 
                            ? 'text-rose-600 dark:text-rose-400' 
                            : audit.leakagePercent > 15
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}>
                          {audit.leakagePercent}%
                        </span>
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                          rachunku to przekąski i impulsywne zachcianki ({formatGrosze(audit.leakageTotalGrosze)})
                        </span>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Suma z paragonu</span>
                      <span className="text-base font-extrabold text-slate-900 dark:text-white">
                        {formatGrosze(audit.totalGrosze)}
                      </span>
                    </div>
                  </div>

                  {/* Multi-segment visual bar */}
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden flex">
                      {audit.staplesTotalGrosze > 0 && (
                        <div 
                          className="bg-emerald-500 h-full transition-all duration-300"
                          style={{ width: `${(audit.staplesTotalGrosze / audit.totalGrosze) * 100}%` }}
                          title={`Baza spożywcza: ${formatGrosze(audit.staplesTotalGrosze)}`}
                        />
                      )}
                      {audit.snacksTotalGrosze > 0 && (
                        <div 
                          className="bg-amber-400 h-full transition-all duration-300"
                          style={{ width: `${(audit.snacksTotalGrosze / audit.totalGrosze) * 100}%` }}
                          title={`Przekąski & Słodycze: ${formatGrosze(audit.snacksTotalGrosze)}`}
                        />
                      )}
                      {audit.goodiesTotalGrosze > 0 && (
                        <div 
                          className="bg-rose-500 h-full transition-all duration-300"
                          style={{ width: `${(audit.goodiesTotalGrosze / audit.totalGrosze) * 100}%` }}
                          title={`Zachcianki & Dobroci: ${formatGrosze(audit.goodiesTotalGrosze)}`}
                        />
                      )}
                      {audit.householdTotalGrosze > 0 && (
                        <div 
                          className="bg-sky-400 h-full transition-all duration-300"
                          style={{ width: `${(audit.householdTotalGrosze / audit.totalGrosze) * 100}%` }}
                          title={`Chemia & Dom: ${formatGrosze(audit.householdTotalGrosze)}`}
                        />
                      )}
                      {audit.otherTotalGrosze > 0 && (
                        <div 
                          className="bg-slate-400 h-full transition-all duration-300"
                          style={{ width: `${(audit.otherTotalGrosze / audit.totalGrosze) * 100}%` }}
                          title={`Inne: ${formatGrosze(audit.otherTotalGrosze)}`}
                        />
                      )}
                    </div>

                    {/* Legend */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0" />
                        <span className="text-slate-600 dark:text-slate-400">Baza spożywcza:</span>
                        <strong className="text-slate-900 dark:text-slate-200">{formatGrosze(audit.staplesTotalGrosze)}</strong>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                        <span className="text-slate-600 dark:text-slate-400">Przekąski:</span>
                        <strong className="text-slate-900 dark:text-slate-200">{formatGrosze(audit.snacksTotalGrosze)}</strong>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0" />
                        <span className="text-slate-600 dark:text-slate-400">Zachcianki & Dobroci:</span>
                        <strong className="text-slate-900 dark:text-slate-200">{formatGrosze(audit.goodiesTotalGrosze)}</strong>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-sky-400 shrink-0" />
                        <span className="text-slate-600 dark:text-slate-400">Chemia & Dom:</span>
                        <strong className="text-slate-900 dark:text-slate-200">{formatGrosze(audit.householdTotalGrosze)}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Smart Diagnostic Advice Banner */}
                  {audit.leakagePercent > 30 ? (
                    <div className="p-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-start gap-2.5 text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-rose-900 dark:text-rose-300 block">
                          Uwaga: Duży przeciek budżetu w markecie!
                        </strong>
                        <p className="text-rose-800 dark:text-rose-400 mt-0.5 text-[11px] leading-relaxed">
                          Pieniądze uciekły na <strong>{formatGrosze(audit.leakageTotalGrosze)}</strong> zbędnych przekąsek i impulsywnych dobroci. Gdybyś kupił tylko planowane podstawowe zakupy spożywcze, ten paragon wyniósłby zaledwie <strong>{formatGrosze(audit.staplesTotalGrosze)}</strong>!
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 flex items-start gap-2.5 text-xs">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-emerald-900 dark:text-emerald-300 block">
                          Świetna kontrola koszyka zakupowego!
                        </strong>
                        <p className="text-emerald-800 dark:text-emerald-400 mt-0.5 text-[11px] leading-relaxed">
                          Aż {audit.staplesPercent}% kwoty poszło na realną bazę spożywczą. Zachcianki i przekąski zostały ograniczone do minimum.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-6 rounded-3xl bg-slate-50 dark:bg-[#1e2027] border border-slate-200 dark:border-slate-800 text-center space-y-3">
                  <Receipt className="w-10 h-10 text-indigo-400 mx-auto" />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Brak pozycji na tym paragonie
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                      Zeskanuj zdjęcie paragonu, wklej tekst e-paragonu z aplikacji (Biedronka / Lidl) lub dodaj pozycje ręcznie poniżej.
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                      onClick={() => handleLoadPreset(SAMPLE_RECEIPT_BIEDRONKA)}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer shadow-xs"
                    >
                      Załaduj przykładowy paragon Biedronka
                    </button>
                    <button
                      onClick={() => setActiveTab('SCAN')}
                      className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-300 cursor-pointer"
                    >
                      Zeskanuj zdjęcie
                    </button>
                  </div>
                </div>
              )}

              {/* ITEMS LIST TABLE */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 px-1">
                  <span>Pozycje na paragonie ({receipt.items.length})</span>
                  <span className="text-[11px] font-normal text-slate-500">
                    Kliknij kategorię, aby zmienić klasyfikację
                  </span>
                </div>

                <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                  {receipt.items.map((item) => {
                    const isLeakage = item.category === 'SNACKS' || item.category === 'GOODIES';

                    return (
                      <div
                        key={item.id}
                        className={`p-2.5 rounded-2xl border transition-all flex items-center justify-between gap-3 text-xs ${
                          isLeakage
                            ? 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/50'
                            : item.category === 'STAPLES'
                            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/50'
                            : 'bg-white dark:bg-[#1f222a] border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        {/* Name & Badge */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-semibold text-slate-900 dark:text-white truncate">
                              {item.name}
                            </span>
                            {item.quantity > 1 && (
                              <span className="text-[10px] text-slate-400">
                                ({item.quantity}x)
                              </span>
                            )}
                            {isLeakage && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-300 flex items-center gap-0.5">
                                <AlertTriangle className="w-2.5 h-2.5" />
                                <span>Ucieczka kasy</span>
                              </span>
                            )}
                          </div>

                          {/* Category Selector Pills */}
                          <div className="flex items-center gap-1 mt-1 text-[10px]">
                            {[
                              { id: 'STAPLES', label: 'Baza spożywcza', color: 'emerald' },
                              { id: 'SNACKS', label: 'Przekąska', color: 'amber' },
                              { id: 'GOODIES', label: 'Zachcianka / Dobroć', color: 'rose' },
                              { id: 'HOUSEHOLD', label: 'Dom / Chemia', color: 'sky' },
                            ].map((catPill) => (
                              <button
                                key={catPill.id}
                                onClick={() => handleItemCategoryChange(item.id, catPill.id as ReceiptItemCategory)}
                                className={`px-2 py-0.5 rounded-md font-medium transition-colors cursor-pointer ${
                                  item.category === catPill.id
                                    ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                              >
                                {catPill.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Price & Delete */}
                        <div className="flex items-center gap-3 shrink-0">
                          <strong className="text-xs font-bold text-slate-900 dark:text-white">
                            {formatGrosze(item.priceGrosze * (item.quantity || 1))}
                          </strong>
                          <button
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Usuń pozycję"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ADD NEW ITEM FORM */}
                <form
                  onSubmit={handleAddItem}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-[#1a1d24] border border-slate-200 dark:border-slate-800 space-y-2 mt-2"
                >
                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                    Dodaj kolejną pozycję z paragonu ręcznie
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-6">
                      <input
                        type="text"
                        value={newItemName}
                        onChange={(e) => handleNewItemNameChange(e.target.value)}
                        placeholder="Nazwa produktu (np. Chipsy Lay's, Chleb, Piwo)"
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#23262f] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <input
                        type="number"
                        step="0.01"
                        value={newItemPrice}
                        onChange={(e) => setNewItemPrice(e.target.value)}
                        placeholder="Kwota (PLN)"
                        className="w-full px-3 py-1.5 rounded-xl bg-white dark:bg-[#23262f] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
                      />
                    </div>
                    <div className="sm:col-span-3">
                      <select
                        value={newItemCategory}
                        onChange={(e) => setNewItemCategory(e.target.value as ReceiptItemCategory)}
                        className="w-full px-2 py-1.5 rounded-xl bg-white dark:bg-[#23262f] border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none"
                      >
                        <option value="STAPLES">🟢 Baza spożywcza</option>
                        <option value="SNACKS">🟡 Przekąska / Słodycze</option>
                        <option value="GOODIES">🔴 Zachcianka / Dobroć</option>
                        <option value="HOUSEHOLD">⚪ Chemia / Dom</option>
                        <option value="OTHER">Inne</option>
                      </select>
                    </div>
                    <div className="sm:col-span-1">
                      <button
                        type="submit"
                        className="w-full h-full py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold flex items-center justify-center cursor-pointer shadow-xs"
                        title="Dodaj"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* TAB 2: SCAN / UPLOAD PHOTO */}
          {activeTab === 'SCAN' && (
            <div className="space-y-4">
              <div className="p-6 rounded-3xl border-2 border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/30 dark:bg-indigo-950/20 text-center space-y-3">
                <Camera className="w-10 h-10 text-indigo-500 mx-auto" />
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                    Zeskanuj lub wgraj zdjęcie paragonu fiskalnego
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                    Aparat lub plik JPG/PNG/PDF. System natychmiast wyodrębni produkty i podzieli na bazę spożywczą oraz impulsywne zachcianki.
                  </p>
                </div>

                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-indigo-600 text-white font-bold text-xs hover:bg-indigo-700 cursor-pointer shadow-sm">
                  <Upload className="w-4 h-4" />
                  <span>Wybierz zdjęcie / zrób zdjęcie aparatem</span>
                  <input
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Scanning status simulation indicator */}
              {isScanningSimulated && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center gap-3 text-xs text-amber-900 dark:text-amber-200">
                  <RefreshCw className="w-4 h-4 text-amber-600 animate-spin" />
                  <span>
                    Optyczne rozpoznawanie znaków (OCR) w toku... Analiza pozycji i klasyfikacja słów kluczowych...
                  </span>
                </div>
              )}

              {/* Image Preview if available */}
              {uploadedImagePreview && (
                <div className="p-3 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Podgląd podpiętego zdjęcia paragonu</span>
                    </span>
                    <button
                      onClick={() => setUploadedImagePreview(null)}
                      className="text-red-500 hover:text-red-700 text-[11px] cursor-pointer"
                    >
                      Usuń zdjęcie
                    </button>
                  </div>
                  <div className="max-h-60 overflow-hidden rounded-xl bg-black/5 flex items-center justify-center">
                    <img 
                      src={uploadedImagePreview} 
                      alt="Paragon" 
                      className="max-h-60 object-contain rounded-lg"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PASTE TEXT */}
          {activeTab === 'TEXT' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                  Wklej tekst e-paragonu lub raport z kasy
                </label>
                <span className="text-[10px] text-slate-500">
                  Format: Nazwa produktu [spacja] Cena PLN
                </span>
              </div>
              <textarea
                rows={9}
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`BIEDRONKA
CHLEB ZYTNI 4,89
MLEKO SWIEZE 3,69
CHIPSY LAYS MAX 9,49
CZEKOLADA MILKA 6,29
PIWO ZYWIEC 5,49
SUMA PLN: 29,85`}
                className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-[#1f222a] border border-slate-200 dark:border-slate-700 font-mono text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <button
                onClick={handleParseText}
                className="w-full py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Sparkles className="w-4 h-4" />
                <span>Wyodrębnij pozycje i przeprowadź audyt ucieczki kasy</span>
              </button>
            </div>
          )}

          {/* TAB 4: PRESETS (1-CLICK TEST) */}
          {activeTab === 'PRESETS' && (
            <div className="space-y-3">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                Wybierz gotowy przykładowy paragon, aby natychmiast przetestować audyt:
              </span>

              <div className="space-y-2">
                {/* Preset 1: Biedronka */}
                <div 
                  onClick={() => handleLoadPreset(SAMPLE_RECEIPT_BIEDRONKA)}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1e2027] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      🛒 Biedronka - Weekendowe zakupy rodzinne (198,50 zł)
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                      Ucieczka kasy: 53%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Zakupy miały być tylko spożywcze (chleb, mleko, mięso, ziemniaki), ale do koszyka wpadły 2 paczki chipsów Lay's, czekolada Milka, Kinder Bueno, 2x Coca-Cola i 4-pak piwa Żywiec.
                  </p>
                </div>

                {/* Preset 2: Galeria Arkadia / Carrefour */}
                <div 
                  onClick={() => handleLoadPreset(SAMPLE_RECEIPT_GALERIA)}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1e2027] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      🏬 Carrefour Galeria Handlowa - Wyprawa do centrum (289,00 zł)
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300">
                      Ucieczka kasy: 53%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Makaron i pesto to baza (43 zł), ale reszta to impulsywne lody Häagen-Dazs, świeca zapachowa WoodWick (65 zł), wino Prosecco (43 zł) i kawa ziarnista.
                  </p>
                </div>

                {/* Preset 3: Lidl - Zdrowy koszyk */}
                <div 
                  onClick={() => handleLoadPreset(SAMPLE_RECEIPT_LIDL)}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#1e2027] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition-all cursor-pointer space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      🥗 Lidl - Wzorowy koszyk bazowy (145,20 zł)
                    </span>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
                      Ucieczka kasy: tylko 7%
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Oliwa, łosoś, płatki owsiane, twaróg, warzywa i owoce. Zero niepotrzebnych śmieciowych przekąsek, jedynie tabliczka gorzkiej czekolady 85%.
                  </p>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Bottom Action Bar */}
        <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-[#14151a] flex items-center justify-between gap-3">
          {transaction.receipt ? (
            <button
              onClick={handleRemove}
              className="flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Odepnij paragon</span>
            </button>
          ) : (
            <div className="text-[11px] text-slate-400">
              Niepodpięty paragon
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-2xl bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Anuluj
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Zapisz i podepnij pod transakcję</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
