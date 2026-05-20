import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { DarajaService } from './services/daraja/darajaService';
import { validateWebhookToken, checkIdempotency, logRawPayload } from './services/daraja/webhookValidator';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

/**
 * 7. STK PUSH (Initiation Request)
 * POST /api/mpesa/stkpush
 */
app.post('/api/mpesa/stkpush', async (req, res) => {
  const { phone, amount, reference, description } = req.body;

  if (!phone || !amount || !reference) {
    return res.status(400).json({ error: 'Missing phone, amount, or reference parameter.' });
  }

  try {
    // 1. Dispatch STK Push to Safaricom Daraja API
    const mpesaResponse = await DarajaService.initiateSTKPush(
      phone,
      Number(amount),
      reference,
      description || 'STK Push Collection'
    );

    const { MerchantRequestID, CheckoutRequestID, ResponseCode, ResponseDescription, CustomerMessage } = mpesaResponse;

    // 2. Log pending transaction in database
    const { data: trx, error: txError } = await supabase
      .from('transactions')
      .insert({
        transaction_type: 'STK_PUSH',
        direction: 'incoming',
        provider: 'mpesa',
        amount: Number(amount),
        reference: reference,
        account_reference: reference,
        phone_number: phone,
        status: 'pending',
        checkout_request_id: CheckoutRequestID,
        merchant_request_id: MerchantRequestID,
        result_code: ResponseCode,
        result_desc: ResponseDescription,
        occurred_at: new Date().toISOString()
      })
      .select()
      .single();

    if (txError) throw txError;

    // 3. Save raw Daraja API response event
    await logRawPayload(trx.id, 'STK_PUSH_INITIATED', mpesaResponse, 'mpesa_api');

    return res.json({
      ResponseCode,
      ResponseDescription,
      MerchantRequestID,
      CheckoutRequestID,
      CustomerMessage
    });

  } catch (err: any) {
    console.error('[STK Push Request Error]', err);
    
    // Log API failure to audit logs
    try {
      await supabase.from('audit_logs').insert({
        action: 'STK_PUSH_API_FAILURE',
        entity_type: 'integration',
        new_values: { error: err.message, payload: req.body }
      });
    } catch {}

    return res.status(500).json({ error: err.message });
  }
});

/**
 * 8. STK PUSH QUERY (Status Check)
 * POST /api/mpesa/stkpush/query
 */
