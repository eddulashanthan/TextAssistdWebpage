import { createBrowserClient } from '@supabase/ssr';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL');
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY');
}

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export type License = {
  id: string;
  key: string;
  user_id: string;
  hours_purchased: number;
  hours_remaining: number;
  purchase_date: string;
  last_validated_at: string | null;
  linked_system_id: string | null;
  status: 'active' | 'expired' | 'revoked';
};

export type Transaction = {
  id: string;
  user_id: string;
  license_id: string;
  payment_gateway: 'stripe' | 'paypal';
  gateway_transaction_id: string;
  amount: number;
  currency: string;
  status: 'completed' | 'failed' | 'pending';
  created_at: string;
};