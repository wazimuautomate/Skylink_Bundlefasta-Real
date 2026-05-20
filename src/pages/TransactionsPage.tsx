import { TransactionTable } from '../components/TransactionTable';

export function TransactionsPage() {
  return (
    <div className="h-[calc(100vh-144px)] flex flex-col pb-8">
      <TransactionTable />
    </div>
  );
}
