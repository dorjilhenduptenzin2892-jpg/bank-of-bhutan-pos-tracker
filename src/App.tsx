/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { 
  Upload, 
  Search, 
  AlertTriangle, 
  FileText, 
  CreditCard, 
  Download, 
  CheckCircle2, 
  XCircle,
  ChevronRight,
  Filter,
  Plus,
  Trash2,
  Table as TableIcon,
  Settings2,
  X,
  RefreshCw,
  Cloud,
  Package,
  History,
  ArrowUpRight,
  ArrowDownLeft,
  ShieldCheck,
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { POSRow, PaymentRow, MerchantSummary, DataQualityIssue } from './types';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type Tab = 'upload' | 'summary' | 'dashboard' | 'tracker' | 'exports' | 'stock';

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [rawPosData, setRawPosData] = useState<any[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [unitPrice, setUnitPrice] = useState<number>(16825); // Default BTN per terminal
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMerchantMid, setSelectedMerchantMid] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showManualSyncModal, setShowManualSyncModal] = useState(false);
  const [manualSyncJson, setManualSyncJson] = useState('');

  // Stock Tracking State
  const [stockStats, setStockStats] = useState<any>(null);
  const [terminals, setTerminals] = useState<any[]>([]);
  const [stockSettings, setStockSettings] = useState<any>({});
  const [stockSearch, setStockSearch] = useState('');
  const [stockStatusFilter, setStockStatusFilter] = useState('');
  const [isStockLoading, setIsStockLoading] = useState(false);
  const [isSyncingStock, setIsSyncingStock] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [selectedTerminal, setSelectedTerminal] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(true); // Default to true for this implementation
  
  // Manual Payment Form State
  const [manualAmount, setManualAmount] = useState<string>('');
  const [manualQuantity, setManualQuantity] = useState<number>(1);
  const [manualSignatures, setManualSignatures] = useState<string[]>([]);
  const [manualRef, setManualRef] = useState<string>('');
  const [manualDate, setManualDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Stock Tracking Functions
  const fetchStockData = useCallback(async () => {
    setIsStockLoading(true);
    try {
      const [statsRes, terminalsRes, settingsRes] = await Promise.all([
        fetch('/api/stock/stats'),
        fetch(`/api/stock/terminals?status=${stockStatusFilter}&search=${stockSearch}`),
        fetch('/api/stock/settings')
      ]);
      
      if (statsRes.ok) setStockStats(await statsRes.json());
      if (terminalsRes.ok) setTerminals(await terminalsRes.json());
      if (settingsRes.ok) setStockSettings(await settingsRes.json());
    } catch (error) {
      console.error('Error fetching stock data:', error);
    } finally {
      setIsStockLoading(false);
    }
  }, [stockStatusFilter, stockSearch]);

  useEffect(() => {
    if (activeTab === 'stock') {
      fetchStockData();
    }
  }, [activeTab, fetchStockData]);

  const syncStockFromCloud = async () => {
    setIsSyncingStock(true);
    try {
      const response = await fetch('/api/cloud/stock');
      if (!response.ok) {
        let errMsg = `HTTP error! status: ${response.status}`;
        try {
          const errData = await response.clone().json();
          errMsg = errData.details ? `${errData.error}: ${errData.details}` : (errData.error || errMsg);
        } catch {
          const errText = await response.text().catch(() => '');
          if (errText) errMsg = `${errMsg} - ${errText.substring(0, 200)}`;
        }
        throw new Error(errMsg);
      }
      const data = await response.json();
      
      if (!Array.isArray(data)) throw new Error('Invalid stock data format');

      // Extract serial numbers from the cloud data
      // Assuming the column in Google Sheet is named "Serial Number" or "serial_number"
      const serials = data.map(item => {
        const serial = item.serial_number || item.serialnumber || item.serial_no || item.terminal_serial_no;
        return String(serial || '').trim().toUpperCase();
      }).filter(s => s && s.length > 0);

      if (serials.length === 0) {
        alert('No serial numbers found in the cloud stock list.');
        return;
      }

      // Import into local database
      const importResponse = await fetch('/api/stock/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serials,
          batchName: "Cloud Master List",
          procuredDate: new Date().toISOString().split('T')[0]
        })
      });

      if (importResponse.ok) {
        const result = await importResponse.json();
        alert(`Stock Sync Complete!\nTotal Terminals: ${result.total}\nNew Imported: ${result.imported}\nAlready Existed: ${result.skipped}`);
        fetchStockData();
      } else {
        const err = await importResponse.json();
        alert(`Sync failed: ${err.error}`);
      }
    } catch (error: any) {
      console.error('Error syncing stock:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsSyncingStock(false);
    }
  };

  const handleIssueTerminal = async (formData: any) => {
    try {
      const response = await fetch('/api/stock/issue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        setShowIssueModal(false);
        fetchStockData();
      } else {
        const error = await response.json();
        alert(error.error);
      }
    } catch (error) {
      console.error('Error issuing terminal:', error);
    }
  };

  const handleReturnTerminal = async (formData: any) => {
    try {
      const response = await fetch('/api/stock/return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (response.ok) {
        setShowReturnModal(false);
        fetchStockData();
      } else {
        const error = await response.json();
        alert(error.error);
      }
    } catch (error) {
      console.error('Error returning terminal:', error);
    }
  };

  const handleResetStock = async () => {
    if (!confirm('Are you absolutely sure? This will delete ALL terminal and issuance data and unlock the import.')) return;
    try {
      const response = await fetch('/api/stock/reset', { method: 'POST' });
      if (response.ok) {
        alert('System reset successfully.');
        fetchStockData();
      }
    } catch (error) {
      console.error('Error resetting stock:', error);
    }
  };
  const handleManualPayment = async (mid: string) => {
    const finalAmount = manualAmount || (manualSignatures.length * 16825).toString();
    const finalRef = manualRef.trim();

    if (manualSignatures.length === 0) {
      alert('Please select at least one terminal to pay for.');
      return;
    }

    if (!finalAmount || !finalRef || !manualDate) {
      alert('Please fill in all payment details.');
      return;
    }

    // 1. Check for duplicate reference number (Global check across all merchants)
    if (payments.some(p => p.receiptRef.trim().toLowerCase() === finalRef.toLowerCase())) {
      alert(`Reference number "${finalRef}" has already been used. Each payment must have a unique reference.`);
      return;
    }

    const merchant = merchantSummaries.find(s => s.mid === mid);
    if (!merchant) return;

    setIsSubmitting(true);

    try {
      // Get data for ONLY the selected terminals
      const selectedTerminals = posData.filter(r => 
        String(r.mid).trim() === String(mid).trim() && 
        manualSignatures.includes(r.signature)
      );
      
      const selectedTids = selectedTerminals.map(r => r.tid).join(', ');
      const selectedSigs = selectedTerminals.map(r => r.signature).join(', ');
      const location = `${merchant?.region || ''} ${merchant?.dzongkhag || ''}`.trim();

      const normalizeMid = (id: string) => String(id || '').trim().toLowerCase().replace(/^0+/, '');
      const normalizedMid = normalizeMid(mid);

      const newPayment: PaymentRow = {
        receiptRef: finalRef,
        date: manualDate,
        mid: normalizedMid,
        amount: parseFloat(finalAmount),
        paymentType: 'Manual Entry',
        notes: `Payment for ${manualSignatures.length} terminal(s). Credited to account: 202959988`,
        selectedSignatures: manualSignatures
      };

      // Sync with Google Sheets via server proxy (to bypass CORS)
      try {
        // Send as text/plain to avoid OPTIONS preflight which Apps Script doesn't support
        await fetch('/api/cloud/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            dateOfPayment: manualDate,
            merchantName: merchant?.merchantName || 'Unknown',
            merchantId: normalizedMid,
            location: location || 'N/A',
            contactNo: merchant?.contact || 'N/A',
            bankingReferenceNumber: finalRef,
            amountPaid: finalAmount,
            quantity: manualSignatures.length,
            creditedToAccount: '202959988',
            terminalIds: selectedTids,
            serialNumbers: selectedSigs
          }),
        });
      } catch (e) {
        console.warn('Proxy sync failed, but payment recorded locally:', e);
      }

      setPayments(prev => [...prev, newPayment]);
      setManualAmount('');
      setManualQuantity(1);
      setManualSignatures([]);
      setManualRef('');
      alert('Payment recorded and synced successfully!');
    } catch (error) {
      console.error('Error syncing with Google Sheets:', error);
      alert('There was an error syncing with Google Sheets. The payment has been recorded locally.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const fetchPaymentsFromCloud = useCallback(async () => {
    setIsSyncing(true);
    setSyncError(null);
    try {
      console.log('Fetching payments from cloud via proxy...');
      
      // Use the local server proxy to bypass CORS
      const response = await fetch('/api/cloud/fetch');
      
      if (!response.ok) {
        let errMsg = `HTTP error! status: ${response.status}`;
        try {
          const errData = await response.clone().json();
          errMsg = errData.details ? `${errData.error}: ${errData.details}` : (errData.error || errMsg);
        } catch {
          const errText = await response.text().catch(() => '');
          if (errText) errMsg = `${errMsg} - ${errText.substring(0, 200)}`;
        }
        throw new Error(errMsg);
      }
      
      const data = await response.json();
      
      if (Array.isArray(data)) {
        console.log(`Successfully fetched ${data.length} records from cloud.`);
        processCloudData(data);
        setLastSyncTime(new Date().toLocaleTimeString());
      } else {
        console.warn('Cloud data is not an array:', data);
        throw new Error('Cloud data format is invalid (expected array).');
      }
    } catch (error: any) {
      console.error('Error fetching from cloud:', error);
      let msg = error.message || 'Failed to connect to cloud';
      
      // If the error message is from our proxy, it might have a 'details' field
      setSyncError(msg);
    } finally {
      setIsSyncing(false);
    }
  }, []);

  const processCloudData = (data: any[]) => {
    const normalizeMid = (mid: any) => String(mid || '').trim().toLowerCase().replace(/^0+/, '');
    
    const cloudPayments: PaymentRow[] = data.map(item => {
      // Handle potential key variations from Google Script (merchantId vs merchantID, etc.)
      const mid = item.merchantId || item.merchantID || item.mid || '';
      const ref = item.bankingReferenceNumber || item.receiptRef || item.referenceNumber || '';
      const date = item.dateOfPayment || item.date || '';
      const amount = item.amountPaid || item.amount || 0;
      const serials = item.serialNumbers || item.serial_numbers || '';
      
      return {
        receiptRef: String(ref).trim(),
        date: String(date).trim(),
        mid: normalizeMid(mid),
        amount: parseFloat(String(amount).replace(/[^0-9.]/g, '')),
        paymentType: 'Cloud Sync',
        notes: `Synced from Google Sheets. Credited to: ${item.creditedToAccount || 'N/A'}`,
        selectedSignatures: serials ? String(serials).split(',').map(s => s.trim()).filter(s => s) : []
      };
    }).filter(p => p.receiptRef && p.mid && p.amount > 0);

    setPayments(prev => {
      // Create a map of existing payments by receiptRef for faster lookup
      const existingMap = new Map<string, PaymentRow>(prev.map(p => [p.receiptRef.toLowerCase().trim(), p]));
      
      let addedCount = 0;
      let updatedCount = 0;
      const updatedPayments = [...prev];

      cloudPayments.forEach(cp => {
        const refKey = cp.receiptRef.toLowerCase().trim();
        const existing = existingMap.get(refKey);
        
        if (!existing) {
          updatedPayments.push(cp);
          addedCount++;
        } else if (!existing.mid && cp.mid) {
          // Update existing payment if it was missing the merchant ID
          const index = updatedPayments.findIndex(p => p.receiptRef.toLowerCase().trim() === refKey);
          if (index !== -1) {
            const current = updatedPayments[index];
            updatedPayments[index] = { ...current, mid: cp.mid, amount: cp.amount || current.amount };
            updatedCount++;
          }
        }
      });

      console.log(`Processed ${data.length} cloud records. Added ${addedCount}, updated ${updatedCount} payments.`);
      return updatedPayments;
    });
  };

  useEffect(() => {
    fetchPaymentsFromCloud();
  }, [fetchPaymentsFromCloud]);
  
  // Column mapping state
  const [columnMapping, setColumnMapping] = useState({
    signature: 'Signature',
    mid: 'MID',
    merchantName: 'Merchant Name',
    tid: 'TID',
    region: 'Region',
    dzongkhag: 'Dzongkha',
    contact: 'Contact'
  });

  const [availableColumns, setAvailableColumns] = useState<string[]>([]);

  const posData = useMemo(() => {
    if (rawPosData.length === 0) return [];
    
    const normalizeMid = (id: any) => String(id || '').trim().toLowerCase().replace(/^0+/, '');
    
    return rawPosData.map(row => ({
      signature: String(row[columnMapping.signature] || ''),
      mid: normalizeMid(row[columnMapping.mid]),
      merchantName: String(row[columnMapping.merchantName] || ''),
      tid: String(row[columnMapping.tid] || ''),
      region: row[columnMapping.region],
      dzongkhag: row[columnMapping.dzongkhag],
      contact: row[columnMapping.contact],
      ...row
    }));
  }, [rawPosData, columnMapping]);

  // --- File Upload Handlers ---

  const syncStockAssignments = useCallback(async (data: POSRow[]) => {
    if (data.length === 0) return;
    
    try {
      const assignments = data.map(row => ({
        serial: String(row.signature).trim().toUpperCase(),
        mid: row.mid,
        merchantName: row.merchantName,
        tid: row.tid
      }));

      const response = await fetch('/api/stock/sync-assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments })
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`Stock assignments synced: ${result.updated} updated, ${result.ignored} ignored.`);
        if (activeTab === 'stock') fetchStockData();
      }
    } catch (error) {
      console.error('Error syncing stock assignments:', error);
    }
  }, [activeTab, fetchStockData]);

  // Sync stock when posData changes
  useEffect(() => {
    if (posData.length > 0) {
      syncStockAssignments(posData);
    }
  }, [posData, syncStockAssignments]);

  const handlePOSUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'binary' });
      
      // Specifically look for "New POS LIST"
      const sheetName = wb.SheetNames.find(name => name.trim() === 'New POS LIST');
      if (!sheetName) {
        alert('Sheet "New POS LIST" not found in the Excel file.');
        return;
      }

      const ws = wb.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(ws) as any[];
      
      if (data.length > 0) {
        setAvailableColumns(Object.keys(data[0]));
        // Try to auto-map columns
        const newMapping = { ...columnMapping };
        const cols = Object.keys(data[0]);
        
        const findMatch = (key: string, patterns: string[]) => {
          return cols.find(c => patterns.some(p => c.toLowerCase().includes(p.toLowerCase())));
        };

        newMapping.signature = findMatch('signature', ['Signature', 'Serial', 'DX8000']) || cols[0];
        newMapping.mid = findMatch('mid', ['MID', 'Merchant ID']) || cols[1];
        newMapping.merchantName = findMatch('merchantName', ['Merchant Name', 'Name']) || cols[2];
        newMapping.tid = findMatch('tid', ['TID', 'Terminal ID']) || cols[3];
        newMapping.region = findMatch('region', ['Region', 'Zone', 'Area']) || cols[4] || '';
        newMapping.dzongkhag = findMatch('dzongkhag', ['Dzongkha', 'Dzongkhag', 'District']) || cols[5] || '';
        newMapping.contact = findMatch('contact', ['Contact', 'Phone', 'Mobile']) || cols[6] || '';
        
        setColumnMapping(newMapping);
        setRawPosData(data);
      }
    };
    reader.readAsBinaryString(file);
  };

  const handlePaymentUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        complete: (results) => {
          const data = results.data as any[];
          const normalizeMid = (id: any) => String(id || '').trim().toLowerCase().replace(/^0+/, '');
          const newPayments = data.map(row => ({
            receiptRef: String(row.ReceiptRef || row.receipt || '').trim(),
            date: String(row.Date || row.date || '').trim(),
            mid: normalizeMid(row.MID || row.mid),
            amount: parseFloat(String(row.Amount || row.amount || '0').replace(/[^0-9.]/g, '')),
            paymentType: row.PaymentType || row.type || 'CSV Import',
            notes: row.Notes || row.notes || ''
          })).filter(p => p.receiptRef);
          setPayments(prev => [...prev, ...newPayments]);
        }
      });
    } else {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws) as any[];
        const newPayments = data.map(row => ({
          receiptRef: String(row.ReceiptRef || row.receipt || ''),
          date: String(row.Date || row.date || ''),
          mid: String(row.MID || row.mid || ''),
          amount: parseFloat(row.Amount || row.amount || '0'),
          paymentType: String(row.PaymentType || row.type || ''),
          notes: String(row.Notes || row.notes || '')
        })).filter(p => p.receiptRef);
        setPayments(prev => [...prev, ...newPayments]);
      };
      reader.readAsBinaryString(file);
    }
  };

  // --- Logic & Calculations ---

  const merchantSummaries = useMemo(() => {
    if (posData.length === 0) return [];

    const groups: Record<string, MerchantSummary> = {};

    posData.forEach(row => {
      if (!row.mid) return;
      
      if (!groups[row.mid]) {
        groups[row.mid] = {
          mid: row.mid,
          merchantName: row.merchantName,
          terminalCount: 0,
          signatures: [],
          tids: [],
          region: row.region,
          dzongkhag: row.dzongkhag,
          contact: row.contact,
          expectedAmount: 0,
          paidAmount: 0,
          outstandingAmount: 0,
          status: 'UNPAID'
        };
      }

      // Count unique signatures
      if (!groups[row.mid].signatures.includes(row.signature)) {
        groups[row.mid].signatures.push(row.signature);
        groups[row.mid].terminalCount++;
      }
      
      if (!groups[row.mid].tids.includes(row.tid)) {
        groups[row.mid].tids.push(row.tid);
      }
    });

    // Calculate payments
    Object.values(groups).forEach(summary => {
      const normalizeMid = (mid: any) => String(mid || '').trim().toLowerCase().replace(/^0+/, '');
      const summaryMid = normalizeMid(summary.mid);

      summary.expectedAmount = summary.terminalCount * unitPrice;
      summary.paidAmount = payments
        .filter(p => {
          const pMid = normalizeMid(p.mid);
          return pMid === summaryMid && pMid !== '';
        })
        .reduce((sum, p) => sum + p.amount, 0);
      summary.outstandingAmount = summary.expectedAmount - summary.paidAmount;
      
      if (summary.outstandingAmount <= 0) {
        summary.status = 'PAID';
      } else if (summary.paidAmount > 0) {
        summary.status = 'PARTIAL';
      } else {
        summary.status = 'UNPAID';
      }
    });

    return Object.values(groups).sort((a, b) => b.terminalCount - a.terminalCount);
  }, [posData, payments, unitPrice]);

  const dataQualityIssues = useMemo(() => {
    const issues: DataQualityIssue[] = [];
    
    // 1. Missing Signature
    const missingSig = posData.filter(r => !r.signature);
    if (missingSig.length > 0) {
      issues.push({
        type: 'missing_signature',
        description: `${missingSig.length} rows are missing a Signature (Serial Number).`,
        severity: 'high',
        affectedRows: missingSig
      });
    }

    // 2. Missing MID
    const missingMid = posData.filter(r => !r.mid);
    if (missingMid.length > 0) {
      issues.push({
        type: 'missing_mid',
        description: `${missingMid.length} rows are missing a Merchant ID (MID).`,
        severity: 'high',
        affectedRows: missingMid
      });
    }

    // 3. Duplicate Signature Global Check (Any signature appearing more than once)
    const sigCounts: Record<string, number> = {};
    posData.forEach(r => {
      if (r.signature) {
        sigCounts[r.signature] = (sigCounts[r.signature] || 0) + 1;
      }
    });

    const globalDuplicates = Object.entries(sigCounts).filter(([_, count]) => count > 1);
    if (globalDuplicates.length > 0) {
      issues.push({
        type: 'duplicate_signature_conflict', // Reusing type or creating new one? Let's use a specific one if needed, but the user wants to know about uniqueness.
        description: `${globalDuplicates.length} Serial Numbers appear multiple times in the list.`,
        severity: 'high',
        affectedRows: globalDuplicates.map(([sig, count]) => ({ signature: sig, count }))
      });
    }

    // 4. Duplicate Signature under different MID (Conflict)
    const sigToMid: Record<string, Set<string>> = {};
    posData.forEach(r => {
      if (r.signature && r.mid) {
        if (!sigToMid[r.signature]) sigToMid[r.signature] = new Set();
        sigToMid[r.signature].add(r.mid);
      }
    });

    const conflicts = Object.entries(sigToMid).filter(([_, mids]) => mids.size > 1);
    if (conflicts.length > 0) {
      issues.push({
        type: 'duplicate_signature_conflict',
        description: `${conflicts.length} Serial Numbers are assigned to multiple different MIDs (Critical Conflict).`,
        severity: 'high',
        affectedRows: conflicts.map(([sig, mids]) => ({ signature: sig, mids: Array.from(mids) }))
      });
    }

    // 5. Duplicate MID with inconsistent merchant name
    const midToNames: Record<string, Set<string>> = {};
    posData.forEach(r => {
      if (r.mid && r.merchantName) {
        if (!midToNames[r.mid]) midToNames[r.mid] = new Set();
        midToNames[r.mid].add(r.merchantName);
      }
    });

    const nameInconsistencies = Object.entries(midToNames).filter(([_, names]) => names.size > 1);
    if (nameInconsistencies.length > 0) {
      issues.push({
        type: 'duplicate_mid_inconsistent_name',
        description: `${nameInconsistencies.length} MIDs have inconsistent Merchant Names.`,
        severity: 'medium',
        affectedRows: nameInconsistencies.map(([mid, names]) => ({ mid, names: Array.from(names) }))
      });
    }

    return issues;
  }, [posData]);

  const trackerResults = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return posData.filter(r => 
      r.signature.toLowerCase().includes(q) ||
      r.mid.toLowerCase().includes(q) ||
      r.merchantName.toLowerCase().includes(q) ||
      r.tid.toLowerCase().includes(q)
    );
  }, [posData, searchQuery]);

  // --- Export Functions ---

  const exportToExcel = (data: any[], fileName: string) => {
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  // --- UI Components ---

  const TabButton = ({ id, label, icon: Icon }: { id: Tab, label: string, icon: any }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={cn(
        "flex items-center gap-2 px-6 py-4 text-sm font-medium transition-all border-b-2",
        activeTab === id 
          ? "border-emerald-600 text-emerald-600 bg-emerald-50/50" 
          : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
      )}
    >
      <Icon size={18} />
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="bg-emerald-600 p-2 rounded-lg">
                <CreditCard className="text-white" size={24} />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-slate-900">BoB POS Tracker</h1>
                <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">Terminal & Payment Management</p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              {lastSyncTime && (
                <div className="hidden md:flex flex-col items-end">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                    <Cloud size={12} />
                    Cloud Synced
                  </div>
                  <p className="text-[10px] text-slate-400">Last: {lastSyncTime}</p>
                </div>
              )}
              {syncError && (
                <div className="hidden md:flex flex-col items-end">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-red-500 uppercase tracking-wider">
                    <AlertTriangle size={12} />
                    Sync Error
                  </div>
                  <p className="text-[10px] text-slate-400 truncate max-w-[200px]" title={syncError}>{syncError}</p>
                  <p className="text-[8px] text-slate-300 font-mono">
                    URL: server proxy
                  </p>
                </div>
              )}
              <div className="text-right hidden sm:block">
                <p className="text-xs text-slate-400 font-mono">v1.0.0</p>
                <p className="text-xs text-slate-500 font-medium">Bank of Bhutan Ltd.</p>
              </div>
            </div>
          </div>
        </div>
        
        {/* Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex overflow-x-auto no-scrollbar">
            <TabButton id="upload" label="Upload & Clean" icon={Upload} />
            <TabButton id="dashboard" label="Total Summary" icon={Settings2} />
            <TabButton id="summary" label="Merchant Summary" icon={TableIcon} />
            <TabButton id="tracker" label="Serial Tracker" icon={Search} />
            <TabButton id="stock" label="Stock Tracking" icon={Package} />
            <TabButton id="exports" label="Exports" icon={Download} />
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <AnimatePresence mode="wait">
          {/* UPLOAD & CLEAN TAB */}
          {activeTab === 'upload' && (
            <motion.div
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* POS List Upload */}
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <FileText size={20} />
                      </div>
                      <h2 className="text-lg font-semibold">Upload Master POS List</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={fetchPaymentsFromCloud}
                        disabled={isSyncing}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border",
                          isSyncing ? "bg-slate-100 text-slate-400 border-slate-200" : 
                          syncError ? "bg-red-50 text-red-600 border-red-100 hover:bg-red-100" :
                          "bg-emerald-50 text-emerald-700 border-emerald-100 hover:bg-emerald-100"
                        )}
                        title={syncError || "Fetch existing payments from Google Sheets"}
                      >
                        <RefreshCw size={14} className={cn(isSyncing && "animate-spin")} />
                        {isSyncing ? "Syncing..." : syncError ? "Retry Sync" : "Sync Cloud Payments"}
                      </button>
                      <button
                        onClick={() => setShowManualSyncModal(true)}
                        className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
                        title="Manual JSON Import"
                      >
                        <Settings2 size={14} />
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-slate-500 mb-6">
                    Upload the Excel file containing the <code className="bg-slate-100 px-1 rounded text-emerald-700">New POS LIST</code> sheet.
                  </p>
                  
                  <label className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:bg-slate-50 transition-colors">
                    <div className="flex flex-col items-center justify-center pt-5 pb-6">
                      <Upload className="text-slate-400 mb-3" size={32} />
                      <p className="text-sm text-slate-600">Click to upload or drag and drop</p>
                      <p className="text-xs text-slate-400 mt-1">Excel (.xlsx, .xls)</p>
                    </div>
                    <input type="file" className="hidden" accept=".xlsx,.xls" onChange={handlePOSUpload} />
                  </label>

                  {posData.length > 0 && (
                    <div className="mt-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center gap-3">
                      <CheckCircle2 className="text-emerald-600" size={20} />
                      <div>
                        <p className="text-sm font-semibold text-emerald-900">File Loaded Successfully</p>
                        <p className="text-xs text-emerald-700">{posData.length} rows processed from "New POS LIST"</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Column Mapping */}
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-amber-50 text-amber-600 rounded-lg">
                      <Settings2 size={20} />
                    </div>
                    <h2 className="text-lg font-semibold">Column Mapping</h2>
                  </div>
                  
                  {availableColumns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                      <Filter size={40} className="mb-4 opacity-20" />
                      <p className="text-sm">Upload a file to configure mapping</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {Object.entries(columnMapping).map(([key, value]) => (
                        <div key={key} className="flex items-center justify-between gap-4">
                          <label className="text-sm font-medium text-slate-600 capitalize w-1/3">
                            {key.replace(/([A-Z])/g, ' $1')}
                          </label>
                          <select
                            value={value}
                            onChange={(e) => setColumnMapping(prev => ({ ...prev, [key]: e.target.value }))}
                            className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                          >
                            {availableColumns.map(col => (
                              <option key={col} value={col}>{col}</option>
                            ))}
                          </select>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Data Quality Panel */}
              {posData.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-6 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <AlertTriangle className="text-amber-500" size={20} />
                      <h2 className="text-lg font-semibold">Data Quality Panel</h2>
                    </div>
                    <span className="px-3 py-1 bg-white border border-slate-200 rounded-full text-xs font-bold text-slate-500">
                      {dataQualityIssues.length} Issues Found
                    </span>
                  </div>
                  
                  <div className="divide-y divide-slate-100">
                    {dataQualityIssues.length === 0 ? (
                      <div className="p-12 text-center">
                        <CheckCircle2 className="mx-auto text-emerald-500 mb-3" size={48} />
                        <p className="text-slate-600 font-medium">No data quality issues detected!</p>
                      </div>
                    ) : (
                      dataQualityIssues.map((issue, idx) => (
                        <div key={idx} className="p-6 flex items-start gap-4 hover:bg-slate-50 transition-colors">
                          <div className={cn(
                            "p-2 rounded-lg shrink-0",
                            issue.severity === 'high' ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600"
                          )}>
                            <AlertTriangle size={18} />
                          </div>
                          <div className="flex-1">
                            <h3 className="text-sm font-bold text-slate-900 capitalize">{issue.type.replace(/_/g, ' ')}</h3>
                            <p className="text-sm text-slate-500 mt-1">{issue.description}</p>
                            
                            {/* Detailed view for conflicts */}
                            {issue.type === 'duplicate_signature_conflict' && (
                              <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {issue.affectedRows.slice(0, 4).map((row, i) => (
                                  <div key={i} className="text-xs p-2 bg-white border border-slate-200 rounded-lg">
                                    <span className="font-mono font-bold text-slate-700">{row.signature}</span>
                                    <div className="flex gap-1 mt-1">
                                      {row.mids.map((m: string) => (
                                        <span key={m} className="px-1.5 py-0.5 bg-slate-100 rounded text-slate-500">{m}</span>
                                      ))}
                                    </div>
                                  </div>
                                ))}
                                {issue.affectedRows.length > 4 && (
                                  <p className="text-xs text-slate-400 italic mt-1">...and {issue.affectedRows.length - 4} more</p>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="shrink-0">
                            <span className={cn(
                              "text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded-full",
                              issue.severity === 'high' ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                            )}>
                              {issue.severity}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* TOTAL SUMMARY (DASHBOARD) TAB */}
          {activeTab === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Key Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { label: 'Total Terminals', value: merchantSummaries.reduce((acc, s) => acc + s.terminalCount, 0), icon: CreditCard, color: 'blue' },
                  { label: 'Total Merchants', value: merchantSummaries.length, icon: TableIcon, color: 'emerald' },
                  { label: 'Total Expected', value: `BTN ${merchantSummaries.reduce((acc, s) => acc + s.expectedAmount, 0).toLocaleString()}`, icon: FileText, color: 'indigo' },
                  { label: 'Total Outstanding', value: `BTN ${merchantSummaries.reduce((acc, s) => acc + s.outstandingAmount, 0).toLocaleString()}`, icon: AlertTriangle, color: 'red' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <div className={cn("p-2 rounded-lg", stat.color === 'blue' ? "bg-blue-50 text-blue-600" : stat.color === 'emerald' ? "bg-emerald-50 text-emerald-600" : stat.color === 'indigo' ? "bg-indigo-50 text-indigo-600" : "bg-red-50 text-red-600")}>
                        <stat.icon size={20} />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                    <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Status Breakdown */}
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold mb-6">Payment Status Breakdown</h3>
                  <div className="space-y-6">
                    {[
                      { label: 'Fully Paid', count: merchantSummaries.filter(s => s.status === 'PAID').length, color: 'bg-emerald-500' },
                      { label: 'Partial Payment', count: merchantSummaries.filter(s => s.status === 'PARTIAL').length, color: 'bg-amber-500' },
                      { label: 'Unpaid', count: merchantSummaries.filter(s => s.status === 'UNPAID').length, color: 'bg-red-500' },
                    ].map((item, i) => {
                      const percentage = merchantSummaries.length > 0 ? (item.count / merchantSummaries.length) * 100 : 0;
                      return (
                        <div key={i}>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-slate-600">{item.label}</span>
                            <span className="text-sm font-bold text-slate-900">{item.count} ({percentage.toFixed(1)}%)</span>
                          </div>
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div className={cn("h-2 rounded-full", item.color)} style={{ width: `${percentage}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Regional Breakdown */}
                <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                  <h3 className="text-lg font-bold mb-6">Regional Distribution</h3>
                  <div className="max-h-[300px] overflow-y-auto pr-2 space-y-4">
                    {Object.entries(
                      merchantSummaries.reduce((acc, s) => {
                        const region = s.region || 'Unknown';
                        acc[region] = (acc[region] || 0) + s.terminalCount;
                        return acc;
                      }, {} as Record<string, number>)
                    )
                    .sort((a, b) => (b[1] as number) - (a[1] as number))
                    .map(([region, count], i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                        <span className="text-sm font-medium text-slate-700">{region}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-slate-400">{count} Terminals</span>
                          <div className="w-24 bg-slate-200 rounded-full h-1.5">
                            <div 
                              className="bg-emerald-500 h-1.5 rounded-full" 
                              style={{ width: `${((count as number) / (merchantSummaries.reduce((acc, s) => acc + s.terminalCount, 0) || 1)) * 100}%` }} 
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Data Quality Overview */}
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-lg font-bold mb-6">System Health & Data Quality</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Duplicate Serials</p>
                    <p className={cn("text-2xl font-bold", dataQualityIssues.some(i => i.description.includes('appear multiple times')) ? "text-red-600" : "text-emerald-600")}>
                      {dataQualityIssues.find(i => i.description.includes('appear multiple times'))?.affectedRows.length || 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Non-unique serial numbers</p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">MID Conflicts</p>
                    <p className={cn("text-2xl font-bold", dataQualityIssues.some(i => i.description.includes('multiple different MIDs')) ? "text-red-600" : "text-emerald-600")}>
                      {dataQualityIssues.find(i => i.description.includes('multiple different MIDs'))?.affectedRows.length || 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Serial assigned to &gt;1 MID</p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Missing Info</p>
                    <p className={cn("text-2xl font-bold", dataQualityIssues.some(i => i.type === 'missing_signature' || i.type === 'missing_mid') ? "text-amber-600" : "text-emerald-600")}>
                      {(dataQualityIssues.find(i => i.type === 'missing_signature')?.affectedRows.length || 0) + 
                       (dataQualityIssues.find(i => i.type === 'missing_mid')?.affectedRows.length || 0)}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Rows with missing data</p>
                  </div>
                  <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Inconsistencies</p>
                    <p className={cn("text-2xl font-bold", dataQualityIssues.some(i => i.type === 'duplicate_mid_inconsistent_name') ? "text-amber-600" : "text-emerald-600")}>
                      {dataQualityIssues.find(i => i.type === 'duplicate_mid_inconsistent_name')?.affectedRows.length || 0}
                    </p>
                    <p className="text-xs text-slate-500 mt-1">Name mismatches</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* MERCHANT SUMMARY TAB */}
          {activeTab === 'summary' && (
            <motion.div
              key="summary"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 mb-2">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">Merchant → Machines Report</h2>
                  <p className="text-sm text-slate-500">Grouped by MID with terminal counts and payment status.</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  {/* Payment Controls Integrated */}
                  <div className="flex items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex items-center gap-2 px-3 border-r border-slate-100">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Unit Price:</span>
                      <input 
                        type="number"
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(Number(e.target.value))}
                        className="w-20 text-xs font-bold text-emerald-600 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={fetchPaymentsFromCloud}
                      disabled={isSyncing}
                      className={cn(
                        "p-2 rounded-lg transition-all",
                        isSyncing ? "bg-slate-100 text-slate-400" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                      )}
                      title="Sync Cloud Payments"
                    >
                      <RefreshCw size={16} className={cn(isSyncing && "animate-spin")} />
                    </button>
                    <label className="p-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-all cursor-pointer" title="Import Payment File">
                      <Upload size={16} />
                      <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={handlePaymentUpload} />
                    </label>
                    <button 
                      onClick={() => { if(confirm('Clear all recorded payments?')) setPayments([]); }}
                      className="p-2 bg-red-50 text-red-500 rounded-lg hover:bg-red-100 transition-all"
                      title="Clear All Payments"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <button 
                    onClick={() => exportToExcel(merchantSummaries, 'Merchant_Summary_Report')}
                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    <Download size={16} />
                    Export Report
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Merchant / MID</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Terminals</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Region / Dzongkhag</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Outstanding</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {merchantSummaries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-6 py-12 text-center text-slate-400 italic">No data available. Please upload a file first.</td>
                        </tr>
                      ) : (
                        merchantSummaries.map((summary) => (
                          <tr key={summary.mid} className="hover:bg-slate-50/50 transition-colors group">
                            <td className="px-6 py-4">
                              <div className="font-bold text-slate-900">{summary.merchantName}</div>
                              <div className="text-xs font-mono text-slate-500 mt-0.5">{summary.mid}</div>
                            </td>
                            <td className="px-6 py-4 text-center">
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-700 font-bold text-sm">
                                {summary.terminalCount}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="text-sm text-slate-600">{summary.region || 'N/A'}</div>
                              <div className="text-xs text-slate-400">{summary.dzongkhag || ''}</div>
                            </td>
                            <td className="px-6 py-4">
                              <div className={cn(
                                "text-sm font-bold",
                                summary.outstandingAmount > 0 ? "text-red-600" : "text-emerald-600"
                              )}>
                                BTN {summary.outstandingAmount.toLocaleString()}
                              </div>
                              <div className="text-[10px] text-slate-400 uppercase font-bold">Expected: {summary.expectedAmount}</div>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                summary.status === 'PAID' ? "bg-emerald-100 text-emerald-700" :
                                summary.status === 'PARTIAL' ? "bg-amber-100 text-amber-700" :
                                "bg-red-100 text-red-700"
                              )}>
                                {summary.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-right">
                              <button 
                                onClick={() => setSelectedMerchantMid(summary.mid)}
                                className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                              >
                                <ChevronRight size={18} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* SERIAL TRACKER TAB */}
          {activeTab === 'tracker' && (
            <motion.div
              key="tracker"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="space-y-6"
            >
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                <h2 className="text-2xl font-bold text-slate-900 mb-2">Serial Tracker</h2>
                <p className="text-sm text-slate-500 mb-8">Search for specific terminals, MIDs, or merchants to identify conflicts or duplicates.</p>
                
                <div className="relative max-w-2xl">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input
                    type="text"
                    placeholder="Enter Signature (Serial), MID, Merchant Name, or TID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 text-lg"
                  />
                </div>
              </div>

              {searchQuery && (
                <div className="space-y-4">
                  <p className="text-sm font-medium text-slate-500 px-2">
                    Found {trackerResults.length} matching records
                  </p>
                  
                  <div className="grid grid-cols-1 gap-4">
                    {trackerResults.map((row, idx) => (
                      <div key={idx} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:border-emerald-200 transition-all flex flex-col md:flex-row md:items-center justify-between gap-6">
                        <div className="flex items-start gap-4">
                          <div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
                            <FileText size={24} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-lg font-bold text-slate-900">{row.merchantName}</h3>
                              <span className="px-2 py-0.5 bg-slate-100 rounded text-[10px] font-bold text-slate-500 uppercase tracking-widest">MID: {row.mid}</span>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-1 mt-2">
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold">Signature (Serial)</p>
                                <p className="text-sm font-mono font-bold text-emerald-700">{row.signature}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold">TID</p>
                                <p className="text-sm font-mono text-slate-600">{row.tid}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold">Region</p>
                                <p className="text-sm text-slate-600">{row.region || 'N/A'}</p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 uppercase font-bold">Contact</p>
                                <p className="text-sm text-slate-600">{row.contact || 'N/A'}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Conflict Check */}
                        {posData.filter(r => r.signature === row.signature && r.mid !== row.mid).length > 0 && (
                          <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-center gap-3">
                            <AlertTriangle className="text-red-500" size={20} />
                            <div>
                              <p className="text-xs font-bold text-red-700">Conflict Detected</p>
                              <p className="text-[10px] text-red-600">This serial number is also assigned to another MID.</p>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* STOCK TRACKING TAB */}
          {activeTab === 'stock' && (
            <motion.div
              key="stock"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Stats Dashboard */}
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                {[
                  { label: 'Total Procured', value: stockStats?.total || 0, icon: Package, color: 'bg-blue-50 text-blue-600' },
                  { label: 'In Stock', value: stockStats?.in_stock || 0, icon: ShieldCheck, color: 'bg-emerald-50 text-emerald-600' },
                  { label: 'Issued', value: stockStats?.issued || 0, icon: ArrowUpRight, color: 'bg-orange-50 text-orange-600' },
                  { label: 'Returned', value: stockStats?.returned || 0, icon: ArrowDownLeft, color: 'bg-indigo-50 text-indigo-600' },
                  { label: 'Faulty/Scrapped', value: (stockStats?.faulty || 0) + (stockStats?.scrapped || 0), icon: ShieldAlert, color: 'bg-red-50 text-red-600' },
                ].map((stat, i) => (
                  <div key={i} className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                    <div className={cn("p-2 rounded-lg w-fit mb-3", stat.color)}>
                      <stat.icon size={20} />
                    </div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{stat.label}</p>
                    <p className="text-2xl font-bold text-slate-900">{stat.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {/* Cloud Stock Sync */}
              <div className="bg-white p-8 rounded-2xl border border-emerald-200 bg-emerald-50/20 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">Master Stock Sync</h2>
                    <p className="text-sm text-slate-500">Fetch the latest terminal inventory from your Google Sheet (Stock sheet).</p>
                  </div>
                  <button 
                    onClick={syncStockFromCloud}
                    disabled={isSyncingStock}
                    className={cn(
                      "px-6 py-3 rounded-xl font-bold transition-all shadow-lg flex items-center gap-2",
                      isSyncingStock ? "bg-slate-100 text-slate-400" : "bg-emerald-600 text-white hover:bg-emerald-700"
                    )}
                  >
                    <RefreshCw size={18} className={cn(isSyncingStock && "animate-spin")} />
                    {isSyncingStock ? "Syncing Stock..." : "Sync Master Stock"}
                  </button>
                </div>
              </div>

              {/* Terminals List */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-4">
                    <h3 className="text-lg font-bold">Terminal Inventory</h3>
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                      {['', 'IN_STOCK', 'ISSUED', 'RETURNED'].map((s) => (
                        <button
                          key={s}
                          onClick={() => setStockStatusFilter(s)}
                          className={cn(
                            "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                            stockStatusFilter === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          {s || 'All'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input 
                        type="text"
                        placeholder="Search Serial/MID..."
                        value={stockSearch}
                        onChange={(e) => setStockSearch(e.target.value)}
                        className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500 w-64"
                      />
                    </div>
                    {isAdmin && (
                      <button 
                        onClick={handleResetStock}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-all"
                        title="Reset Inventory System"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Serial Number</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Current Assignment</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Payment Status</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider">Last Updated</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {isStockLoading ? (
                        <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">Loading inventory...</td></tr>
                      ) : terminals.length === 0 ? (
                        <tr><td colSpan={5} className="px-6 py-12 text-center text-slate-400">No terminals found matching your criteria.</td></tr>
                      ) : (
                        terminals.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-6 py-4">
                              <p className="text-sm font-mono font-bold text-slate-900">{t.serial_number}</p>
                              <p className="text-[10px] text-slate-400">{t.batch_name}</p>
                            </td>
                            <td className="px-6 py-4">
                              <span className={cn(
                                "px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider",
                                t.status === 'IN_STOCK' ? "bg-emerald-50 text-emerald-600" :
                                t.status === 'ISSUED' ? "bg-orange-50 text-orange-600" :
                                t.status === 'RETURNED' ? "bg-indigo-50 text-indigo-600" :
                                "bg-slate-100 text-slate-500"
                              )}>
                                {t.status.replace('_', ' ')}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {t.mid ? (
                                <div>
                                  <p className="text-sm font-bold text-slate-700">{t.merchant_name}</p>
                                  <p className="text-[10px] text-slate-400">MID: {t.mid} | TID: {t.tid}</p>
                                </div>
                              ) : (
                                <span className="text-xs text-slate-300 italic">In Office</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              {t.mid ? (() => {
                                const summary = merchantSummaries.find(s => String(s.mid).trim().toLowerCase().replace(/^0+/, '') === String(t.mid).trim().toLowerCase().replace(/^0+/, ''));
                                if (!summary) return <span className="text-[10px] text-slate-400">No Data</span>;
                                return (
                                  <span className={cn(
                                    "px-2 py-0.5 rounded text-[10px] font-bold uppercase",
                                    summary.status === 'PAID' ? "bg-emerald-100 text-emerald-700" :
                                    summary.status === 'PARTIAL' ? "bg-orange-100 text-orange-700" :
                                    "bg-red-100 text-red-700"
                                  )}>
                                    {summary.status}
                                  </span>
                                );
                              })() : (
                                <span className="text-[10px] text-slate-300">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs text-slate-500">
                              {new Date(t.updated_at).toLocaleDateString()}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {t.status === 'IN_STOCK' || t.status === 'RETURNED' ? (
                                <button 
                                  onClick={() => { setSelectedTerminal(t); setShowIssueModal(true); }}
                                  className="px-3 py-1 bg-emerald-600 text-white rounded-md text-[10px] font-bold hover:bg-emerald-700 transition-all"
                                >
                                  Issue
                                </button>
                              ) : t.status === 'ISSUED' ? (
                                <button 
                                  onClick={() => { setSelectedTerminal(t); setShowReturnModal(true); }}
                                  className="px-3 py-1 bg-indigo-600 text-white rounded-md text-[10px] font-bold hover:bg-indigo-700 transition-all"
                                >
                                  Return
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* EXPORTS TAB */}
          {activeTab === 'exports' && (
            <motion.div
              key="exports"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-3xl mx-auto space-y-8"
            >
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-slate-900">Export Center</h2>
                <p className="text-slate-500 mt-2">Generate and download reports for your records.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <button 
                  onClick={() => exportToExcel(merchantSummaries.filter(s => s.outstandingAmount > 0), 'Outstanding_Payments_Report')}
                  className="flex flex-col items-center p-8 bg-white border border-slate-200 rounded-2xl hover:border-red-200 hover:bg-red-50/30 transition-all group"
                >
                  <div className="p-4 bg-red-50 text-red-600 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                    <XCircle size={32} />
                  </div>
                  <h3 className="font-bold text-slate-900">Outstanding List</h3>
                  <p className="text-xs text-slate-500 mt-1 text-center">Merchants with unpaid or partial balances.</p>
                </button>

                <button 
                  onClick={() => exportToExcel(merchantSummaries.filter(s => s.status === 'PAID'), 'Fully_Paid_Merchants_Report')}
                  className="flex flex-col items-center p-8 bg-white border border-slate-200 rounded-2xl hover:border-emerald-200 hover:bg-emerald-50/30 transition-all group"
                >
                  <div className="p-4 bg-emerald-50 text-emerald-600 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                    <CheckCircle2 size={32} />
                  </div>
                  <h3 className="font-bold text-slate-900">Paid List</h3>
                  <p className="text-xs text-slate-500 mt-1 text-center">Merchants who have cleared all dues.</p>
                </button>

                <button 
                  onClick={() => exportToExcel(merchantSummaries, 'Full_Merchant_Report')}
                  className="flex flex-col items-center p-8 bg-white border border-slate-200 rounded-2xl hover:border-blue-200 hover:bg-blue-50/30 transition-all group sm:col-span-2"
                >
                  <div className="p-4 bg-blue-50 text-blue-600 rounded-2xl mb-4 group-hover:scale-110 transition-transform">
                    <TableIcon size={32} />
                  </div>
                  <h3 className="font-bold text-slate-900">Full Merchant Summary</h3>
                  <p className="text-xs text-slate-500 mt-1 text-center">Complete report including terminal counts and payment status.</p>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-8 mt-12">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <p className="text-sm text-slate-400">© 2026 Bank of Bhutan Ltd. POS Terminal Tracking System.</p>
          <div className="flex justify-center gap-6 mt-4">
            <a href="#" className="text-xs text-slate-400 hover:text-emerald-600 transition-colors">Privacy Policy</a>
            <a href="#" className="text-xs text-slate-400 hover:text-emerald-600 transition-colors">Terms of Service</a>
            <a href="#" className="text-xs text-slate-400 hover:text-emerald-600 transition-colors">Support</a>
          </div>
        </div>
      </footer>

      {/* Merchant Detail Modal */}
      <AnimatePresence>
        {selectedMerchantMid && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedMerchantMid(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              {/* Modal Header */}
              <div className="p-6 border-b border-slate-100 flex justify-between items-start bg-slate-50/50">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900">
                    {merchantSummaries.find(s => s.mid === selectedMerchantMid)?.merchantName}
                  </h2>
                  <p className="text-sm font-mono text-slate-500 mt-1">MID: {selectedMerchantMid}</p>
                </div>
                <button
                  onClick={() => setSelectedMerchantMid(null)}
                  className="p-2 hover:bg-white rounded-xl transition-colors text-slate-400 hover:text-slate-600 shadow-sm"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Terminals</p>
                    <p className="text-xl font-bold text-slate-900">
                      {merchantSummaries.find(s => s.mid === selectedMerchantMid)?.terminalCount}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Total Paid</p>
                    <p className="text-xl font-bold text-emerald-600">
                      BTN {merchantSummaries.find(s => s.mid === selectedMerchantMid)?.paidAmount.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Outstanding</p>
                    <p className={cn(
                      "text-xl font-bold",
                      (merchantSummaries.find(s => s.mid === selectedMerchantMid)?.outstandingAmount || 0) > 0 ? "text-red-600" : "text-emerald-600"
                    )}>
                      BTN {merchantSummaries.find(s => s.mid === selectedMerchantMid)?.outstandingAmount.toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Terminal List */}
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                      <CreditCard size={16} className="text-slate-400" />
                      Assigned Terminals
                    </h3>
                    <div className="space-y-2">
                      {posData
                        .filter(r => String(r.mid).trim() === String(selectedMerchantMid).trim())
                        .map((terminal, idx) => {
                          const isPaid = payments.some(p => 
                            String(p.mid).trim() === String(terminal.mid).trim() && 
                            p.selectedSignatures?.includes(terminal.signature)
                          );
                          return (
                            <div key={idx} className="p-3 bg-white border border-slate-100 rounded-xl flex justify-between items-center shadow-sm">
                              <div>
                                <p className="text-xs font-mono font-bold text-slate-700">{terminal.signature}</p>
                                <p className="text-[10px] text-slate-400">TID: {terminal.tid}</p>
                              </div>
                              <div className="text-right flex flex-col items-end gap-1">
                                {isPaid ? (
                                  <span className="px-2 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-bold rounded-full flex items-center gap-1">
                                    <CheckCircle2 size={10} /> PAID
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 bg-slate-50 text-slate-400 text-[10px] font-bold rounded-full">
                                    UNPAID
                                  </span>
                                )}
                                <p className="text-[10px] text-slate-400">{terminal.region || 'No Region'}</p>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {/* Payment History */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <CreditCard size={16} className="text-slate-400" />
                        Record Manual Payment
                      </h3>
                      <div className="p-6 bg-emerald-50/50 border border-emerald-100 rounded-2xl space-y-4">
                        <div className="space-y-3">
                          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Select Terminals to Pay For</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 bg-white border border-slate-200 rounded-xl">
                            {posData
                              .filter(r => String(r.mid).trim() === String(selectedMerchantMid).trim())
                              .map((terminal) => {
                                const isAlreadyPaid = payments.some(p => 
                                  String(p.mid).trim() === String(terminal.mid).trim() && 
                                  p.selectedSignatures?.includes(terminal.signature)
                                );
                                return (
                                  <label key={terminal.signature} className={cn(
                                    "flex items-center gap-3 p-2 rounded-lg border transition-all cursor-pointer",
                                    isAlreadyPaid ? "bg-slate-50 border-slate-100 opacity-50 cursor-not-allowed" : 
                                    manualSignatures.includes(terminal.signature) ? "bg-emerald-50 border-emerald-200" : "bg-white border-slate-100 hover:border-slate-300"
                                  )}>
                                    <input 
                                      type="checkbox"
                                      disabled={isAlreadyPaid}
                                      checked={manualSignatures.includes(terminal.signature)}
                                      onChange={(e) => {
                                        if (e.target.checked) {
                                          const newSigs = [...manualSignatures, terminal.signature];
                                          setManualSignatures(newSigs);
                                          setManualQuantity(newSigs.length);
                                          setManualAmount((newSigs.length * 16825).toString());
                                        } else {
                                          const newSigs = manualSignatures.filter(s => s !== terminal.signature);
                                          setManualSignatures(newSigs);
                                          setManualQuantity(newSigs.length);
                                          setManualAmount((newSigs.length * 16825).toString());
                                        }
                                      }}
                                      className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-mono font-bold text-slate-700 truncate">{terminal.signature}</p>
                                      <p className="text-[10px] text-slate-400 truncate">TID: {terminal.tid}</p>
                                    </div>
                                    {isAlreadyPaid && <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />}
                                  </label>
                                );
                              })}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Selected Quantity</label>
                            <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-700 font-bold">
                              {manualSignatures.length} Terminal(s)
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Amount (Auto-calculated)</label>
                            <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-700 font-bold">
                              BTN {(manualSignatures.length * 16825).toLocaleString()}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Reference Number</label>
                            <input 
                              type="text"
                              value={manualRef}
                              onChange={(e) => setManualRef(e.target.value)}
                              placeholder="Ref #"
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Payment Date</label>
                            <input 
                              type="date"
                              value={manualDate}
                              onChange={(e) => setManualDate(e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 gap-4">
                          <div>
                            <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Credited To</label>
                            <div className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-lg text-sm text-slate-600 font-mono">
                              202959988
                            </div>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleManualPayment(selectedMerchantMid!)}
                          disabled={isSubmitting}
                          className={cn(
                            "w-full py-2 text-white rounded-lg text-sm font-bold transition-all shadow-sm flex items-center justify-center gap-2",
                            isSubmitting ? "bg-slate-400 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-700"
                          )}
                        >
                          {isSubmitting ? (
                            <>
                              <RefreshCw size={16} className="animate-spin" />
                              Submitting to Cloud...
                            </>
                          ) : (
                            "Confirm & Update Status"
                          )}
                        </button>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                        <FileText size={16} className="text-slate-400" />
                        Payment History
                      </h3>
                      <div className="space-y-2">
                        {payments
                          .filter(p => p.mid === selectedMerchantMid)
                          .map((payment, idx) => (
                            <div key={idx} className="p-3 bg-white border border-slate-100 rounded-xl flex justify-between items-center shadow-sm">
                              <div>
                                <p className="text-xs font-bold text-slate-700">{payment.paymentType}</p>
                                <p className="text-[10px] text-slate-400">{payment.date}</p>
                                {payment.notes && <p className="text-[9px] text-emerald-600 font-medium">{payment.notes}</p>}
                              </div>
                              <div className="text-right">
                                <p className="text-xs font-bold text-emerald-600">BTN {payment.amount.toLocaleString()}</p>
                                <p className="text-[10px] font-mono text-slate-400">{payment.receiptRef}</p>
                              </div>
                            </div>
                          ))}
                        {payments.filter(p => p.mid === selectedMerchantMid).length === 0 && (
                          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                            <p className="text-xs text-slate-400">No payment records found.</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Issue Modal */}
      {showIssueModal && selectedTerminal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-600 text-white">
              <h3 className="text-lg font-bold">Issue Terminal</h3>
              <button onClick={() => setShowIssueModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleIssueTerminal({
                serial_number: selectedTerminal.serial_number,
                mid: formData.get('mid'),
                merchant_name: formData.get('merchant_name'),
                tid: formData.get('tid'),
                issue_date: formData.get('issue_date'),
                issued_by: formData.get('issued_by'),
                notes: formData.get('notes')
              });
            }} className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Issuing Serial</p>
                <p className="text-sm font-mono font-bold text-emerald-700">{selectedTerminal.serial_number}</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Merchant ID (MID)</label>
                  <input name="mid" required className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Terminal ID (TID)</label>
                  <input name="tid" required className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Merchant Name</label>
                <input name="merchant_name" required className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Issue Date</label>
                  <input name="issue_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Issued By</label>
                  <input name="issued_by" required className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Notes</label>
                <textarea name="notes" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-emerald-500 h-20" />
              </div>
              <button type="submit" className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg">
                Confirm Issuance
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Return Modal */}
      {showReturnModal && selectedTerminal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-600 text-white">
              <h3 className="text-lg font-bold">Return Terminal</h3>
              <button onClick={() => setShowReturnModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              handleReturnTerminal({
                serial_number: selectedTerminal.serial_number,
                return_date: formData.get('return_date'),
                notes: formData.get('notes')
              });
            }} className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Returning Serial</p>
                <p className="text-sm font-mono font-bold text-indigo-700">{selectedTerminal.serial_number}</p>
                <p className="text-[10px] text-slate-400 mt-1">Currently with: {selectedTerminal.merchant_name} (MID: {selectedTerminal.mid})</p>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Return Date</label>
                <input name="return_date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Return Reason / Notes</label>
                <textarea name="notes" placeholder="e.g., Merchant closed, faulty battery, etc." className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-indigo-500 h-32" />
              </div>
              <button type="submit" className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg">
                Process Return
              </button>
            </form>
          </motion.div>
        </div>
      )}

      {/* Manual Sync Modal */}
      {showManualSyncModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden"
          >
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-800 text-white">
              <h3 className="text-lg font-bold">Manual JSON Import</h3>
              <button onClick={() => setShowManualSyncModal(false)}><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-500">
                If the automatic sync fails, you can paste the JSON data from your Google Sheet here. 
                Open your Google Script URL in a browser, copy the JSON result, and paste it below.
              </p>
              <textarea 
                value={manualSyncJson}
                onChange={(e) => setManualSyncJson(e.target.value)}
                placeholder='Paste JSON array here... e.g. [{"merchantId": "123", ...}]'
                className="w-full h-64 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-slate-500"
              />
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowManualSyncModal(false)}
                  className="flex-1 py-3 border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => {
                    try {
                      const data = JSON.parse(manualSyncJson);
                      if (Array.isArray(data)) {
                        processCloudData(data);
                        setLastSyncTime(new Date().toLocaleTimeString());
                        setShowManualSyncModal(false);
                        setManualSyncJson('');
                        alert(`Successfully imported ${data.length} records manually.`);
                      } else {
                        alert('Invalid format: Data must be a JSON array.');
                      }
                    } catch (e) {
                      alert('Invalid JSON: Please check the format of your pasted data.');
                    }
                  }}
                  className="flex-1 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition-all shadow-lg"
                >
                  Import Data
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
