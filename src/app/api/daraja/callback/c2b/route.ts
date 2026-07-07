import { NextResponse } from 'next/server';
import { createTransaction } from '@/lib/repositories/transactions';
import { createAdminClient } from '@/lib/supabase/server';
import { logSystemAudit } from '@/lib/repositories/audit';
import { triggerSettlementRule } from '@/lib/repositories/b2b';
import { triggerSmsNotification } from '@/lib/sms/send-sms';
import { triggerPesatrixWebhookForTransaction } from '@/lib/paybill-webhook';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log('C2B Callback Payload:', JSON.stringify(payload));

    const {
      TransID,
      TransAmount,
      BillRefNumber,
      MSISDN,
      OrgAccountBalance,
      TransactionType,
    } = payload;

    if (!TransID || !TransAmount) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Missing TransID or TransAmount' }, { status: 400 });
    }

    const amount = Number(TransAmount);
    const reference = BillRefNumber ? String(BillRefNumber).trim() : null;
    const phone = MSISDN ? String(MSISDN).trim() : null;

    const adminSupabase = createAdminClient();

    // 1. Check if transaction with the same mpesa_receipt already exists (inserted by webhook first)
    const { data: existingTx, error: txCheckErr } = await adminSupabase
      .from('transactions')
      .select('*')
      .eq('mpesa_receipt', TransID)
      .maybeSingle();

    let transaction;
    if (existingTx) {
      // Reconcile and update status to SUCCESS
      const { data: updatedTx, error: updateErr } = await adminSupabase
        .from('transactions')
        .update({
          status: 'SUCCESS',
          raw_payload: {
            ...existingTx.raw_payload,
            c2b_callback: payload
          },
          reconciliation_status: 'matched',
          updated_at: new Date().toISOString()
        })
        .eq('id', existingTx.id)
        .select()
        .single();
      
      if (updateErr) {
        console.error('Failed to update existing C2B transaction:', updateErr);
        throw updateErr;
      }
      transaction = updatedTx;
    } else {
      // Create new transaction
      transaction = await createTransaction({
        direction: 'IN',
        transaction_type: 'C2B',
        account_reference: reference,
        phone_number: phone,
        amount,
        mpesa_receipt: TransID,
        status: 'SUCCESS',
        description: `C2B PayBill payment - Type: ${TransactionType || 'Pay Bill'}`,
        raw_payload: payload,
      });
    }

    // Trigger settlement split rules (dispatches B2B for matching active rules)
    if (transaction && transaction.id) {
      await triggerSettlementRule(transaction.id, transaction.account_reference, transaction.amount, {
        direction: 'IN',
        sourceSystem: transaction.source_system,
        module: transaction.module,
      });

      // If transaction is from Pesatrix, notify the Pesatrix application
      if (transaction.source_system === 'pesatrix') {
        triggerPesatrixWebhookForTransaction(transaction.id).catch(err => {
          console.error('[C2B Callback] Failed triggering Pesatrix webhook:', err);
        });
      }
    }

    // Trigger SMS alerts in background (side-effect)
    triggerSmsNotification({
      direction: 'IN',
      transaction_type: 'C2B',
      amount,
      account_reference: reference,
      phone_number: phone,
      mpesa_receipt: TransID
    });

    // Write a balance snapshot if OrgAccountBalance is available
    if (OrgAccountBalance) {
      const adminSupabase = createAdminClient();
      const currentBalance = Number(OrgAccountBalance);
      
      await adminSupabase
        .from('balance_snapshots')
        .insert({
          balance: currentBalance,
          fetched_at: new Date().toISOString(),
        });
    }

    await logSystemAudit('C2B_PAYMENT_RECEIVED', {
      receipt: TransID,
      amount,
      reference,
      phone,
    });

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Confirmation received successfully' });
  } catch (error: any) {
    console.error('C2B Callback error:', error);
    return NextResponse.json({ ResultCode: 1, ResultDesc: error.message }, { status: 500 });
  }
}
