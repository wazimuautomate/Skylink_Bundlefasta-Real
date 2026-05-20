export interface ParsedB2BResult {
  resultCode: string;
  resultDesc: string;
  transactionId?: string;
  amount?: number;
  receiverPartyName?: string;
  transactionCompletedAt?: Date;
  debitAccountBalance?: string;
  debitPartyBalance?: string;
  initiatorBalance?: string;
}

/**
 * Extracts B2B transaction key-value parameters from standard Safaricom Callback structures.
 */
export function parseBusinessBuyGoodsResult(payload: any): ParsedB2BResult {
  const result = payload?.Result;
  if (!result) {
    throw new Error('Invalid webhook payload structure: Missing Result object.');
  }

  const parsed: ParsedB2BResult = {
    resultCode: result.ResultCode?.toString() || 'unknown',
    resultDesc: result.ResultDesc || ''
  };

  if (result.TransactionID) {
    parsed.transactionId = result.TransactionID;
  }

  const params = result.ResultParameters?.ResultParameter || [];
  for (const p of params) {
    const name = p.Name;
    const val = p.Value;
    if (!name || val === undefined) continue;

    switch (name) {
      case 'DebitAccountBalance':
        parsed.debitAccountBalance = val.toString();
        break;
      case 'DebitPartyBalance':
        parsed.debitPartyBalance = val.toString();
        break;
      case 'InitiatorBalance':
        parsed.initiatorBalance = val.toString();
        break;
      case 'Amount':
        parsed.amount = Number(val);
        break;
      case 'ReceiverPartyPublicName':
        parsed.receiverPartyName = val.toString();
        break;
      case 'TransactionCompletedDateTime':
        try {
          // Date format in Safaricom callbacks can be "YYYY-MM-DD HH:mm:ss" or similar
          // Replace dots or slash separators to clean date parse if needed
          let dateStr = val.toString();
          if (dateStr.includes('.') && dateStr.length === 19) {
            // "20.05.2026 08:30:15" -> Convert dots to dashes/slashes if browser or node engine requires it
            const parts = dateStr.split(' ');
            const dateParts = parts[0].split('.');
            dateStr = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]} ${parts[1]}`;
          }
          parsed.transactionCompletedAt = new Date(dateStr);
        } catch {
          // Fallback to current date if parsing crashes
          parsed.transactionCompletedAt = new Date();
        }
        break;
    }
  }

  return parsed;
}
