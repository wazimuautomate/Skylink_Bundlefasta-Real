export interface DarajaConfig {
  env: 'sandbox' | 'production';
  consumerKey: string;
  consumerSecret: string;
  shortCode: string;
  passkey: string;
  callbackUrl: string;
  initiatorName?: string;
  securityCredential?: string;
  b2cShortCode?: string;
  b2bShortCode?: string;
}

export interface AccessTokenResponse {
  access_token: string;
  expires_in: string;
}

// 1. REVERSAL API
export interface ReversalRequest {
  Initiator: string;
  SecurityCredential: string;
  CommandID: 'TransactionReversal';
  TransactionID: string;
  Amount: number;
  ReceiverParty: string; // Shortcode or MSISDN
  RecieverIdentifierType: '1' | '2' | '4'; // 1 = MSISDN, 2 = Till, 4 = Shortcode
  ResultURL: string;
  QueueTimeOutURL: string;
  Remarks: string;
  Occasion?: string;
}

export interface ReversalResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

// 2. & 3. C2B REGISTER URL (V1 & V2)
export interface C2BRegisterRequest {
  ShortCode: string;
  ResponseType: 'Completed' | 'Cancelled';
  ConfirmationURL: string;
  ValidationURL: string;
}

export interface C2BRegisterResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseDescription: string;
}

// 4. TRANSACTION STATUS QUERY
export interface TransactionStatusQueryRequest {
  Initiator: string;
  SecurityCredential: string;
  CommandID: 'TransactionStatusQuery';
  TransactionID: string;
  PartyA: string; // Shortcode
  IdentifierType: '1' | '2' | '4'; // 1 = MSISDN, 2 = Till, 4 = Shortcode
  ResultURL: string;
  QueueTimeOutURL: string;
  Remarks: string;
  Occasion?: string;
}

export interface TransactionStatusQueryResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

// 5. ACCOUNT BALANCE QUERY
export interface AccountBalanceQueryRequest {
  Initiator: string;
  SecurityCredential: string;
  CommandID: 'AccountBalance';
  PartyA: string; // Shortcode
  IdentifierType: '4'; // Shortcode
  ResultURL: string;
  QueueTimeOutURL: string;
  Remarks: string;
}

export interface AccountBalanceQueryResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

// 6. B2C API
export interface B2CRequest {
  InitiatorName: string;
  SecurityCredential: string;
  CommandID: 'SalaryPayment' | 'BusinessPayment' | 'PromotionPayment';
  Amount: number;
  PartyA: string; // shortcode
  PartyB: string; // MSISDN phone
  Remarks: string;
  QueueTimeOutURL: string;
  ResultURL: string;
  Occasion?: string;
}

export interface B2CResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

// 7. STK PUSH
export interface STKPushRequest {
  BusinessShortCode: string;
  Password: string; // base64 encoded Shortcode + Passkey + Timestamp
  Timestamp: string; // yyyyMMddHHmmss
  TransactionType: 'CustomerPayBillOnline' | 'CustomerBuyGoodsOnline';
  Amount: number;
  PartyA: string; // MSISDN phone
  PartyB: string; // Shortcode
  PhoneNumber: string; // MSISDN phone
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

export interface STKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

// 8. STK PUSH QUERY
export interface STKPushQueryRequest {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  CheckoutRequestID: string;
}

export interface STKPushQueryResponse {
  ResponseCode: string;
  ResponseDescription: string;
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResultCode: string;
  ResultDesc: string;
}

// 9. B2B PAYMENT REQUEST
export interface B2BRequest {
  Initiator: string;
  SecurityCredential: string;
  CommandID: 'BusinessPayBill' | 'BusinessBuyGoods' | 'DisburseFundsToReceiver' | 'BusinessToBusinessTransfer' | 'MerchantToMerchantTransfer';
  SenderIdentifierType: '4'; // Shortcode
  RecieverIdentifierType: '4' | '2'; // 4 = Shortcode, 2 = Till
  Amount: number;
  PartyA: string; // Shortcode (sender)
  PartyB: string; // Shortcode or Till (receiver)
  AccountReference: string; // E.g. BusinessPayBill reference
  Remarks: string;
  QueueTimeOutURL: string;
  ResultURL: string;
}

export interface B2BResponse {
  ConversationID: string;
  OriginatorConversationID: string;
  ResponseCode: string;
  ResponseDescription: string;
}

// 10. DYNAMIC QR CODE
export interface DynamicQRRequest {
  MerchantName: string;
  RefNo: string;
  Amount: number;
  TrxCode: 'BG' | 'PB' | 'WA' | 'PY' | 'SG'; // BG = Buy Goods, PB = Pay Bill, etc.
  CPI: string; // Shortcode or Till
  Size: string; // QR dimension e.g. "300x300"
}

export interface DynamicQRResponse {
  ResponseCode: string;
  ResponseDescription: string;
  QRCode: string; // Base64 encoded string or raw image URL
}

// 11. BILL MANAGER APIs
export interface BillManagerOptInRequest {
  ShortCode: string;
  Logo?: string; // base64 encoded
  Email: string;
  PhoneNumber: string;
  CallbackURL: string;
}

export interface BillManagerInvoiceRequest {
  ShortCode: string;
  InvoiceRefNo: string;
  BilledAmount: number;
  BilledPeriod: string; // e.g. "05-2026"
  DueDate: string; // YYYY-MM-DD
  CustomerName: string;
  CustomerEmail: string;
  CustomerPhone: string;
  InvoiceItems: Array<{
    ItemName: string;
    ItemQuantity: number;
    ItemUnitCost: number;
    ItemTotalCost: number;
  }>;
}

export interface BillManagerInvoiceResponse {
  ResponseCode: string;
  ResponseDescription: string;
}

export interface BillManagerCancelRequest {
  ShortCode: string;
  InvoiceRefNo: string;
}

export interface BillManagerResponse {
  ResponseCode: string;
  ResponseDescription: string;
}
