'use server';

import { createClient, createAdminClient } from '@/lib/supabase/server';
import { getDashboardStats, getTransactions, createTransaction, TransactionFilters } from '@/lib/repositories/transactions';
import { getAnalyticsData } from '@/lib/repositories/analytics';
import {
  getServicesOverview,
  getBingwaOneModuleSummaries,
  getBingwaOneModuleDetails,
  getPesatrixOverview,
  getPesatrixEventDetails
} from '@/lib/repositories/services-analytics';
import { verifyDashboardPin, setDashboardPin, hasPinConfigured } from '@/lib/repositories/pin';
import { logAudit } from '@/lib/repositories/audit';
import { DarajaService } from '@/lib/services/daraja';
import { revalidatePath } from 'next/cache';
import {
  createB2bRequest,
  getB2bStats,
  getB2bRequests,
  getSettlementRules,
  createSettlementRule,
  updateSettlementRule,
  deleteSettlementRule,
  getSettlementQueue,
  ensureDefaultSettlementRules,
} from '@/lib/repositories/b2b';

// Helper to check user auth
async function checkAuth() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    throw new Error('Unauthorized access');
  }
  return user;
}

// 1. Dashboard statistics
export async function getDashboardStatsAction() {
  await checkAuth();
  return await getDashboardStats();
}

// 2. Transactions fetcher
export async function getTransactionsAction(filters: TransactionFilters = {}) {
  await checkAuth();
  return await getTransactions(filters);
}

// 3. Analytics fetcher
export async function getAnalyticsAction() {
  await checkAuth();
  return await getAnalyticsData();
}

// 4. PIN operations
export async function verifyPinAction(pin: string) {
  const user = await checkAuth();
  const isValid = await verifyDashboardPin(user.id, pin);
  if (isValid) {
    await logAudit('PIN_VERIFIED', { userId: user.id });
  } else {
    await logAudit('PIN_VERIFICATION_FAILED', { userId: user.id });
  }
  return isValid;
}

export async function setPinAction(pin: string) {
  const user = await checkAuth();
  const success = await setDashboardPin(user.id, pin);
  if (success) {
    await logAudit('PIN_CHANGED', { userId: user.id });
  }
  return success;
}

export async function hasPinAction() {
  const user = await checkAuth();
  return await hasPinConfigured(user.id);
}

export async function refreshBalanceAction() {
  const user = await checkAuth();
  
  try {
    const res = await DarajaService.queryAccountBalance();

    if (res.ResponseCode && res.ResponseCode !== '0') {
      throw new Error(res.ResponseDescription || 'M-Pesa balance query rejected.');
    }

    if (res.isMock) {
      await new Promise((resolve) => setTimeout(resolve, 2500));
    } else {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }

    const supabase = await createClient();
    const { data: snapshot } = await supabase
      .from('balance_snapshots')
      .select('balance, fetched_at')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (snapshot) {
      await logAudit('BALANCE_REFRESHED', { balance: snapshot.balance, fetchedAt: snapshot.fetched_at });
      return { success: true, balance: snapshot.balance, fetchedAt: snapshot.fetched_at };
    }
    
    return { success: true, pending: true, message: 'Request sent. Callback processing...' };
  } catch (error: any) {
    console.error('Balance query action failed:', error);
    return { success: false, error: error.message };
  }
}

// 6. STK Push Actions
export async function initiateStkPushAction(params: {
  phone: string;
  amount: number;
  reference: string;
  description: string;
  pin: string;
}) {
  const user = await checkAuth();

  // 1. Confirm PIN first
  const isPinValid = await verifyDashboardPin(user.id, params.pin);
  if (!isPinValid) {
    await logAudit('STK_PUSH_BLOCKED_BAD_PIN', { phone: params.phone, amount: params.amount });
    return { success: false, error: 'Incorrect Dashboard PIN' };
  }

  const adminSupabase = createAdminClient();

  try {
    // 2. Call Daraja
    const res = await DarajaService.initiateStkPush({
      phoneNumber: params.phone,
      amount: params.amount,
      accountReference: params.reference,
      description: params.description,
    });

    // 3. Insert stk_requests
    const { data, error } = await adminSupabase
      .from('stk_requests')
      .insert({
        phone_number: params.phone,
        amount: params.amount,
        account_reference: params.reference,
        merchant_request_id: res.MerchantRequestID || null,
        checkout_request_id: res.CheckoutRequestID || null,
        status: 'PENDING',
        response_payload: res,
      })
      .select()
      .single();

    if (error) throw error;

    await logAudit('STK_PUSH_INITIATED', {
      phone: params.phone,
      amount: params.amount,
      reference: params.reference,
      checkoutRequestId: res.CheckoutRequestID,
    });

    return { success: true, data };
  } catch (error: any) {
    console.error('STK push action failed:', error);
    return { success: false, error: error.message };
  }
}

