import type { Queryable } from '../db/index.js';

/**
 * Payment ledger. Rows are written the moment an order is created (status
 * 'created') and updated once the Razorpay signature verifies. Nothing here
 * trusts a value that came from the browser: the amount and plan are copied
 * from the server-side catalogue, not from the request.
 */

export type PaymentStatus = 'created' | 'captured' | 'failed' | 'refunded';
export type PaymentProvider = 'razorpay' | 'demo';

export interface PaymentRow {
  id: string;
  user_id: string;
  plan_id: string;
  plan_name: string;
  amount: number;
  currency: string;
  provider: PaymentProvider;
  status: PaymentStatus;
  razorpay_order_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_signature: string | null;
  created_at: Date | string;
  captured_at: Date | string | null;
  user_name?: string;
  user_email?: string;
}

/** Mirrors the shape the existing admin payment table already renders. */
export interface PaymentDto {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  planId: string;
  planName: string;
  amount: number;
  currency: string;
  razorpayPaymentId: string;
  status: PaymentStatus;
  method: PaymentProvider;
  createdAt: number;
}

const SELECT_PAYMENTS = `
  SELECT p.id, p.user_id, p.plan_id, p.plan_name, p.amount::double precision AS amount,
         p.currency, p.provider, p.status, p.razorpay_order_id,
         p.razorpay_payment_id, p.razorpay_signature, p.created_at, p.captured_at,
         u.name AS user_name, u.email AS user_email
  FROM payments p
  JOIN users u ON u.id = p.user_id
`;

export function toPaymentDto(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name ?? '',
    userEmail: row.user_email ?? '',
    planId: row.plan_id,
    planName: row.plan_name,
    amount: Number(row.amount ?? 0),
    currency: row.currency,
    razorpayPaymentId: row.razorpay_payment_id ?? row.razorpay_order_id ?? row.id,
    status: row.status,
    method: row.provider,
    createdAt: new Date(row.created_at).getTime(),
  };
}

export async function createPendingOrder(
  db: Queryable,
  input: {
    id: string;
    userId: string;
    planId: string;
    planName: string;
    amount: number;
    currency: string;
    provider: PaymentProvider;
    status?: PaymentStatus;
    orderId?: string;
  },
): Promise<PaymentRow> {
  const { rows } = await db.query<PaymentRow>(
    `INSERT INTO payments (id, user_id, plan_id, plan_name, amount, currency, provider, status, razorpay_order_id, captured_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $8 = 'captured' THEN now() ELSE NULL END)
     RETURNING id, user_id, plan_id, plan_name, amount::double precision AS amount, currency,
               provider, status, razorpay_order_id, razorpay_payment_id,
               razorpay_signature, created_at, captured_at`,
    [
      input.id,
      input.userId,
      input.planId,
      input.planName,
      input.amount,
      input.currency,
      input.provider,
      input.status ?? 'created',
      input.orderId ?? null,
    ],
  );
  const row = rows[0];
  if (!row) throw new Error('Failed to create order.');
  return row;
}

/** Scoped to the user so one account can never confirm another's order. */
export async function findOrderForUser(db: Queryable, orderId: string, userId: string): Promise<PaymentRow | null> {
  const { rows } = await db.query<PaymentRow>(
    `${SELECT_PAYMENTS} WHERE p.razorpay_order_id = $1 AND p.user_id = $2 LIMIT 1`,
    [orderId, userId],
  );
  return rows[0] ?? null;
}

export async function findByPaymentId(db: Queryable, paymentId: string): Promise<PaymentRow | null> {
  const { rows } = await db.query<PaymentRow>(
    `${SELECT_PAYMENTS} WHERE p.razorpay_payment_id = $1 LIMIT 1`,
    [paymentId],
  );
  return rows[0] ?? null;
}

export async function markCaptured(
  db: Queryable,
  orderId: string,
  paymentId: string,
  signature: string | null,
): Promise<PaymentRow | null> {
  const { rows } = await db.query<PaymentRow>(
    `UPDATE payments
        SET status = 'captured', razorpay_payment_id = $2, razorpay_signature = $3, captured_at = now()
      WHERE razorpay_order_id = $1
      RETURNING id, user_id, plan_id, plan_name, amount::double precision AS amount, currency,
                provider, status, razorpay_order_id, razorpay_payment_id,
                razorpay_signature, created_at, captured_at`,
    [orderId, paymentId, signature],
  );
  return rows[0] ?? null;
}

export async function markFailed(db: Queryable, orderId: string): Promise<void> {
  await db.query(`UPDATE payments SET status = 'failed' WHERE razorpay_order_id = $1`, [orderId]);
}

export async function listForUser(db: Queryable, userId: string): Promise<PaymentDto[]> {
  const { rows } = await db.query<PaymentRow>(
    `${SELECT_PAYMENTS} WHERE p.user_id = $1 ORDER BY p.created_at DESC`,
    [userId],
  );
  return rows.map(toPaymentDto);
}

export async function listAll(db: Queryable): Promise<PaymentDto[]> {
  const { rows } = await db.query<PaymentRow>(`${SELECT_PAYMENTS} ORDER BY p.created_at DESC`);
  return rows.map(toPaymentDto);
}

export async function clearAll(db: Queryable): Promise<void> {
  await db.query('DELETE FROM payments');
}

export async function revenueByCurrency(db: Queryable): Promise<Record<string, number>> {
  const { rows } = await db.query<{ currency: string; total: number }>(
    `SELECT currency, COALESCE(SUM(amount), 0)::double precision AS total
       FROM payments WHERE status = 'captured' GROUP BY currency`,
  );
  const totals: Record<string, number> = {};
  for (const row of rows) totals[row.currency] = Number(row.total ?? 0);
  return totals;
}
