import { createClient, createAdminClient } from '../supabase/server';
import { B2bRequest, SettlementRule, SettlementQueue } from '@/types/database';
import { DarajaService } from '../services/daraja';
import { logSystemAudit } from './audit';

// 1. Create B2B Request
export async function createB2bRequest(params: {
  amount: number;
  destination_shortcode: string;
  destination_type: string;
  command_id: string;
  account_reference: string;
  remarks?: string;
  status?: string;
  conversation_id?: string;
  originator_conversation_id?: string;
}) {
  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase
    .from('b2b_requests')
    .insert({
      amount: params.amount,
      destination_shortcode: params.destination_shortcode,
      destination_type: params.destination_type,
      command_id: params.command_id,
      account_reference: params.account_reference,
      remarks: params.remarks || null,
      status: params.status || 'PENDING',
      conversation_id: params.conversation_id || null,
      originator_conversation_id: params.originator_conversation_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create B2B request:', error);
    throw error;
  }

  return data;
}

// 2. Update B2B Request (Callbacks / Status check)
export async function updateB2bRequest(
  conversationId: string,
  updates: {
    status?: string;
    result_code?: number | null;
    result_description?: string | null;
    response_payload?: any;
    originator_conversation_id?: string;
  }
) {
  const adminSupabase = createAdminClient();

  const { data, error } = await adminSupabase
    .from('b2b_requests')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('conversation_id', conversationId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Failed to update B2B request:', error);
    throw error;
  }

  return data;
}

// 3. Get B2B Stats for Dashboard and Analytics
export async function getB2bStats() {
  const supabase = await createClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayISO = todayStart.toISOString();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthISO = monthStart.toISOString();

  // Today's total settlements (SUCCESS status)
  const { data: todaySuccess } = await supabase
    .from('b2b_requests')
    .select('amount')
    .eq('status', 'SUCCESS')
    .gte('created_at', todayISO);

  const totalSettledToday = (todaySuccess || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);

  // Month total settlements
  const { data: monthSuccess } = await supabase
    .from('b2b_requests')
    .select('amount')
    .eq('status', 'SUCCESS')
    .gte('created_at', monthISO);

  const totalSettledMonth = (monthSuccess || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);

  // Pending settlements count & sum
  const { data: pendingReqs } = await supabase
    .from('b2b_requests')
    .select('amount')
    .eq('status', 'PENDING');

  const pendingCount = pendingReqs?.length || 0;
  const pendingAmount = (pendingReqs || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);

  // Successful settlements count & sum
  const { data: successReqs } = await supabase
    .from('b2b_requests')
    .select('amount')
    .eq('status', 'SUCCESS');

  const successCount = successReqs?.length || 0;
  const successAmount = (successReqs || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);

  // Failed settlements count & sum
  const { data: failedReqs } = await supabase
    .from('b2b_requests')
    .select('amount')
    .eq('status', 'FAILED');

  const failedCount = failedReqs?.length || 0;
  const failedAmount = (failedReqs || []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);

  // Success and failure rates
  const totalCompleted = successCount + failedCount;
  const successRate = totalCompleted > 0 ? (successCount / totalCompleted) * 100 : 0;
  const failureRate = totalCompleted > 0 ? (failedCount / totalCompleted) * 100 : 0;

  return {
    totalSettledToday,
    totalSettledMonth,
    pendingCount,
    pendingAmount,
    successCount,
    successAmount,
    failedCount,
    failedAmount,
    successRate,
    failureRate,
  };
}

// 4. Fetch list of B2B Requests
export async function getB2bRequests(filters: { status?: string; destinationType?: string; limit?: number; offset?: number } = {}) {
  const supabase = await createClient();

  let query = supabase
    .from('b2b_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.status) {
    query = query.eq('status', filters.status);
  }
  if (filters.destinationType) {
    query = query.eq('destination_type', filters.destinationType);
  }

  const limit = filters.limit || 50;
  const offset = filters.offset || 0;
  query = query.range(offset, offset + limit - 1);

  const { data, error } = await query;
  if (error) {
    console.error('Failed to fetch B2B requests:', error);
    return [];
  }

  return data || [];
}

// 5. Settlement Rules Management
export async function getSettlementRules() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('settlement_rules')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to get settlement rules:', error);
    return [];
  }

  return data || [];
}

