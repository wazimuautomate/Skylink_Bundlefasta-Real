import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export interface ValidationParams {
  amount: number;
  receiverTill: string;
  confirmationPassword?: string;
}

export async function validateBusinessBuyGoods(params: ValidationParams): Promise<{ valid: boolean; error?: string }> {
  const { amount, receiverTill, confirmationPassword } = params;

  // 1. Basic format validations
  if (amount <= 0) {
    return { valid: false, error: 'Amount must be a positive number.' };
  }

  const tillRegex = /^\d{5,6}$/;
  if (!tillRegex.test(receiverTill)) {
    return { valid: false, error: 'Receiver Till Number must be 5 or 6 digits.' };
  }

  // 2. Fetch safety configs and limits from the credentials database
  const { data: credentials, error: credError } = await supabase
    .from('mpesa_credentials')
    .select('*')
    .eq('id', 'c1111111-1111-1111-1111-111111111111')
    .maybeSingle();

  if (credError) {
    console.error('[Validation] Error loading safety settings:', credError);
  }

  // Load from database first, fallback to environment variables, then default limits
  const maxTxLimit = credentials?.b2b_max_transaction_limit 
    ? Number(credentials.b2b_max_transaction_limit) 
    : Number(process.env.B2B_MAX_TRANSACTION_LIMIT || 50000);

  const dailyPayoutLimit = credentials?.b2b_daily_payout_limit 
    ? Number(credentials.b2b_daily_payout_limit) 
    : Number(process.env.B2B_DAILY_LIMIT || 250000);

  const cooldownSeconds = credentials?.b2b_cooldown_seconds 
    ? Number(credentials.b2b_cooldown_seconds) 
    : Number(process.env.B2B_COOLDOWN_SECONDS || 60);

  const requiredPassword = credentials?.b2b_confirmation_password 
    ? credentials.b2b_confirmation_password 
    : process.env.B2B_CONFIRMATION_PASSWORD;

  // 3. Verify single transaction limit
  if (amount > maxTxLimit) {
    return { 
      valid: false, 
      error: `Transaction amount KES ${amount.toLocaleString()} exceeds the maximum allowed limit of KES ${maxTxLimit.toLocaleString()}.` 
    };
  }

  // 4. Verify optional confirmation password if set
  if (requiredPassword && requiredPassword !== confirmationPassword) {
    return { valid: false, error: 'Invalid confirmation password.' };
  }

  // 5. Verify daily payout limit
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: todayTxs, error: sumError } = await supabase
    .from('business_buy_goods_transactions')
    .select('amount')
    .not('status', 'in', '("failed", "cancelled", "reversed")')
    .gte('created_at', startOfDay.toISOString());

  if (sumError) {
    console.error('[Validation] Error retrieving daily transaction sum:', sumError);
  } else {
    const todaySum = (todayTxs || []).reduce((acc, curr) => acc + Number(curr.amount), 0);
    if (todaySum + amount > dailyPayoutLimit) {
      return { 
        valid: false, 
        error: `Daily payout limit of KES ${dailyPayoutLimit.toLocaleString()} would be exceeded. (Paid/processing today: KES ${todaySum.toLocaleString()}, requested: KES ${amount.toLocaleString()})` 
      };
    }
  }

  // 6. Verify rate limiting / cooldown protection
  const cooldownLimit = new Date(Date.now() - cooldownSeconds * 1000);
  const { data: recentTxs, error: recentError } = await supabase
    .from('business_buy_goods_transactions')
    .select('id')
    .eq('receiver_till', receiverTill)
    .eq('amount', amount)
    .not('status', 'eq', 'failed')
    .gte('created_at', cooldownLimit.toISOString());

  if (recentError) {
    console.error('[Validation] Error checking cooldown:', recentError);
  } else if (recentTxs && recentTxs.length > 0) {
    return { 
      valid: false, 
      error: `Cooldown protection active: A similar transaction to Till ${receiverTill} for KES ${amount.toLocaleString()} was initiated in the last ${cooldownSeconds} seconds. Please wait before retrying.` 
    };
  }

  return { valid: true };
}