app.post('/api/mpesa/stkpush/query', async (req, res) => {
  const { checkoutRequestId } = req.body;

  if (!checkoutRequestId) {
    return res.status(400).json({ error: 'Missing checkoutRequestId parameter.' });
  }

  try {
    const statusResult = await DarajaService.querySTKPush(checkoutRequestId);
    return res.json(statusResult);
  } catch (err: any) {
    console.error('[STK Push Query Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * STK Push Webhook Callback Endpoint
 * POST /api/mpesa/callback
 */
app.post('/api/mpesa/callback', async (req, res) => {
  // Enforce secure token verification
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }

  const { Body } = req.body;
  if (!Body || !Body.stkCallback) {
    return res.status(400).json({ error: 'Invalid callback payload' });
  }

  const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = Body.stkCallback;

  try {
    // 1. Idempotency Check: Verify if callback event was already processed
    const isDuplicate = await checkIdempotency(CheckoutRequestID, 'STK_CALLBACK');
    if (isDuplicate) {
      console.log(`[Idempotency] Duplicate callback ignored for checkout ID: ${CheckoutRequestID}`);
      return res.json({ ResultCode: 0, ResultDesc: 'Success (Duplicate Callback ignored)' });
    }

    // 2. Fetch the corresponding transaction
    const { data: trx, error: txFetchError } = await supabase
      .from('transactions')
      .select('*')
      .eq('checkout_request_id', CheckoutRequestID)
      .maybeSingle();

    if (txFetchError) throw txFetchError;

    if (!trx) {
      console.warn(`[Warning] No matching transaction found for checkout ID: ${CheckoutRequestID}`);
      // Save orphaned callback payload for auditing
      await logRawPayload(null, 'STK_CALLBACK_ORPHAN', req.body, 'mpesa_webhook');
      return res.status(404).json({ error: 'Matching transaction not found' });
    }

    // If transaction is already resolved, don't execute updates (Idempotency)
    if (trx.status !== 'pending') {
      console.log(`[Idempotency] Transaction ${trx.id} already resolved as ${trx.status}`);
      return res.json({ ResultCode: 0, ResultDesc: 'Success (Transaction already resolved)' });
    }

    const success = ResultCode === 0;
    const items = CallbackMetadata?.Item || [];
    const receiptItem = items.find((i: any) => i.Name === 'MpesaReceiptNumber');
    const receipt = receiptItem ? receiptItem.Value : null;

    // 3. Save raw webhook response payload (enforce raw callback payload storage)
    await logRawPayload(trx.id, 'STK_CALLBACK', req.body, 'mpesa_webhook');

    // 4. Update transaction status
    const { data: updatedTx, error: txUpdateError } = await supabase
      .from('transactions')
      .update({
        status: success ? 'completed' : 'failed',
        external_transaction_id: receipt,
        result_code: ResultCode.toString(),
        result_desc: ResultDesc
      })
      .eq('id', trx.id)
      .select()
      .single();

    if (txUpdateError) throw txUpdateError;

    // 5. Double-Entry Ledger Adjustments (only if successful callback)
    if (success && updatedTx) {
      const { error: ledgerError } = await supabase.from('ledger_entries').insert([
        {
          transaction_id: updatedTx.id,
          account_id: 'a2222222-2222-2222-2222-222222222222', // STK Collection Channel
          entry_type: 'DEBIT',
          amount: updatedTx.amount
        },
        {
          transaction_id: updatedTx.id,
          account_id: 'a3333333-3333-3333-3333-333333333333', // Disbursements Vault
          entry_type: 'CREDIT',
          amount: updatedTx.amount
        }
      ]);

      if (ledgerError) {
        console.error('[Ledger Error] Failed to write double entry ledger rows:', ledgerError);
      }
    }

    // 6. Write to Audit Logs
    try {
      await supabase.from('audit_logs').insert({
        action: `MPESA_STK_CALLBACK_PROCESSED`,
        entity_type: 'transaction',
        entity_id: trx.id,
        new_values: { status: success ? 'completed' : 'failed', receipt }
      });
    } catch {}

    return res.json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (err: any) {
    console.error('Callback processing error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 2. C2B V2 REGISTER URL / 3. C2B PAYBILL REGISTER URL
 * POST /api/mpesa/c2b/register
 */
app.post('/api/mpesa/c2b/register', async (req, res) => {
  const { version, responseType, confirmationUrl, validationUrl } = req.body;

  if (!confirmationUrl || !validationUrl) {
    return res.status(400).json({ error: 'Missing URLs parameter.' });
  }

  try {
    const params = {
      ResponseType: responseType || 'Completed',
      ConfirmationURL: confirmationUrl,
      ValidationURL: validationUrl
    };

    let registerResult;
    if (version === 'v2') {
      registerResult = await DarajaService.registerC2BUrlV2(params);
    } else {
      registerResult = await DarajaService.registerC2BUrlV1(params);
    }

    return res.json(registerResult);
  } catch (err: any) {
    console.error('[C2B Register Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * C2B Validation Webhook Endpoint
 * POST /api/mpesa/validate
 */
app.post('/api/mpesa/validate', (req, res) => {
  console.log('[C2B Validation] Payload received:', req.body);
  // Safaricom validation URLs require returning validation approval format
  return res.json({
    ResultCode: 0,
    ResultDesc: 'Accepted'
  });
});

/**
 * C2B Confirmation Webhook Endpoint
 * POST /api/mpesa/confirm
 */
app.post('/api/mpesa/confirm', async (req, res) => {
  // Enforce callback validation
  if (!validateWebhookToken(req)) {
    return res.status(401).json({ error: 'Unauthorized webhook access' });
  }

  console.log('[C2B Confirmation] Payload received:', req.body);
  const { TransID, TransAmount, BillRefNumber, MSISDN } = req.body;

  if (!TransID || !TransAmount) {
    return res.status(400).json({ error: 'Invalid C2B confirmation body' });
  }

  try {
    // 1. Idempotency Check: Verify if transaction ID already exists in transactions
    const { data: existingTx, error: txCheckError } = await supabase
      .from('transactions')
      .select('id')
      .eq('external_transaction_id', TransID)
      .maybeSingle();

    if (txCheckError) throw txCheckError;

    if (existingTx) {
      console.log(`[Idempotency] C2B transaction ${TransID} already processed.`);
      return res.json({ ResultCode: 0, ResultDesc: 'Success (Duplicate Transaction ignored)' });
    }

    // 2. Resolve Customer ID from BillRefNumber/Phone if exists
    let customerId = null;
    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .or(`account_reference.eq."${BillRefNumber}",phone_number.eq."${MSISDN}"`)
      .maybeSingle();

    if (customer) {
      customerId = customer.id;
    }

    // 3. Create Completed Transaction
    const { data: trx, error: txError } = await supabase
      .from('transactions')
      .insert({
        transaction_type: 'PAYBILL',
        direction: 'incoming',
        provider: 'mpesa',
        external_transaction_id: TransID,
        amount: Number(TransAmount),
        reference: BillRefNumber || 'N/A',
        account_reference: BillRefNumber || 'N/A',
        phone_number: MSISDN,
        customer_id: customerId,
        status: 'completed',
        occurred_at: new Date().toISOString()
      })
      .select()
      .single();

    if (txError) throw txError;

    // 4. Save raw event payload
    await logRawPayload(trx.id, 'C2B_CONFIRMATION', req.body, 'mpesa_c2b_webhook');

    // 5. Double-Entry Ledger rows
    const { error: ledgerError } = await supabase.from('ledger_entries').insert([
      {
        transaction_id: trx.id,
        account_id: 'a1111111-1111-1111-1111-111111111111', // Paybill Collection Main
        entry_type: 'DEBIT',
        amount: trx.amount
      },
      {
        transaction_id: trx.id,
        account_id: 'a3333333-3333-3333-3333-333333333333', // Disbursements Vault
        entry_type: 'CREDIT',
        amount: trx.amount
      }
    ]);

    if (ledgerError) {
      console.error('[Ledger Error] Failed to write C2B double entry rows:', ledgerError);
    }

    // 6. Write Audit logs
    try {
      await supabase.from('audit_logs').insert({
        action: 'MPESA_C2B_CONFIRMATION_PROCESSED',
        entity_type: 'transaction',
        entity_id: trx.id,
        new_values: { receipt: TransID, amount: TransAmount }
      });
    } catch {}

    return res.json({ ResultCode: 0, ResultDesc: 'Success' });

  } catch (err: any) {
    console.error('C2B confirmation webhook error:', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 1. REVERSAL API
 * POST /api/mpesa/reversal
 */
app.post('/api/mpesa/reversal', async (req, res) => {
  const { originalTransactionId, amount, receiverParty, identifierType, remarks, occasion } = req.body;

  if (!originalTransactionId || !amount || !receiverParty) {
    return res.status(400).json({ error: 'Missing parameter.' });
  }

  try {
    const config = await resolveConfig();
    const result = await DarajaService.requestReversal({
      Initiator: config.initiatorName || 'api_user',
      SecurityCredential: config.securityCredential || 'credential',
      TransactionID: originalTransactionId,
      Amount: Number(amount),
      ReceiverParty: receiverParty,
      RecieverIdentifierType: identifierType || '4',
      ResultURL: config.callbackUrl,
      QueueTimeOutURL: config.callbackUrl,
      Remarks: remarks || 'Reversal request',
      Occasion: occasion
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[Reversal API Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 4. TRANSACTION STATUS QUERY
 * POST /api/mpesa/transaction/status
 */
app.post('/api/mpesa/transaction/status', async (req, res) => {
  const { transactionId, partyA, identifierType, remarks, occasion } = req.body;

  if (!transactionId || !partyA) {
    return res.status(400).json({ error: 'Missing parameters.' });
  }

  try {
    const config = await resolveConfig();
    const result = await DarajaService.queryTransactionStatus({
      Initiator: config.initiatorName || 'api_user',
      SecurityCredential: config.securityCredential || 'credential',
      TransactionID: transactionId,
      PartyA: partyA,
      IdentifierType: identifierType || '4',
      ResultURL: config.callbackUrl,
      QueueTimeOutURL: config.callbackUrl,
      Remarks: remarks || 'Querying transaction status',
      Occasion: occasion
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[Status Query Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 5. ACCOUNT BALANCE QUERY
 * POST /api/mpesa/account/balance
 */
app.post('/api/mpesa/account/balance', async (req, res) => {
  const { partyA, remarks } = req.body;

  if (!partyA) {
    return res.status(400).json({ error: 'Missing partyA parameters.' });
  }

  try {
    const config = await resolveConfig();
    const result = await DarajaService.queryAccountBalance({
      Initiator: config.initiatorName || 'api_user',
      SecurityCredential: config.securityCredential || 'credential',
      PartyA: partyA,
      ResultURL: config.callbackUrl,
      QueueTimeOutURL: config.callbackUrl,
      Remarks: remarks || 'Querying account balance'
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[Account Balance Query Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 6. B2C API
 * POST /api/mpesa/b2c
 */
app.post('/api/mpesa/b2c', async (req, res) => {
  const { commandId, amount, phone, remarks, occasion } = req.body;

  if (!commandId || !amount || !phone) {
    return res.status(400).json({ error: 'Missing commandId, amount, or phone parameters.' });
  }

  try {
    const config = await resolveConfig();
    const result = await DarajaService.requestB2C({
      CommandID: commandId,
      Amount: Number(amount),
      PartyB: phone,
      Remarks: remarks || 'B2C Payout',
      QueueTimeOutURL: config.callbackUrl,
      ResultURL: config.callbackUrl,
      Occasion: occasion
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[B2C API Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 9. B2B PAYMENT REQUEST
 * POST /api/mpesa/b2b
 */
app.post('/api/mpesa/b2b', async (req, res) => {
  const { commandId, receiverIdentifierType, amount, receiverParty, reference, remarks } = req.body;

  if (!commandId || !amount || !receiverParty || !reference) {
    return res.status(400).json({ error: 'Missing commandId, amount, receiverParty, or reference.' });
  }

  try {
    const config = await resolveConfig();
    const result = await DarajaService.requestB2B({
      CommandID: commandId,
      RecieverIdentifierType: receiverIdentifierType || '4',
      Amount: Number(amount),
      PartyB: receiverParty,
      AccountReference: reference,
      Remarks: remarks || 'B2B transfer',
      QueueTimeOutURL: config.callbackUrl,
      ResultURL: config.callbackUrl
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[B2B API Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 10. DYNAMIC QR CODE
 * POST /api/mpesa/qrcode
 */
app.post('/api/mpesa/qrcode', async (req, res) => {
  const { merchantName, refNo, amount, trxCode, size } = req.body;

  if (!merchantName || !refNo || !amount || !trxCode) {
    return res.status(400).json({ error: 'Missing merchantName, refNo, amount, or trxCode.' });
  }

  try {
    const result = await DarajaService.generateDynamicQR({
      MerchantName: merchantName,
      RefNo: refNo,
      Amount: Number(amount),
      TrxCode: trxCode,
      Size: size || '300x300'
    });

    return res.json(result);
  } catch (err: any) {
    console.error('[QR Code API Error]', err);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * 11. BILL MANAGER APIs
 * POST /api/mpesa/billmanager/:action
 */
app.post('/api/mpesa/billmanager/:action', async (req, res) => {
  const { action } = req.params;

  try {
    let result;
    switch (action) {
      case 'optin':
        result = await DarajaService.billManagerOptIn(req.body);
        break;
      case 'single-invoicing':
        result = await DarajaService.billManagerSingleInvoicing(req.body);
        break;
      case 'bulk-invoicing':
        result = await DarajaService.billManagerBulkInvoicing(req.body.invoices);
        break;
      case 'reconciliation':
        result = await DarajaService.billManagerReconciliation({ InvoiceRefNo: req.body.invoiceRefNo });
        break;
      case 'cancel-single':
        result = await DarajaService.billManagerCancelSingleInvoice(req.body.invoiceRefNo);
        break;
      case 'cancel-bulk':
        result = await DarajaService.billManagerCancelBulkInvoice(req.body.invoiceRefNos);
        break;
      case 'change-optin':
        result = await DarajaService.billManagerChangeOptinDetails(req.body);
        break;
      case 'change-invoice':
        result = await DarajaService.billManagerChangeInvoice(req.body);
        break;
      case 'change-invoices':
        result = await DarajaService.billManagerChangeInvoices(req.body.invoices);
        break;
      default:
        return res.status(404).json({ error: 'Unknown Bill Manager action' });
    }

    return res.json(result);
  } catch (err: any) {
    console.error(`[Bill Manager ${action} Error]`, err);
    return res.status(500).json({ error: err.message });
  }
});

const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Server] Express server running on port ${PORT}`);
});