export async function createSettlementRule(rule: {
  source_reference: string;
  rule_type: string;
  percentage?: number | null;
  fixed_amount?: number | null;
  destination_shortcode: string;
  destination_type: string;
  active?: boolean;
}) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('settlement_rules')
    .insert({
      source_reference: rule.source_reference.trim().toUpperCase(),
      rule_type: rule.rule_type,
      percentage: rule.percentage || null,
      fixed_amount: rule.fixed_amount || null,
      destination_shortcode: rule.destination_shortcode,
      destination_type: rule.destination_type,
      active: rule.active !== undefined ? rule.active : true,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create settlement rule:', error);
    throw error;
  }

  return data;
}

export async function updateSettlementRule(
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
  const supabase = await createClient();

  const payload: Record<string, any> = {};
  if (updates.source_reference !== undefined) payload.source_reference = updates.source_reference.trim().toUpperCase();
  if (updates.rule_type !== undefined) payload.rule_type = updates.rule_type;
  if (updates.percentage !== undefined) payload.percentage = updates.percentage;
  if (updates.fixed_amount !== undefined) payload.fixed_amount = updates.fixed_amount;
  if (updates.destination_shortcode !== undefined) payload.destination_shortcode = updates.destination_shortcode;
  if (updates.destination_type !== undefined) payload.destination_type = updates.destination_type;
  if (updates.active !== undefined) payload.active = updates.active;

  const { data, error } = await supabase
    .from('settlement_rules')
    .update(payload)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Failed to update settlement rule:', error);
    throw error;
  }

  return data;
}

export async function deleteSettlementRule(id: string) {
  const supabase = await createClient();

  const { error } = await supabase
    .from('settlement_rules')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Failed to delete settlement rule:', error);
    throw error;
  }

  return true;
}

// 6. Settlement Rule Engine: match active rules, then actually dispatch the B2B split.
//
// This runs for every SUCCESSFUL INCOMING payment, from whichever path first learns
// about it — a Safaricom STK/C2B callback OR a BingwaOne/Pesatrix webhook. A rule
// matches when its source_reference equals the transaction's account reference, its
// business source_system (e.g. "pesatrix"), or its module. That is what makes a
// Pesatrix activation (source_system = "pesatrix", usually no account reference)
// trigger a "PESATRIX" rule.
export async function triggerSettlementRule(
  transactionId: string,
  accountReference: string | null,
  amount: number,
  options?: {
    direction?: 'IN' | 'OUT';
    sourceSystem?: string | null;
    module?: string | null;
  }
) {
  try {
    // Settlement splits only apply to incoming money.
    const direction = options?.direction || 'IN';
    if (direction !== 'IN') return null;
    if (!amount || amount <= 0) return null;

    const adminSupabase = createAdminClient();

    // Candidate references a rule may match on (deduped, upper-cased).
    const candidates = Array.from(
      new Set(
        [accountReference, options?.sourceSystem, options?.module]
          .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
          .map((v) => v.trim().toUpperCase())
      )
    );

    if (candidates.length === 0) return null;

    const { data: rules, error } = await adminSupabase
      .from('settlement_rules')
      .select('*')
      .in('source_reference', candidates)
      .eq('active', true);

    if (error) {
      console.error('[Settlement] Failed to query rules for:', candidates, error);
      return null;
    }

    if (!rules || rules.length === 0) return null;

    const results = [];
    for (const rule of rules) {
      const dispatched = await dispatchRuleSettlement(rule, transactionId, amount);
      if (dispatched) results.push(dispatched);
    }
    return results;
  } catch (err) {
    // Never let a settlement failure break the callback/webhook acknowledgement.
    console.error('[Settlement Engine] Fatal error running settlement rules:', err);
    return null;
  }
}

