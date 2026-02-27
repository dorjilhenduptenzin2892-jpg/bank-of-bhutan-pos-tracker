export interface POSRow {
  signature: string; // Serial Number
  mid: string;
  merchantName: string;
  tid: string;
  region?: string;
  dzongkhag?: string;
  contact?: string;
  [key: string]: any;
}

export interface PaymentRow {
  receiptRef: string;
  date: string;
  mid: string;
  amount: number;
  paymentType: string;
  notes?: string;
  selectedSignatures?: string[];
}

export interface MerchantSummary {
  mid: string;
  merchantName: string;
  terminalCount: number;
  signatures: string[];
  tids: string[];
  region?: string;
  dzongkhag?: string;
  contact?: string;
  expectedAmount: number;
  paidAmount: number;
  outstandingAmount: number;
  status: 'PAID' | 'UNPAID' | 'PARTIAL';
}

export interface DataQualityIssue {
  type: 'missing_signature' | 'missing_mid' | 'duplicate_signature_conflict' | 'duplicate_mid_inconsistent_name';
  description: string;
  severity: 'high' | 'medium' | 'low';
  affectedRows: any[];
}
