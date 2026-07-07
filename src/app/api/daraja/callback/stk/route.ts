import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { createTransaction } from '@/lib/repositories/transactions';
import { logSystemAudit } from '@/lib/repositories/audit';
import { triggerSettlementRule } from '@/lib/repositories/b2b';
import { triggerSmsNotification } from '@/lib/sms/send-sms';

export async function POST(req: Request) {
  try {
    const payload = await req.json();
    console.log('STK Callback Payload:', JSON.stringify(payload));

    const callback = payload?.Body?.stkCallback;
    if (!callback) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid payload' }, { status: 400 });
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc } = callback;
    const adminSupabase = createAdminClient();

    // 1. Update the stk_requests table
    const status = ResultCode === 0 ? 'SUCCESS' : 'FAILED';
    const { data: stkReq, error: fetchError } = await adminSupabase
      .from('stk_requests')
      .update({
        status,
        response_payload: payload,
      })
      .eq('checkout_request_id', CheckoutRequestID)
      .select()
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching/updating STK request:', fetchError);
    }

    // 2. If successful, log in transaction ledger
    if (ResultCode === 0 && stkReq) {
      const items = callback.CallbackMetadata?.Item || [];
      const receiptItem = items.find((i: any) => i.Name === 'MpesaReceiptNumber');
      const amountItem = items.find((i: any) => i.Name === 'Amount');
      const phoneItem = items.find((i: any) => i.Name === 'PhoneNumber');

      const mpesaReceipt = receiptItem?.Value || `TXN_${CheckoutRequestID.slice(-6)}`;
      const amount = amountItem ? Number(amountItem.Value) : Number(stkReq.amount);
      const phoneNumber = phoneItem ? String(phoneItem.Value) : String(stkReq.phone_number);

      const txnRecord = await createTransaction({
        direction: 'IN',
        transaction_type: 'STK',
        account_reference: stkReq.account_reference,
        phone_number: phoneNumber,
        amount,
        mpesa_receipt: mpesaReceipt,
        merchant_request_id: MerchantRequestID,
        checkout_request_id: CheckoutRequestID,
        status: 'SUCCESS',
        description: ResultDesc || 'STK Push Completed successfully',
        raw_payload: payload,
      });

      // Trigger settlement split rules (dispatches B2B for matching active rules)
      if (txnRecord && txnRecord.id) {
        await triggerSettlementRule(txnRecord.id, txnRecord.account_reference, txnRecord.amount, {
          direction: 'IN',
          sourceSystem: txnRecord.source_system,
          module: txnRecord.module,
        });
      }

      // Trigger SMS alerts in background (side-effect)
      triggerSmsNotification({
        direction: 'IN',
        transaction_type: 'STK',
        amount,
        account_reference: stkReq.account_reference,
        phone_number: phoneNumber,
        mpesa_receipt: mpesaReceipt
      });

      await logSystemAudit('STK_PUSH_CALLBACK_SUCCESS', {
        checkoutRequestId: CheckoutRequestID,
        receipt: mpesaReceipt,
        amount,
      });
    } else {
      await logSystemAudit('STK_PUSH_CALLBACK_FAILED', {
        checkoutRequestId: CheckoutRequestID,
        resultCode: ResultCode,
        resultDesc: ResultDesc,
      });
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (error: any) {
    console.error('STK Callback error:', error);
    return NextResponse.json({ ResultCode: 1, ResultDesc: error.message }, { status: 500 });
  }
}
