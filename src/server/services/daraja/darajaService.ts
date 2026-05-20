import { callDaraja, resolveConfig } from './darajaClient';
import {
  AccountBalanceQueryRequest,
  AccountBalanceQueryResponse,
  B2BRequest,
  B2BResponse,
  B2CRequest,
  B2CResponse,
  BillManagerCancelRequest,
  BillManagerInvoiceRequest,
  BillManagerInvoiceResponse,
  BillManagerOptInRequest,
  BillManagerResponse,
  C2BRegisterRequest,
  C2BRegisterResponse,
  DynamicQRRequest,
  DynamicQRResponse,
  ReversalRequest,
  ReversalResponse,
  STKPushQueryRequest,
  STKPushQueryResponse,
  STKPushRequest,
  STKPushResponse,
  TransactionStatusQueryRequest,
  TransactionStatusQueryResponse
} from './types';

// Helper utilities for Daraja
export function getTimestamp(): string {
  const date = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function generatePassword(shortCode: string, passKey: string, timestamp: string): string {
  return Buffer.from(`${shortCode}${passKey}${timestamp}`).toString('base64');
}

export class DarajaService {
  
  // 1. REVERSAL API
  static async requestReversal(params: Omit<ReversalRequest, 'CommandID'>): Promise<ReversalResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/mpesa/reversal/v1/request';
    
    const payload: ReversalRequest = {
      ...params,
      CommandID: 'TransactionReversal'
    };

    return callDaraja<ReversalResponse>(url, payload, config);
  }

  // 2. C2B V2 REGISTER URL
  static async registerC2BUrlV2(params: Omit<C2BRegisterRequest, 'ShortCode'>): Promise<C2BRegisterResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/mpesa/c2b/v2/registerurl';

    const payload: C2BRegisterRequest = {
      ...params,
      ShortCode: config.shortCode
    };

    return callDaraja<C2BRegisterResponse>(url, payload, config);
  }

  // 3. C2B PAYBILL REGISTER URL (V1)
  static async registerC2BUrlV1(params: Omit<C2BRegisterRequest, 'ShortCode'>): Promise<C2BRegisterResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/mpesa/c2b/v1/registerurl';

    const payload: C2BRegisterRequest = {
      ...params,
      ShortCode: config.shortCode
    };

    return callDaraja<C2BRegisterResponse>(url, payload, config);
  }

  // 4. TRANSACTION STATUS QUERY
  static async queryTransactionStatus(params: Omit<TransactionStatusQueryRequest, 'CommandID'>): Promise<TransactionStatusQueryResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/mpesa/transactionstatus/v1/query';

    const payload: TransactionStatusQueryRequest = {
      ...params,
      CommandID: 'TransactionStatusQuery'
    };

    return callDaraja<TransactionStatusQueryResponse>(url, payload, config);
  }

  // 5. ACCOUNT BALANCE QUERY
  static async queryAccountBalance(params: Omit<AccountBalanceQueryRequest, 'CommandID' | 'IdentifierType'>): Promise<AccountBalanceQueryResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/mpesa/accountbalance/v1/query';

    const payload: AccountBalanceQueryRequest = {
      ...params,
      CommandID: 'AccountBalance',
      IdentifierType: '4' // Shortcode identifier
    };

    return callDaraja<AccountBalanceQueryResponse>(url, payload, config);
  }

  // 6. B2C API
  static async requestB2C(params: Omit<B2CRequest, 'InitiatorName' | 'SecurityCredential' | 'PartyA'>): Promise<B2CResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/mpesa/b2c/v1/paymentrequest';

    const payload: B2CRequest = {
      ...params,
      InitiatorName: config.initiatorName || 'api_user',
      SecurityCredential: config.securityCredential || 'credential',
      PartyA: config.b2cShortCode || config.shortCode
    };

    return callDaraja<B2CResponse>(url, payload, config);
  }

  // 7. STK PUSH (Express Process Request)
  static async initiateSTKPush(phone: string, amount: number, reference: string, description: string): Promise<STKPushResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest';
    
    const timestamp = getTimestamp();
    const password = generatePassword(config.shortCode, config.passkey, timestamp);

    // Normalize phone number to MSISDN standard (e.g. 254712345678)
    let formattedPhone = phone.replace(/[^0-9]/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('7') || formattedPhone.startsWith('1')) {
      formattedPhone = '254' + formattedPhone;
    }

    const payload: STKPushRequest = {
      BusinessShortCode: config.shortCode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline', // Default to Paybill collections
      Amount: amount,
      PartyA: formattedPhone,
      PartyB: config.shortCode,
      PhoneNumber: formattedPhone,
      CallBackURL: config.callbackUrl,
      AccountReference: reference,
      TransactionDesc: description || 'Fintech payment'
    };

    return callDaraja<STKPushResponse>(url, payload, config);
  }

  // 8. STK PUSH QUERY
  static async querySTKPush(checkoutRequestId: string): Promise<STKPushQueryResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query';

    const timestamp = getTimestamp();
    const password = generatePassword(config.shortCode, config.passkey, timestamp);

    const payload: STKPushQueryRequest = {
      BusinessShortCode: config.shortCode,
      Password: password,
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId
    };

    return callDaraja<STKPushQueryResponse>(url, payload, config);
  }

  // 9. B2B PAYMENT REQUEST
  static async requestB2B(params: Omit<B2BRequest, 'Initiator' | 'SecurityCredential' | 'PartyA' | 'SenderIdentifierType'>): Promise<B2BResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/mpesa/b2b/v1/paymentrequest';

    const payload: B2BRequest = {
      ...params,
      Initiator: config.initiatorName || 'api_user',
      SecurityCredential: config.securityCredential || 'credential',
      PartyA: config.b2bShortCode || config.shortCode,
      SenderIdentifierType: '4' // Business shortcode identifier
    };

    return callDaraja<B2BResponse>(url, payload, config);
  }

  // 10. DYNAMIC QR CODE
  static async generateDynamicQR(params: Omit<DynamicQRRequest, 'CPI'>): Promise<DynamicQRResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/mpesa/qrcode/v1/generate';

    const payload: DynamicQRRequest = {
      ...params,
      CPI: config.shortCode
    };

    return callDaraja<DynamicQRResponse>(url, payload, config);
  }

  // 11. BILL MANAGER APIs
  
  // OPT-IN
  static async billManagerOptIn(params: Omit<BillManagerOptInRequest, 'ShortCode' | 'CallbackURL'>): Promise<BillManagerResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/optin';

    const payload: BillManagerOptInRequest = {
      ...params,
      ShortCode: config.shortCode,
      CallbackURL: config.callbackUrl
    };

    return callDaraja<BillManagerResponse>(url, payload, config);
  }

  // SINGLE INVOICING
  static async billManagerSingleInvoicing(params: Omit<BillManagerInvoiceRequest, 'ShortCode'>): Promise<BillManagerInvoiceResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/single-invoicing';

    const payload: BillManagerInvoiceRequest = {
      ...params,
      ShortCode: config.shortCode
    };

    return callDaraja<BillManagerInvoiceResponse>(url, payload, config);
  }

  // BULK INVOICING
  static async billManagerBulkInvoicing(invoices: Array<Omit<BillManagerInvoiceRequest, 'ShortCode'>>): Promise<BillManagerInvoiceResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/bulk-invoicing';

    const payload = invoices.map(inv => ({
      ...inv,
      ShortCode: config.shortCode
    }));

    return callDaraja<BillManagerInvoiceResponse>(url, payload, config);
  }

  // RECONCILIATION
  static async billManagerReconciliation(params: { InvoiceRefNo: string }): Promise<BillManagerResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/reconciliation';

    const payload = {
      ShortCode: config.shortCode,
      InvoiceRefNo: params.InvoiceRefNo
    };

    return callDaraja<BillManagerResponse>(url, payload, config);
  }

  // CANCEL SINGLE INVOICE
  static async billManagerCancelSingleInvoice(invoiceRefNo: string): Promise<BillManagerResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/cancel-single-invoice';

    const payload: BillManagerCancelRequest = {
      ShortCode: config.shortCode,
      InvoiceRefNo: invoiceRefNo
    };

    return callDaraja<BillManagerResponse>(url, payload, config);
  }

  // CANCEL BULK INVOICE
  static async billManagerCancelBulkInvoice(invoiceRefNos: string[]): Promise<BillManagerResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/cancel-bulk-invoice';

    const payload = {
      ShortCode: config.shortCode,
      Invoices: invoiceRefNos.map(ref => ({ InvoiceRefNo: ref }))
    };

    return callDaraja<BillManagerResponse>(url, payload, config);
  }

  // UPDATE ONBOARDING DETAILS
  static async billManagerChangeOptinDetails(params: Omit<BillManagerOptInRequest, 'ShortCode' | 'CallbackURL'>): Promise<BillManagerResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/change-optin-details';

    const payload: BillManagerOptInRequest = {
      ...params,
      ShortCode: config.shortCode,
      CallbackURL: config.callbackUrl
    };

    return callDaraja<BillManagerResponse>(url, payload, config);
  }

  // UPDATE SINGLE INVOICE
  static async billManagerChangeInvoice(params: Omit<BillManagerInvoiceRequest, 'ShortCode'>): Promise<BillManagerInvoiceResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/change-invoice';

    const payload: BillManagerInvoiceRequest = {
      ...params,
      ShortCode: config.shortCode
    };

    return callDaraja<BillManagerInvoiceResponse>(url, payload, config);
  }

  // UPDATE BULK INVOICES
  static async billManagerChangeInvoices(invoices: Array<Omit<BillManagerInvoiceRequest, 'ShortCode'>>): Promise<BillManagerInvoiceResponse> {
    const config = await resolveConfig();
    const url = 'https://api.safaricom.co.ke/v1/billmanager-invoice/v1/billmanager-invoice/change-invoices';

    const payload = invoices.map(inv => ({
      ...inv,
      ShortCode: config.shortCode
    }));

    return callDaraja<BillManagerInvoiceResponse>(url, payload, config);
  }
}
