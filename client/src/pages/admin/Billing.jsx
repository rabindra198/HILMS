import { DollarSign, CreditCard, FileText, CheckCircle2 } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Header } from "@/components/layout/Header";

const mockBillingStats = [
  { title: "Today's Revenue", value: "Rs. 84,500", icon: DollarSign, color: "green" },
  { title: "Pending Payments", value: "Rs. 12,400", icon: CreditCard, color: "orange" },
  { title: "Paid Invoices", value: "86", icon: CheckCircle2, color: "blue" },
  { title: "Outstanding", value: "Rs. 5,200", icon: FileText, color: "red" },
];

const mockInvoices = [
  { id: "INV-001", patient: "John Doe", service: "Consultation - Cardiology", amount: "Rs. 1,500", status: "Paid", date: "2026-08-23" },
  { id: "INV-002", patient: "Aarav Thapa", service: "Lab Test - Blood Sugar", amount: "Rs. 800", status: "Pending", date: "2026-08-23" },
  { id: "INV-003", patient: "Sita Rai", service: "Consultation - Dermatology", amount: "Rs. 1,200", status: "Paid", date: "2026-08-22" },
  { id: "INV-004", patient: "Ram Thapa", service: "Lab Test - CBC", amount: "Rs. 600", status: "Failed", date: "2026-08-22" },
];

export default function BillingPage() {
  return (
    <div className="space-y-6">
      <Header title="Billing" />
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">Billing & Payments</h2>
          <p className="text-sm text-muted-foreground">Manage invoices, payments, and outstanding balances.</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {mockBillingStats.map((stat) => (
          <div key={stat.title} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{stat.title}</p>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
              </div>
              <div className={`flex size-10 items-center justify-center rounded-lg ${
                stat.color === "green" ? "bg-emerald-500/10 text-emerald-600" :
                stat.color === "orange" ? "bg-orange-500/10 text-orange-600" :
                stat.color === "blue" ? "bg-blue-500/10 text-blue-600" :
                "bg-red-500/10 text-red-600"
              }`}>
                <stat.icon className="size-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">Recent Invoices</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Invoice ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Service</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Amount</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {mockInvoices.map((inv) => (
                <tr key={inv.id} className="transition-colors hover:bg-muted/50">
                  <td className="px-4 py-3 font-mono text-xs font-medium text-foreground">{inv.id}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{inv.patient}</td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.service}</td>
                  <td className="px-4 py-3 font-medium text-foreground">{inv.amount}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{inv.date}</td>
                  <td className="px-4 py-3">
                    <button className="text-sm font-medium text-primary hover:underline">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
