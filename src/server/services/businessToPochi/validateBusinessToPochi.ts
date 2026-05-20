import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export interface ValidationParams {
  amount: number;
  receiverPhone: string;
  confirmationPassword?: string;
}

export async function validateBusinessToPochi(params: ValidationParams): Promise<{ valid: boolean; error?: string; formattedPhone?: string }> {
  const { amount, receiverPhone, confirmationPassword } = params;

  // 1. Basic format validations
  if (amount <= 0) {
    return { valid: false, error: 'Amount must be a positive number.' };
  }

  // Normalize phone number to MSISDN standard (e.g. 254712345678)
  let formattedPhone = receiverPhone.replace(/[^0-9]/g, '');
  if (formattedPhone.startsWith('0')) {
    formattedPhone = '254' + formattedPhone.substring(1);
  } else if (formattedPhone.startsWith('7') || formattedPhone.startsWith('1')) {
    formattedPhone = '254' + formattedPhone;
  }

  // Validate phone format (Must start with 254 and be 12 digits long)
  const phoneRegex = /^254[17]\d{8}$/;
  if (!phoneRegex.test(formattedPhone)) {
    return { valid: false, error: 'Receiver phone number must be a valid Kenyan mobile number (e.g. 0712345678, 0112345678, or 254712345678).' };
  }

  // 2. Fetch safety configs and limits from the credentials database
  const { data: credentials, error: credError } = await supabase
    .from('mpesa_credentials')
    .select('*')
    .eq('id', 'c1111111-1111-1111-1111-111111111111')
    .maybeSingle();

  if (credError) {
    console.error('[Validation Pochi] Error loading safety settings:', credError);
  }

  // Load from database first, fallback to environment variables, then default limits
  const maxTxLimit = credentials?.pochi_max_transaction_limit 
    ? Number(credentials.pochi_max_transaction_limit) 
    : Number(process.env.POCHI_MAX_TRANSACTION_LIMIT || 50000);

  const dailyPayoutLimit = credentials?.pochi_daily_payout_limit 
    ? Number(credentials.pochi_daily_payout_limit) 
    : Number(process.env.POCHI_DAILY_LIMIT || 250000);

  const cooldownSeconds = credentials?.pochi_cooldown_seconds 
    ? Number(credentials.pochi_cooldown_seconds) 
    : Number(process.env.POCHI_COOLDOWN_SECONDS || 60);

  const requiredPassword = credentials?.pochi_confirmation_password 
    ? credentials.pochi_confirmation_password 
    : process.env.POCHI_CONFIRMATION_PASSWORD;

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
    .from('business_to_pochi_transactions')
    .select('amount')
    .not('status', 'in', '("failed", "cancelled", "reversed")')
    .gte('created_at', startOfDay.toISOString());

  if (sumError) {
    console.error('[Validation Pochi] Error retrieving daily transaction sum:', sumError);
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
    .from('business_to_pochi_transactions')
    .select('id')
    .eq('receiver_phone', formattedPhone)
    .eq('amount', amount)
    .not('status', 'eq', 'failed')
    .gte('created_at', cooldownLimit.toISOString());

  if (recentError) {
    console.error('[Validation Pochi] Error checking cooldown:', recentError);
  } else if (recentTxs && recentTxs.length > 0) {
    return { 
      valid: false, 
      error: `Cooldown protection active: A similar transaction to phone ${formattedPhone} for KES ${amount.toLocaleString()} was initiated in the last ${cooldownSeconds} seconds. Please wait before retrying.` 
    };
  }

  return { valid: true, formattedPhone };
}