/**
 * Computes a single rule's settlement amount, records it, and dispatches the B2B
 * transfer to Daraja. Idempotent per (transaction, rule): if a PENDING/PROCESSED
 * queue row already exists for this pair it does nothing, so a transaction seen by
 * both a Safaricom callback and an application webhook is only ever settled once.
 */
async function dispatchRuleSettlement(rule: any, transactionId: string, incomingAmount: number) {
  const adminSupabase = createAdminClient();

  // 1. Compute settlement amount from the rule definition.
  let settlementAmount = 0;
  if (rule.rule_type === 'PERCENTAGE' && rule.percentage) {
    settlementAmount = Math.round(((incomingAmount * Number(rule.percentage)) / 100) * 100) / 100;
  } else if (rule.rule_type === 'FIXED' && rule.fixed_amount) {
    settlementAmount = Number(rule.fixed_amount);
  }

  if (settlementAmount <= 0) return null;

  // Never settle more than what actually came in.
  if (settlementAmount > incomingAmount) {
    console.warn(`[Settlement] Rule ${rule.id} amount ${settlementAmount} exceeds incoming ${incomingAmount}. Skipping.`);
    await logSystemAudit('SETTLEMENT_RULE_SKIPPED', {
      rule_id: rule.id,
      transaction_id: transactionId,
      reason: 'Settlement amount exceeds incoming amount',
      settlementAmount,
      incomingAmount,
    });
    return null;
  }

  // 2. Idempotency guard — do not dispatch the same rule twice for one transaction.
  const { data: existingQueue } = await adminSupabase
    .from('settlement_queue')
    .select('id, status')
    .eq('transaction_id', transactionId)
    .eq('settlement_rule_id', rule.id)
    .in('status', ['PENDING', 'PROCESSED'])
    .maybeSingle();

  if (existingQueue) return null;

  // 3. A destination shortcode is required to actually move money.
  const destination = String(rule.destination_shortcode || '').trim();
  if (!destination) {
    console.warn(`[Settlement] Rule ${rule.id} has no destination shortcode. Recording FAILED.`);
    await adminSupabase.from('settlement_queue').insert({
      transaction_id: transactionId,
      settlement_rule_id: rule.id,
      amount: settlementAmount,
      status: 'FAILED',
      attempts: 1,
    });
    await logSystemAudit('SETTLEMENT_RULE_SKIPPED', {
      rule_id: rule.id,
      transaction_id: transactionId,
      reason: 'Missing destination shortcode',
    });
    return null;
  }

  // 4. Create the queue entry (PENDING).
  const { data: queueItem, error: queueError } = await adminSupabase
    .from('settlement_queue')
    .insert({
      transaction_id: transactionId,
      settlement_rule_id: rule.id,
      amount: settlementAmount,
      status: 'PENDING',
      attempts: 1,
    })
    .select()
    .single();

  if (queueError) {
    console.error('[Settlement] Failed to insert settlement queue item:', queueError);
    return null;
  }

  const destinationType = rule.destination_type === 'PayBill' ? 'PayBill' : 'Till';
  const commandId = destinationType === 'Till' ? 'BusinessBuyGoods' : 'BusinessPayBill';
  const reference = rule.source_reference;
  const remarks =
    rule.rule_type === 'PERCENTAGE'
      ? `Auto settlement (${rule.percentage}% of KES ${incomingAmount}) for ${reference}`
      : `Auto settlement (fixed KES ${settlementAmount}) for ${reference}`;

  // 5. Log a B2B request (PENDING) then dispatch to Daraja.
  const { data: b2bRequest, error: b2bError } = await adminSupabase
    .from('b2b_requests')
    .insert({
      amount: settlementAmount,
      destination_shortcode: destination,
      destination_type: destinationType,
      command_id: commandId,
      account_reference: reference,
      remarks,
      status: 'PENDING',
    })
    .select()
    .single();

  if (b2bError) {
    console.error('[Settlement] Failed to record B2B request:', b2bError);
    await adminSupabase.from('settlement_queue').update({ status: 'FAILED' }).eq('id', queueItem.id);
    return null;
  }

  try {
    const res = await DarajaService.initiateB2b({
      destinationType,
      destinationShortcode: destination,
      amount: settlementAmount,
      accountReference: reference,
      remarks,
    });

    await adminSupabase
      .from('b2b_requests')
      .update({
        conversation_id: res.ConversationID || null,
        originator_conversation_id: res.OriginatorConversationID || null,
        response_payload: res,
        updated_at: new Date().toISOString(),
      })
      .eq('id', b2bRequest.id);

    await adminSupabase
      .from('settlement_queue')
      .update({ status: 'PROCESSED', processed_at: new Date().toISOString() })
      .eq('id', queueItem.id);

    await logSystemAudit('SETTLEMENT_RULE_DISPATCHED', {
      rule_id: rule.id,
      transaction_id: transactionId,
      b2b_request_id: b2bRequest.id,
      destination,
      destination_type: destinationType,
      amount: settlementAmount,
      conversationId: res.ConversationID,
    });

    return { queueItem, b2bRequest, conversationId: res.ConversationID };
  } catch (apiError: any) {
    await adminSupabase
      .from('b2b_requests')
      .update({
        status: 'FAILED',
        result_description: apiError.message || 'API Call failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', b2bRequest.id);

    await adminSupabase.from('settlement_queue').update({ status: 'FAILED' }).eq('id', queueItem.id);

    await logSystemAudit('SETTLEMENT_RULE_DISPATCH_FAILED', {
      rule_id: rule.id,
      transaction_id: transactionId,
      b2b_request_id: b2bRequest.id,
      error: apiError.message,
    });

    return null;
  }
}

/**
 * Ensures the default, editable Pesatrix settlement automation exists: for every
 * incoming PESATRIX activation, send a fixed KES 200 to the admin's Till via B2B.
 * Seeded exactly once (guarded by a one-time audit marker) so the admin can freely
 * edit, disable, or delete it afterwards without it being recreated.
 */
export async function ensureDefaultSettlementRules() {
  try {
    const adminSupabase = createAdminClient();

    // One-time guard: only ever seed the default rule once.
    const { data: marker } = await adminSupabase
      .from('audit_logs')
      .select('id')
      .eq('action', 'DEFAULT_SETTLEMENT_RULE_SEEDED')
      .limit(1)
      .maybeSingle();

    if (marker) return;

    // Don't duplicate if a PESATRIX rule already exists.
    const { data: existing } = await adminSupabase
      .from('settlement_rules')
      .select('id')
      .eq('source_reference', 'PESATRIX')
      .limit(1)
      .maybeSingle();

    if (!existing) {
      const { data: settings } = await adminSupabase
        .from('sms_settings')
        .select('pesafrix_till_number')
        .eq('id', '00000000-0000-0000-0000-000000000001')
        .maybeSingle();

      const { error: insertErr } = await adminSupabase.from('settlement_rules').insert({
        source_reference: 'PESATRIX',
        rule_type: 'FIXED',
        fixed_amount: 200,
        percentage: null,
        destination_type: 'Till',
        destination_shortcode: settings?.pesafrix_till_number || '',
        active: true,
      });

      if (insertErr) {
        console.error('[Settlement] Failed seeding default rule:', insertErr);
        return; // don't write the marker so we retry next time
      }
    }

    // Write the one-time marker so we never re-seed (delete then stays deleted).
    await logSystemAudit('DEFAULT_SETTLEMENT_RULE_SEEDED', {
      source_reference: 'PESATRIX',
      rule_type: 'FIXED',
      fixed_amount: 200,
      destination_type: 'Till',
    });
  } catch (err) {
    console.error('[Settlement] ensureDefaultSettlementRules failed:', err);
  }
}

export async function getSettlementQueue() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('settlement_queue')
    .select(`
      *,
      settlement_rules (
        source_reference,
        rule_type,
        destination_shortcode,
        destination_type
      )
    `)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to get settlement queue:', error);
    return [];
  }

  return data || [];
}
