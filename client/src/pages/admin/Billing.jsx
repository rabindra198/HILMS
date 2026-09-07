import { DollarSign, CreditCard, FileText, CheckCircle2, Plus, Download } from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";

const mockBillingStats = [
  { title: "Today's Revenue", value: "Rs. 84,500", icon: DollarSign, variant: "teal" },
  { title: "Pending Payments", value: "Rs. 12,400", icon: CreditCard, variant: "lavender" },
  { title: "Paid Invoices", value: "86", icon: CheckCircle2, variant: "coral" },
  { title: "Outstanding", value: "Rs. 5,200", icon: FileText, variant: "sand" },
];

const mockInvoices = [
  { id: "INV-001", patient: "John Doe", service: "Consultation - Cardiology", amount: "Rs. 1,500", status: "Paid", date: "2026-08-23" },
  { id: "INV-002", patient: "Aarav Thapa", service: "Lab Test - Blood Sugar", amount: "Rs. 800", status: "Pending", date: "2026-08-23" },
  { id: "INV-003", patient: "Sita Rai", service: "Consultation - Dermatology", amount: "Rs. 1,200", status: "Paid", date: "2026-08-22" },
  { id: "INV-004", patient: "Ram Thapa", service: "Lab Test - CBC", amount: "Rs. 600", status: "Failed", date: "2026-08-22" },
];

export default function BillingPage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold text-teal-deep leading-tight">
            Billing & Payments
          </h1>
          <p className="text-base text-ink-soft font-medium">
            Manage invoices, payments, and outstanding balances.
          </p>
        </div>
        <button className="inline-flex items-center gap-2 rounded-full bg-coral px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coral/30 hover:bg-coral-dark transition-all hover:-translate-y-0.5">
          <Plus className="size-4" />
          New Invoice
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {mockBillingStats.map((stat) => {
          const iconColors = {
            teal: "bg-teal-mid/15 text-teal-mid",
            lavender: "bg-lavender/30 text-lavender",
            coral: "bg-coral/20 text-coral-dark",
            sand: "bg-coral/15 text-coral-dark",
          };
          return (
            <div key={stat.title} className="rounded-2xl border border-deept/5 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-ink-soft">{stat.title}</p>
                  <p className="font-heading text-2xl font-bold text-teal-deep">{stat.value}</p>
                </div>
                <div className={`flex size-10 items-center justify-center rounded-xl ${iconColors[stat.variant]}`}>
                  <stat.icon className="size-5" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Invoices Table */}
      <div className="rounded-2xl border border-deept/10 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-deept/10 px-6 py-4">
          <h2 className="font-heading text-xl font-bold text-teal-deep">Recent Invoices</h2>
          <button className="inline-flex items-center gap-2 rounded-full border-2 border-deept/15 bg-white px-4 py-2 text-sm font-semibold text-teal-deep hover:bg-teal-pale hover:border-teal-pale transition-all">
            <Download className="size-4" />
            Export
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b-2 border-deept/10 bg-cream/50">
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Invoice ID</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Service</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Amount</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Date</th>
                <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deept/5">
              {mockInvoices.map((inv) => (
                <tr key={inv.id} className="transition-colors hover:bg-teal-pale/30">
                  <td className="px-5 py-4 font-mono text-xs font-semibold text-teal-mid">{inv.id}</td>
                  <td className="px-5 py-4 font-semibold text-ink">{inv.patient}</td>
                  <td className="px-5 py-4 text-ink-soft">{inv.service}</td>
                  <td className="px-5 py-4 font-semibold text-ink">{inv.amount}</td>
                  <td className="px-5 py-4">
                    <StatusBadge status={inv.status} />
                  </td>
                  <td className="px-5 py-4 text-ink-soft">{inv.date}</td>
                  <td className="px-5 py-4">
                    <button className="text-sm font-semibold text-teal-mid hover:underline">View</button>
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
