import { createClient } from '@supabase/supabase-js';
import { parseTransactionStatusResult } from './parseTransactionStatusResult';

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function handleTransactionStatusResult(payload: any, clientIp: string) {
  const result = payload?.Result;
  if (!result) {
    throw new Error('Invalid payload: Missing Result object');
  }

  const conversationId = result.ConversationID;
  if (!conversationId) {
    throw new Error('Invalid payload: Missing ConversationID');
  }

  // 1. Fetch the query record
  const { data: queryRecord, error: queryError } = await supabase
    .from('transaction_status_queries')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (queryError) throw queryError;
  if (!queryRecord) {
    console.warn(`[TransactionStatus Webhook] No query record found for ConversationID: ${conversationId}`);
    return { success: false, reason: 'Query record not found' };
  }

  // Idempotency: Skip if query is already resolved
  if (queryRecord.status === 'completed' || queryRecord.status === 'failed') {
    console.log(`[TransactionStatus Webhook] Query ${queryRecord.id} already resolved as: ${queryRecord.status}`);
    return { success: true, reason: 'Already resolved' };
  }

  const parsed = parseTransactionStatusResult(payload);
  const isOk = parsed.resultCode === '0';
  const queryFinalStatus = isOk ? 'completed' : 'failed';

  // 2. Update the query record with the result
  const { error: updateQueryError } = await supabase
    .from('transaction_status_queries')
    .update({
      status: queryFinalStatus,
      raw_result: payload,
      updated_at: new Date().toISOString()
    })
    .eq('id', queryRecord.id);

  if (updateQueryError) throw updateQueryError;

  // 3. Log Audit event
  await supabase.from('audit_logs').insert({
    action: 'TRANSACTION_STATUS_CALLBACK_PROCESSED',
    entity_type: 'transaction_status_queries',
    entity_id: queryRecord.id,
    new_values: {
      resultCode: parsed.resultCode,
      resultDesc: parsed.resultDesc,
      status: parsed.transactionStatus,
      clientIp
    }
  });

  const targetTransactionId = queryRecord.transaction_id;
  const isTxSuccess = parsed.transactionStatus === 'Completed' || parsed.transactionStatus === 'Success';
  const nextTxStatus = isTxSuccess ? 'completed' : 'failed';

  let alertMessage = `Status query for transaction ${targetTransactionId} completed. Result: ${parsed.resultDesc || 'Unknown'}`;

  // 4. Resolve the original transaction based on query_type
  if (queryRecord.query_type === 'C2B' || queryRecord.query_type === 'STK_PUSH' || queryRecord.query_type === 'REVERSAL') {
    // Both C2B and STK_PUSH/REVERSAL are stored in the 'transactions' table
    const { data: existingTx, error: fetchTxError } = await supabase
      .from('transactions')
      .select('*')
      .eq('external_transaction_id', targetTransactionId)
      .maybeSingle();

    if (fetchTxError) throw fetchTxError;

    if (existingTx) {
      if (existingTx.status === 'pending' || existingTx.status === 'orphaned') {
        const { error: txUpdateErr } = await supabase
          .from('transactions')
          .update({
            status: nextTxStatus,
            result_code: parsed.resultCode,
            result_desc: parsed.resultDesc || parsed.transactionStatus
          })
          .eq('id', existingTx.id);

        if (txUpdateErr) throw txUpdateErr;

        // Write ledger entries if it is successfully completed
        if (nextTxStatus === 'completed') {
          const debitAccount = existingTx.transaction_type === 'STK_PUSH' 
            ? 'a2222222-2222-2222-2222-222222222222' // STK Collection Channel
            : 'a1111111-1111-1111-1111-111111111111'; // Paybill Collection Main

          await supabase.from('ledger_entries').insert([
            {
              transaction_id: existingTx.id,
              account_id: debitAccount,
              entry_type: 'DEBIT',
              amount: existingTx.amount
            },
            {
              transaction_id: existingTx.id,
              account_id: 'a3333333-3333-3333-3333-333333333333', // Disbursements Vault
              entry_type: 'CREDIT',
              amount: existingTx.amount
            }
          ]);
        }

        alertMessage = `Transaction ${targetTransactionId} status resolved to ${nextTxStatus.toUpperCase()}.`;
      } else {
        alertMessage = `Transaction ${targetTransactionId} was already resolved as ${existingTx.status.toUpperCase()}.`;
      }
    } else {
      // Reconstruct missing transaction (C2B / collections recovery)
      if (isTxSuccess) {
        const { data: newTx, error: txInsertErr } = await supabase
          .from('transactions')
          .insert({
            transaction_type: queryRecord.query_type === 'REVERSAL' ? 'REVERSAL' : 'PAYBILL',
            direction: queryRecord.query_type === 'REVERSAL' ? 'outgoing' : 'incoming',
            provider: 'mpesa',
            external_transaction_id: targetTransactionId,
            amount: parsed.amount || 0,
            reference: 'RECONCILED',
            account_reference: 'RECONCILED',
            phone_number: 'N/A',
            status: 'completed',
            occurred_at: parsed.transactionCompletedAt 
              ? parsed.transactionCompletedAt.toISOString() 
              : new Date().toISOString()
          })
          .select()
          .single();

        if (txInsertErr) {
          console.error('[TransactionStatus webhook] Reconstruct transaction failed:', txInsertErr);
        } else if (newTx) {
          // Double-Entry Ledger rows
          const debitAccount = queryRecord.query_type === 'REVERSAL' 
            ? 'a3333333-3333-3333-3333-333333333333' // Reverse disbursement
            : 'a1111111-1111-1111-1111-111111111111'; // Paybill Collection Main

          const creditAccount = queryRecord.query_type === 'REVERSAL'
            ? 'a1111111-1111-1111-1111-111111111111'
            : 'a3333333-3333-3333-3333-333333333333';

          await supabase.from('ledger_entries').insert([
            {
              transaction_id: newTx.id,
              account_id: debitAccount,
              entry_type: 'DEBIT',
              amount: newTx.amount
            },
            {
              transaction_id: newTx.id,
              account_id: creditAccount,
              entry_type: 'CREDIT',
              amount: newTx.amount
            }
          ]);

          alertMessage = `Reconstructed missing transaction ${targetTransactionId} as COMPLETED.`;
        }
      }
    }
  } else if (queryRecord.query_type === 'B2C') {
    // B2C Topup
    const { data: b2cTrx, error: b2cError } = await supabase
      .from('b2c_account_topups')
      .select('*')
      .or(`transaction_id.eq."${targetTransactionId}",conversation_id.eq."${queryRecord.conversation_id}"`)
      .maybeSingle();

    if (b2cError) throw b2cError;

    if (b2cTrx) {
      if (b2cTrx.status !== 'success' && b2cTrx.status !== 'failed') {
        const finalStatus = isTxSuccess ? 'success' : 'failed';
        const { data: updatedB2c, error: b2cUpdateError } = await supabase
          .from('b2c_account_topups')
          .update({
            status: finalStatus,
            transaction_id: parsed.receiptNo || b2cTrx.transaction_id,
            result_code: parsed.resultCode,
            result_description: parsed.resultDesc || parsed.transactionStatus,
            transaction_completed_at: parsed.transactionCompletedAt 
              ? parsed.transactionCompletedAt.toISOString() 
              : new Date().toISOString(),
            raw_result: payload,
            updated_at: new Date().toISOString()
          })
          .eq('id', b2cTrx.id)
          .select()
          .single();

        if (b2cUpdateError) throw b2cUpdateError;

        // Perform ledger movements if successful
        if (finalStatus === 'success' && updatedB2c) {
          // Mirror in transactions
          const { error: txMirrorErr } = await supabase
            .from('transactions')
            .insert({
              id: updatedB2c.id,
              transaction_type: 'treasury_topup',
              direction: 'transfer',
              provider: 'mpesa',
              external_transaction_id: updatedB2c.transaction_id,
              reference: updatedB2c.account_reference || 'B2C_TOPUP',
              amount: updatedB2c.amount,
              status: 'completed',
              occurred_at: updatedB2c.transaction_completed_at
            });

          if (!txMirrorErr) {
            await supabase.from('ledger_entries').insert([
              {
                transaction_id: updatedB2c.id,
                account_id: 'a3333333-3333-3333-3333-333333333333', // Disbursement Vault (DEBIT - asset increase)
                entry_type: 'DEBIT',
                amount: updatedB2c.amount
              },
              {
                transaction_id: updatedB2c.id,
                account_id: 'a1111111-1111-1111-1111-111111111111', // Paybill Collection Main (CREDIT - asset decrease)
                entry_type: 'CREDIT',
                amount: updatedB2c.amount
              }
            ]);

            await supabase.rpc('decrement_account_balance', { 
              account_uuid: 'a1111111-1111-1111-1111-111111111111', 
              amount_val: updatedB2c.amount 
            });

            await supabase.rpc('increment_account_balance', { 
              account_uuid: 'a3333333-3333-3333-3333-333333333333', 
              amount_val: updatedB2c.amount 
            });
          }
        }

        alertMessage = `B2C Float topup ${targetTransactionId} resolved to ${finalStatus.toUpperCase()}.`;
      }
    }
  } else if (queryRecord.query_type === 'B2B') {
    // B2B Payment
    const { data: b2bTrx, error: b2bError } = await supabase
      .from('business_buy_goods_transactions')
      .select('*')
      .or(`transaction_id.eq."${targetTransactionId}",conversation_id.eq."${queryRecord.conversation_id}"`)
      .maybeSingle();

    if (b2bError) throw b2bError;

    if (b2bTrx) {
      if (b2bTrx.status !== 'success' && b2bTrx.status !== 'failed') {
        const finalStatus = isTxSuccess ? 'success' : 'failed';
        const { data: updatedB2b, error: b2bUpdateError } = await supabase
          .from('business_buy_goods_transactions')
          .update({
            status: finalStatus,
            transaction_id: parsed.receiptNo || b2bTrx.transaction_id,
            result_code: parsed.resultCode,
            result_description: parsed.resultDesc || parsed.transactionStatus,
            transaction_completed_at: parsed.transactionCompletedAt 
              ? parsed.transactionCompletedAt.toISOString() 
              : new Date().toISOString(),
            raw_result: payload,
            updated_at: new Date().toISOString()
          })
          .eq('id', b2bTrx.id)
          .select()
          .single();

        if (b2bUpdateError) throw b2bUpdateError;

        if (finalStatus === 'success' && updatedB2b) {
          // Mirror in transactions
          const { error: txMirrorErr } = await supabase
            .from('transactions')
            .insert({
              id: updatedB2b.id,
              transaction_type: 'disbursement',
              direction: 'outbound',
              provider: 'mpesa',
              external_transaction_id: updatedB2b.transaction_id,
              reference: updatedB2b.account_reference || 'B2B_PAYOUT',
              amount: updatedB2b.amount,
              status: 'completed',
              occurred_at: updatedB2b.transaction_completed_at
            });

          if (!txMirrorErr) {
            await supabase.from('ledger_entries').insert([
              {
                transaction_id: updatedB2b.id,
                account_id: 'a3333333-3333-3333-3333-333333333333', // Disbursement Vault (CREDIT)
                entry_type: 'CREDIT',
                amount: updatedB2b.amount
              }
            ]);

            await supabase.rpc('decrement_account_balance', { 
              account_uuid: 'a3333333-3333-3333-3333-333333333333', 
              amount_val: updatedB2b.amount 
            });
          }
        }

        alertMessage = `B2B payout ${targetTransactionId} resolved to ${finalStatus.toUpperCase()}.`;
      }
    }
  }

  // 5. Trigger platform notification
  try {
    await supabase.from('notifications').insert({
      channel: 'dashboard',
      recipient: queryRecord.created_by || 'admin',
      message: alertMessage,
      status: 'sent',
      created_at: new Date().toISOString()
    });
  } catch (notifErr) {
    console.error('[TransactionStatus webhook] Notification insert failed:', notifErr);
  }

  return { success: true, status: queryFinalStatus };
}
