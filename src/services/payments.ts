// Local, browser-only payment ledger.
// Every successful subscription purchase appends a record here so the admin
// dashboard can show payment history and revenue. In production this would be
// backed by the Razorpay webhook / server instead of localStorage.

export interface PaymentRecord {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  /** Razorpay payment id (or a synthetic id for demo payments). */
  razorpayPaymentId: string;
  status: 'captured' | 'failed';
  /** Where the payment came from — real checkout or the local demo flow. */
  method: 'razorpay' | 'demo';
  createdAt: number;
}

const PAYMENTS_KEY = 'pdfpro.payments';

function read(): PaymentRecord[] {
  try {
    const raw = localStorage.getItem(PAYMENTS_KEY);
    return raw ? (JSON.parse(raw) as PaymentRecord[]) : [];
  } catch {
    return [];
  }
}

function write(records: PaymentRecord[]): void {
  try {
    localStorage.setItem(PAYMENTS_KEY, JSON.stringify(records));
  } catch {
    /* storage unavailable — ignore in demo */
  }
}

export function listPayments(): PaymentRecord[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function recordPayment(
  input: Omit<PaymentRecord, 'id' | 'createdAt'>,
): PaymentRecord {
  const record: PaymentRecord = {
    ...input,
    id: 'pay-rec-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    createdAt: Date.now(),
  };
  const all = read();
  all.push(record);
  write(all);
  return record;
}

export function clearPayments(): void {
  write([]);
}

/** Total captured revenue, grouped by currency. */
export function revenueByCurrency(): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const p of read()) {
    if (p.status !== 'captured') continue;
    totals[p.currency] = (totals[p.currency] ?? 0) + p.amount;
  }
  return totals;
}
