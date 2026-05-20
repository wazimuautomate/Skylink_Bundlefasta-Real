export interface ParsedTransactionStatusResult {
  resultCode: string;
  resultDesc: string;
  transactionId?: string;
  receiptNo?: string;
  transactionStatus?: string;
  amount?: number;
  receiverPartyName?: string;
  initiatorPartyName?: string;
  transactionCompletedAt?: Date;
  rawParams: Record<string, any>;
}

/**
 * Extracts transaction status query callback parameters from the Safaricom Callback structure.
 */
export function parseTransactionStatusResult(payload: any): ParsedTransactionStatusResult {
  const result = payload?.Result;
  if (!result) {
    throw new Error('Invalid webhook payload structure: Missing Result object.');
  }

  const parsed: ParsedTransactionStatusResult = {
    resultCode: result.ResultCode?.toString() || 'unknown',
    resultDesc: result.ResultDesc || '',
    rawParams: {}
  };

  if (result.TransactionID) {
    parsed.transactionId = result.TransactionID;
  }

  const params = result.ResultParameters?.ResultParameter || [];
  for (const p of params) {
    const name = p.Name;
    const val = p.Value;
    if (!name || val === undefined) continue;

    parsed.rawParams[name] = val;

    switch (name) {
      case 'ReceiptNo':
        parsed.receiptNo = val.toString();
        break;
      case 'TransactionStatus':
        parsed.transactionStatus = val.toString(); // e.g. "Completed", "Failed"
        break;
      case 'Amount':
        parsed.amount = Number(val);
        break;
      case 'ReceiverPartyPublicName':
        parsed.receiverPartyName = val.toString();
        break;
      case 'InitiatorPartyPublicName':
        parsed.initiatorPartyName = val.toString();
        break;
      case 'TransactionCompletedDateTime':
        try {
          let dateStr = val.toString();
          // Convert standard Safaricom date format "DD.MM.YYYY HH:MM:SS" to ISO
          if (dateStr.includes('.') && dateStr.length === 19) {
            const parts = dateStr.split(' ');
            const dateParts = parts[0].split('.');
            dateStr = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]} ${parts[1]}`;
          }
          parsed.transactionCompletedAt = new Date(dateStr);
        } catch {
          parsed.transactionCompletedAt = new Date();
        }
        break;
    }
  }

  return parsed;
}
