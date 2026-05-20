import { KPICards } from '../components/KPICards';
import { TransactionChart } from '../components/TransactionChart';
import { ReconciliationWidget } from '../components/ReconciliationWidget';
import { TransactionTable } from '../components/TransactionTable';
import { AlertsPanel } from '../components/AlertsPanel';

export function Dashboard() {
  return (
    <div className="space-y-6">
      <KPICards />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <TransactionChart />
        </div>
        <div className="lg:col-span-1">
          <ReconciliationWidget />
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pb-8">
        <div className="lg:col-span-2 h-[400px] sm:h-[500px]">
          <TransactionTable />
        </div>
        <div className="lg:col-span-1 h-[400px] sm:h-[500px]">
          <AlertsPanel />
        </div>
      </div>
    </div>
  );
}