export async function queryStkStatusAction(checkoutRequestId: string) {
  await checkAuth();
  try {
    const res = await DarajaService.queryStkStatus(checkoutRequestId);
    return { success: true, status: res.ResultDesc || res.ResponseDescription || 'Pending callback' };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// 7. B2C Payout Actions
export async function sendB2cAction(params: {
  phone: string;
  amount: number;
  remarks: string;
  pin: string;
}) {
  const user = await checkAuth();
  
  // 1. Confirm PIN first
  const isPinValid = await verifyDashboardPin(user.id, params.pin);
  if (!isPinValid) {
    await logAudit('B2C_PAYOUT_BLOCKED_BAD_PIN', { phone: params.phone, amount: params.amount });
    return { success: false, error: 'Incorrect Dashboard PIN' };
  }

  const adminSupabase = createAdminClient();

  try {
    // 2. Call Daraja
    const res = await DarajaService.initiateB2c({
      phoneNumber: params.phone,
      amount: params.amount,
      remarks: params.remarks,
    });

    // 3. Insert B2C request
    const { data, error } = await adminSupabase
      .from('b2c_requests')
      .insert({
        phone_number: params.phone,
        amount: params.amount,
        remarks: params.remarks,
        conversation_id: res.ConversationID || null,
        originator_conversation_id: res.OriginatorConversationID || null,
        status: 'PENDING',
        response_payload: res,
      })
      .select()
      .single();

    if (error) throw error;

    await logAudit('B2C_PAYOUT_INITIATED', {
      phone: params.phone,
      amount: params.amount,
      conversationId: res.ConversationID,
    });

    return { success: true, data };
  } catch (error: any) {
    console.error('B2C payout action failed:', error);
    return { success: false, error: error.message };
  }
}

// 8. Reversal Actions
export async function requestReversalAction(params: {
  receipt: string;
  amount: number;
  reason: string;
  pin: string;
}) {
  const user = await checkAuth();

  // 1. Confirm PIN
  const isPinValid = await verifyDashboardPin(user.id, params.pin);
  if (!isPinValid) {
    await logAudit('REVERSAL_BLOCKED_BAD_PIN', { receipt: params.receipt, amount: params.amount });
    return { success: false, error: 'Incorrect Dashboard PIN' };
  }

  const adminSupabase = createAdminClient();

  try {
    // 2. Call Daraja
    const res = await DarajaService.requestReversal({
      receiptNumber: params.receipt,
      amount: params.amount,
      reason: params.reason,
    });

    // 3. Insert Reversal Request
    const { data, error } = await adminSupabase
      .from('reversal_requests')
      .insert({
        receipt_number: params.receipt,
        amount: params.amount,
        reason: params.reason,
        conversation_id: res.ConversationID || null,
        status: 'PENDING',
        response_payload: res,
      })
      .select()
      .single();

    if (error) throw error;

    await logAudit('REVERSAL_INITIATED', {
      receipt: params.receipt,
      amount: params.amount,
      conversationId: res.ConversationID,
    });

    return { success: true, data };
  } catch (error: any) {
    console.error('Reversal request action failed:', error);
    return { success: false, error: error.message };
  }
}

// 9. Fetch Audit Logs
export async function getAuditLogsAction(limitVal: number = 50) {
  await checkAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('audit_logs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limitVal);

  if (error) {
    console.error('Failed to get audit logs:', error);
    return [];
  }

  return data || [];
}

// 10. Fetch Product Sources
export async function getProductSourcesAction() {
  await checkAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('product_sources')
    .select('*')
    .order('name', { ascending: true });

  if (error) {
    console.error('Failed to get product sources:', error);
    return [];
  }

  return data || [];
}

// 11. Add a new Product Source
export async function addProductSourceAction(name: string, reference: string) {
  await checkAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('product_sources')
    .insert({
      name,
      reference: reference.toUpperCase().trim(),
      active: true,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to add product source:', error);
    return { success: false, error: error.message };
  }

  await logAudit('PRODUCT_SOURCE_ADDED', { name, reference });
  return { success: true, data };
}

// 12. Developer Simulation Actions (Mock C2B Trigger)
export async function simulateC2bAction(params: {
  phone: string;
  amount: number;
  reference: string;
}) {
  await checkAuth();
  
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const res = await fetch(`${appUrl}/api/mock/c2b`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const err = await res.json();
      return { success: false, error: err.error || 'Simulation request failed' };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// 13. Fetch all transactions for Analytics within a range (no pagination limits)
export async function getAnalyticsTransactionsAction(filters: { dateStart?: string; dateEnd?: string }) {
  await checkAuth();
  const supabase = await createClient();
  let query = supabase
    .from('transactions')
    .select(`
      *,
      product_sources (
        id,
        name,
        reference
      )
    `)
    .order('created_at', { ascending: true });

  if (filters.dateStart) {
    query = query.gte('created_at', filters.dateStart);
  }
  if (filters.dateEnd) {
    query = query.lte('created_at', filters.dateEnd);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch analytics transactions:', error);
    return [];
  }
  return data || [];
}

// 14. Bulk Delete Transactions
export async function deleteTransactionsAction(ids: string[]) {
  await checkAuth();
  const adminSupabase = createAdminClient();
  const { error } = await adminSupabase
    .from('transactions')
    .delete()
    .in('id', ids);

  if (error) {
    console.error('Failed to bulk delete transactions:', error);
    return { success: false, error: error.message };
  }

  await logAudit('BULK_TRANSACTIONS_DELETED', { count: ids.length, ids });
  return { success: true };
}

// 15. Update Password
export async function updatePasswordAction(password: string) {
  await checkAuth();
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    console.error('Failed to change password:', error);
    return { success: false, error: error.message };
  }

  await logAudit('PASSWORD_CHANGED');
  return { success: true };
}

// 16. B2B Settlement Actions
export async function initiateB2bAction(params: {
  destinationType: 'Till' | 'PayBill';
  destinationShortcode: string;
  amount: number;
  accountReference: string;
  remarks: string;
  pin: string;
}) {
  const user = await checkAuth();

  // 1. Confirm PIN first
  const isPinValid = await verifyDashboardPin(user.id, params.pin);
  if (!isPinValid) {
    await logAudit('B2B_SETTLEMENT_BLOCKED_BAD_PIN', { destination: params.destinationShortcode, amount: params.amount });
    return { success: false, error: 'Incorrect Dashboard PIN' };
  }

  const adminSupabase = createAdminClient();

  try {
    // 2. Best-effort pre-flight balance check.
    //
    // balance_snapshots only reflects the last Account Balance callback and is 0
    // when that has never populated. A 0 / missing snapshot means "unknown", NOT
    // "empty" — so we only block when we actually have a POSITIVE known balance
    // that is smaller than the requested amount. Otherwise we proceed and let
    // Safaricom validate: M-Pesa rejects a genuinely underfunded transfer and the
    // reason is recorded on the b2b_request and shown in the settlement history.
    const { data: balanceData } = await adminSupabase
      .from('balance_snapshots')
      .select('balance, fetched_at')
      .order('fetched_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const currentBalance = Number(balanceData?.balance || 0);
    if (currentBalance > 0 && currentBalance < params.amount) {
      await logAudit('B2B_SETTLEMENT_BLOCKED_INSUFFICIENT_BALANCE', {
        amount: params.amount,
        balance: currentBalance,
      });
      return {
        success: false,
        error: `Insufficient funds. Last known balance is KES ${currentBalance.toLocaleString()}, but the requested settlement is KES ${params.amount.toLocaleString()}. Refresh your balance and try again.`,
      };
    }

    if (currentBalance <= 0) {
      // Balance not known locally — don't block; rely on M-Pesa's own validation.
      await logAudit('B2B_SETTLEMENT_BALANCE_UNVERIFIED', {
        amount: params.amount,
        note: 'No positive local balance snapshot; proceeding with M-Pesa as source of truth.',
      });
    }

    // 3. Create database record FIRST (PENDING state)
    const commandId = params.destinationType === 'Till' ? 'BusinessBuyGoods' : 'BusinessPayBill';
    const dbRecord = await createB2bRequest({
      amount: params.amount,
      destination_shortcode: params.destinationShortcode,
      destination_type: params.destinationType,
      command_id: commandId,
      account_reference: params.accountReference,
      remarks: params.remarks,
      status: 'PENDING',
    });

    // 4. Call Daraja
    let res;
    try {
      res = await DarajaService.initiateB2b({
        destinationType: params.destinationType,
        destinationShortcode: params.destinationShortcode,
        amount: params.amount,
        accountReference: params.accountReference,
        remarks: params.remarks,
      });
    } catch (apiError: any) {
      // If Daraja fails, update B2B request status to FAILED
      await adminSupabase
        .from('b2b_requests')
        .update({
          status: 'FAILED',
          result_description: apiError.message || 'API Call failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', dbRecord.id);

      await logAudit('B2B_SETTLEMENT_API_FAILED', {
        id: dbRecord.id,
        error: apiError.message,
      });

      throw apiError;
    }

    // 5. Update B2B request with conversation ids from Daraja API response
    const { data: updatedRecord, error: updateErr } = await adminSupabase
      .from('b2b_requests')
      .update({
        conversation_id: res.ConversationID || null,
        originator_conversation_id: res.OriginatorConversationID || null,
        response_payload: res,
        updated_at: new Date().toISOString(),
      })
      .eq('id', dbRecord.id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    await logAudit('B2B_SETTLEMENT_INITIATED', {
      id: dbRecord.id,
      destination: params.destinationShortcode,
      amount: params.amount,
      conversationId: res.ConversationID,
    });

    return { success: true, data: updatedRecord };
  } catch (error: any) {
    console.error('B2B Settlement action failed:', error);
    return { success: false, error: error.message };
  }
}

export async function getB2bStatsAction() {
  await checkAuth();
  return await getB2bStats();
}

export async function getB2bRequestsAction(filters: { status?: string; destinationType?: string; limit?: number; offset?: number } = {}) {
  await checkAuth();
  return await getB2bRequests(filters);
}

export async function getSettlementRulesAction() {
  await checkAuth();
  // Make sure the default (editable) Pesatrix automation exists before listing.
  await ensureDefaultSettlementRules();
  return await getSettlementRules();
}

export async function createSettlementRuleAction(rule: {
  source_reference: string;
  rule_type: string;
  percentage?: number | null;
  fixed_amount?: number | null;
  destination_shortcode: string;
  destination_type: string;
}) {
  await checkAuth();
  const res = await createSettlementRule(rule);
  await logAudit('SETTLEMENT_RULE_CREATED', {
    ruleId: res.id,
    source: rule.source_reference,
    type: rule.rule_type,
  });
  return res;
}

export async function updateSettlementRuleAction(
  id: string,
  updates: {
    source_reference?: string;
    rule_type?: string;
    percentage?: number | null;
    fixed_amount?: number | null;
    destination_shortcode?: string;
    destination_type?: string;
    active?: boolean;
  }
) {
  await checkAuth();
  const res = await updateSettlementRule(id, updates);
  await logAudit('SETTLEMENT_RULE_UPDATED', { ruleId: id, updates });
  return res;
}

export async function deleteSettlementRuleAction(id: string) {
  await checkAuth();
  await deleteSettlementRule(id);
  await logAudit('SETTLEMENT_RULE_DELETED', { ruleId: id });
  return true;
}

export async function getSettlementQueueAction() {
  await checkAuth();
  return await getSettlementQueue();
}

// 17. SMS Notifications & Settings Actions
export async function getSmsSettingsAction() {
  await checkAuth();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('sms_settings')
    .select('*')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle();

  if (error) {
    console.error('Failed to fetch SMS settings:', error);
    throw error;
  }

  if (!data) {
    // Seed defaults if missing
    const adminSupabase = createAdminClient();
    const { data: seeded, error: seedErr } = await adminSupabase
      .from('sms_settings')
      .insert({
        id: '00000000-0000-0000-0000-000000000001',
        admin_alert_phone: '',
        sender_id: '',
        incoming_alerts_enabled: true,
        outgoing_alerts_enabled: true,
        pesafrix_till_number: '',
        notification_channel: 'sms'
      })
      .select()
      .single();

    if (seedErr) {
      console.error('Failed to seed SMS settings:', seedErr);
      throw seedErr;
    }
    return seeded;
  }

  return data;
}

export async function updateSmsSettingsAction(params: {
  admin_alert_phone: string;
  sender_id: string;
  incoming_alerts_enabled: boolean;
  outgoing_alerts_enabled: boolean;
  pesafrix_till_number: string;
  notification_channel?: string;
}) {
  const user = await checkAuth();
  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase
    .from('sms_settings')
    .update({
      admin_alert_phone: params.admin_alert_phone,
      sender_id: params.sender_id,
      incoming_alerts_enabled: params.incoming_alerts_enabled,
      outgoing_alerts_enabled: params.outgoing_alerts_enabled,
      pesafrix_till_number: params.pesafrix_till_number,
      notification_channel: params.notification_channel || 'sms',
      updated_at: new Date().toISOString()
    })
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .select()
    .single();

  if (error) {
    console.error('Failed to update SMS settings:', error);
    throw error;
  }

  await logAudit('NOTIFICATION_SETTINGS_UPDATED', {
    userId: user.id,
    admin_alert_phone: params.admin_alert_phone,
    sender_id: params.sender_id,
    incoming_alerts_enabled: params.incoming_alerts_enabled,
    outgoing_alerts_enabled: params.outgoing_alerts_enabled,
    pesafrix_till_number: params.pesafrix_till_number,
    notification_channel: params.notification_channel || 'sms'
  });

  return data;
}

export async function getSmsNotificationsAction(filters: {
  status?: string;
  phone?: string;
  limit?: number;
  offset?: number;
} = {}) {
  await checkAuth();
  const supabase = await createClient();

  let query = supabase
    .from('sms_notifications')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.phone) {
    query = query.ilike('phone', `%${filters.phone}%`);
  }

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch SMS notifications:', error);
    return [];
  }

  return data || [];
}

export async function getNotificationDeliveriesAction(filters: {
  status?: string;
  channel?: string;
  recipient?: string;
  direction?: string;
  sourceSystem?: string;
  limit?: number;
  offset?: number;
} = {}) {
  await checkAuth();
  const supabase = await createClient();

  let query = supabase
    .from('notification_deliveries')
    .select(`
      *,
      transactions (
        id,
        direction,
        transaction_type,
        amount,
        receipt,
        mpesa_receipt,
        source_system,
        created_at
      ),
      webhook_events (
        id,
        source_system,
        event_key,
        event_type,
        processing_status,
        created_at
      )
    `)
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.channel) {
    query = query.eq('channel', filters.channel);
  }
  if (filters.recipient) {
    query = query.ilike('recipient', `%${filters.recipient}%`);
  }
  if (filters.direction) {
    query = query.eq('notification_type', `${filters.direction}_alert`);
  }
  if (filters.sourceSystem) {
    query = query.eq('transactions.source_system', filters.sourceSystem);
  }

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch notification deliveries:', error);
    return [];
  }

  return data || [];
}

export async function getWebhookEventsAction(filters: {
  transactionId?: string;
  limit?: number;
} = {}) {
  await checkAuth();
  const supabase = await createClient();

  let query = supabase
    .from('webhook_events')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.transactionId) {
    query = query.eq('transaction_id', filters.transactionId);
  }

  if (filters.limit) {
    query = query.limit(filters.limit);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch webhook events:', error);
    return [];
  }
  return data || [];
}

export async function getSmsStatsAction() {
  await checkAuth();
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  // Sent Today (status = 'SENT' and created_at >= today)
  const { count: sentToday, error: sentErr } = await supabase
    .from('notification_deliveries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'SENT')
    .gte('created_at', todayISO);

  if (sentErr) console.error('Error fetching sent stats:', sentErr);

  // Failed Today (status = 'FAILED' and created_at >= today)
  const { count: failedToday, error: failedErr } = await supabase
    .from('notification_deliveries')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'FAILED')
    .gte('created_at', todayISO);

  if (failedErr) console.error('Error fetching failed stats:', failedErr);

  // Queued (status = 'PENDING' or 'processing')
  const { count: queued } = await supabase
    .from('notification_deliveries')
    .select('*', { count: 'exact', head: true })
    .in('status', ['PENDING', 'queued', 'processing']);

  // Get active notification settings
  const { data: settings } = await supabase
    .from('sms_settings')
    .select('notification_channel')
    .eq('id', '00000000-0000-0000-0000-000000000001')
    .maybeSingle();

  // Last successful notification timestamp
  const { data: lastSuccessfulData } = await supabase
    .from('notification_deliveries')
    .select('sent_at')
    .eq('status', 'SENT')
    .order('sent_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    sentToday: sentToday || 0,
    failedToday: failedToday || 0,
    queued: queued || 0,
    channel: settings?.notification_channel || 'sms',
    lastSuccessful: lastSuccessfulData?.sent_at || null
  };
}

export async function sendTestNotificationAction() {
  const user = await checkAuth();

  try {
    const supabase = await createClient();
    const { data: tx } = await supabase
      .from('transactions')
      .select('*')
      .eq('status', 'SUCCESS')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const testTx = tx || {
      id: '00000000-0000-0000-0000-000000000000',
      source_system: 'bingwaone',
      direction: 'IN',
      transaction_type: 'STK',
      amount: 100,
      account_reference: 'TEST ALERT',
      phone_number: '254712345678',
      mpesa_receipt: 'TESTRECEIPT',
      module: 'bundle'
    };

    const { triggerNotificationFlow } = await import('@/lib/notifications/send-transaction-alert');

    // Trigger the flow
    await triggerNotificationFlow({
      transaction_id: testTx.id,
      source_system: testTx.source_system === 'bingwazone' ? 'bingwaone' : (testTx.source_system || 'manual'),
      direction: testTx.direction || 'IN',
      transaction_type: testTx.transaction_type || 'STK',
      amount: Number(testTx.amount),
      account_reference: testTx.account_reference || 'Test alert reference',
      phone_number: testTx.phone_number || '254712345678',
      mpesa_receipt: testTx.mpesa_receipt || 'TESTING123',
      module: testTx.module || 'test',
      isTest: true
    });

    await logAudit('TEST_NOTIFICATION_SENT', { userId: user.id });
    return { success: true };
  } catch (err: any) {
    console.error('Test notification failed:', err);
    await logAudit('TEST_NOTIFICATION_FAILED', { userId: user.id, error: err.message });
    return { success: false, error: err.message };
  }
}

export async function getServicesStatsAction() {
  await checkAuth();
  const supabase = await createClient();

  try {
    const { data: txs, error } = await supabase
      .from('transactions')
      .select('*')
      .in('source_system', ['bingwaone', 'bingwazone', 'pesatrix'])
      .eq('status', 'SUCCESS')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const txList = txs || [];

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayMs = todayStart.getTime();

    const getStatsForService = (serviceName: string) => {
      const serviceTxs = txList.filter((t: any) => {
        if (serviceName === 'bingwaone') {
          return t.source_system === 'bingwaone' || t.source_system === 'bingwazone';
        }
        return t.source_system === serviceName;
      });
      
      const totalInflow = serviceTxs
        .filter((t: any) => t.direction === 'IN')
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      const totalOutflow = serviceTxs
        .filter((t: any) => t.direction === 'OUT')
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      const inflowToday = serviceTxs
        .filter((t: any) => t.direction === 'IN' && new Date(t.created_at).getTime() >= todayMs)
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      const outflowToday = serviceTxs
        .filter((t: any) => t.direction === 'OUT' && new Date(t.created_at).getTime() >= todayMs)
        .reduce((sum: number, t: any) => sum + Number(t.amount), 0);

      // Group inflow by module
      const moduleMap: Record<string, number> = {};
      const moduleCountMap: Record<string, number> = {};
      
      serviceTxs
        .filter((t: any) => t.direction === 'IN')
        .forEach((t: any) => {
          const m = t.module || 'unknown';
          moduleMap[m] = (moduleMap[m] || 0) + Number(t.amount);
          moduleCountMap[m] = (moduleCountMap[m] || 0) + 1;
        });

      const modules = Object.entries(moduleMap).map(([name, volume]) => ({
        name,
        volume,
        count: moduleCountMap[name] || 0
      })).sort((a, b) => b.volume - a.volume);

      // Group by payment/transaction type
      const typeMap: Record<string, number> = {};
      const typeCountMap: Record<string, number> = {};
      
      serviceTxs.forEach((t: any) => {
        const type = t.transaction_type || 'unknown';
        typeMap[type] = (typeMap[type] || 0) + Number(t.amount);
        typeCountMap[type] = (typeCountMap[type] || 0) + 1;
      });

      const types = Object.entries(typeMap).map(([name, volume]) => ({
        name,
        volume,
        count: typeCountMap[name] || 0
      })).sort((a, b) => b.volume - a.volume);

      const recentPayouts = serviceTxs
        .filter((t: any) => t.direction === 'OUT')
        .slice(0, 10);

      return {
        totalVolume: totalInflow + totalOutflow,
        totalInflow,
        totalOutflow,
        inflowToday,
        outflowToday,
        txCount: serviceTxs.length,
        modules,
        types,
        recentPayouts
      };
    };

    return {
      success: true,
      bingwaone: getStatsForService('bingwaone'),
      pesatrix: getStatsForService('pesatrix')
    };

  } catch (err: any) {
    console.error('getServicesStatsAction failed:', err);
    return { success: false, error: err.message };
  }
}

export async function getServicesOverviewAction(period: string, customStart?: string, customEnd?: string) {
  await checkAuth();
  try {
    const data = await getServicesOverview(period, customStart, customEnd);
    return { success: true, ...data };
  } catch (err: any) {
    console.error('getServicesOverviewAction failed:', err);
    return { success: false, error: err.message };
  }
}

export async function getBingwaOneModuleSummariesAction(period: string, customStart?: string, customEnd?: string) {
  await checkAuth();
  try {
    const data = await getBingwaOneModuleSummaries(period, customStart, customEnd);
    return { success: true, ...data };
  } catch (err: any) {
    console.error('getBingwaOneModuleSummariesAction failed:', err);
    return { success: false, error: err.message };
  }
}

export async function getBingwaOneModuleDetailsAction(moduleName: string, period: string, customStart?: string, customEnd?: string) {
  await checkAuth();
  try {
    const data = await getBingwaOneModuleDetails(moduleName, period, customStart, customEnd);
    return { success: true, ...data };
  } catch (err: any) {
    console.error('getBingwaOneModuleDetailsAction failed:', err);
    return { success: false, error: err.message };
  }
}

export async function getPesatrixOverviewAction(period: string, customStart?: string, customEnd?: string) {
  await checkAuth();
  try {
    const data = await getPesatrixOverview(period, customStart, customEnd);
    return { success: true, ...data };
  } catch (err: any) {
    console.error('getPesatrixOverviewAction failed:', err);
    return { success: false, error: err.message };
  }
}

export async function getPesatrixEventDetailsAction(eventType: 'activation' | 'withdrawal', period: string, customStart?: string, customEnd?: string) {
  await checkAuth();
  try {
    const data = await getPesatrixEventDetails(eventType, period, customStart, customEnd);
    return { success: true, ...data };
  } catch (err: any) {
    console.error('getPesatrixEventDetailsAction failed:', err);
    return { success: false, error: err.message };
  }
}

