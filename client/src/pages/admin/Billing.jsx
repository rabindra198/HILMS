import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  RefreshCw,
  Plus,
  Search,
  Eye,
  Ban,
  Receipt,
  Wallet,
  FileText,
  ChevronLeft,
  ChevronRight,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { StatusBadge } from "@/components/common/StatusBadge";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { Modal } from "@/components/common/Modal";
import {
  getBillingSummary,
  getInvoices,
  getInvoice,
  createInvoice,
  voidInvoice,
  getPayments,
  recordPayment,
  getPatients,
  getAppointments,
  getBillableLabRequests,
} from "@/services/adminApi";
import { getErrorMessage } from "@/lib/axios";
import { formatDate } from "@/lib/formatDate";
import { formatMoney, formatMoneyExact, formatDateTime } from "@/lib/format";

/**
 * Billing and payments (FR-AD-07).
 *
 * Two things are deliberately kept server-side and must never be recomputed in the
 * browser:
 *
 *  - An invoice's `total` is priced from real stored data - `User.consultationFee`
 *    for a consultation line, `LabTest.price` for a laboratory line. The client
 *    sends a quantity, a discount and tax, never a total.
 *  - `amountPaid` / `balance` / `status` are recomputed by `billing.service` from
 *    the SUCCESS payments against the invoice. The client shows what it is told.
 *
 * `collected` and `invoiced` are deliberately different figures: revenue is money
 * actually received, not money billed.
 */

/**
 * Methods an administrator may record by hand.
 *
 * ESEWA is absent on purpose - `billing.service` rejects it, because an eSewa
 * payment is created by the payment service once the gateway confirms it and must
 * never be typed in by hand. KHALTI is historical and is not offered either.
 */
const MANUAL_METHODS = ["CASH", "CARD", "BANK_TRANSFER", "ONLINE"];
const METHODS_NEEDING_REF = ["CARD", "ONLINE"];

const INVOICE_STATUSES = [
  { value: "", label: "All invoices" },
  { value: "UNPAID", label: "Unpaid" },
  { value: "PARTIALLY_PAID", label: "Partially paid" },
  { value: "PAID", label: "Paid" },
  { value: "VOID", label: "Void" },
];

const humanise = (value) =>
  String(value || "")
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^./, (char) => char.toUpperCase());

/** New-invoice form: patient, an optional consultation, and manual lines. */
function CreateInvoiceModal({ open, onClose, onSaved }) {
  const [patientId, setPatientId] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [appointmentId, setAppointmentId] = useState("");
  const [labRequests, setLabRequests] = useState([]);
  const [selectedLabRequestIds, setSelectedLabRequestIds] = useState([]);
  const [labRequestsLoading, setLabRequestsLoading] = useState(false);
  const [labRequestsError, setLabRequestsError] = useState("");
  const [items, setItems] = useState([{ description: "", unitPrice: "", quantity: "1" }]);
  const [discount, setDiscount] = useState("");
  const [tax, setTax] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) return;
    setPatientId("");
    setPatientQuery("");
    setAppointmentId("");
    setSelectedLabRequestIds([]);
    setItems([{ description: "", unitPrice: "", quantity: "1" }]);
    setDiscount("");
    setTax("");
    setNotes("");
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const data = await getPatients({ search: patientQuery.trim() || undefined, limit: 20 });
        if (!cancelled) setPatients(data?.items || []);
      } catch {
        if (!cancelled) setPatients([]);
      }
    }, patientQuery ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [patientQuery, open]);

  /**
   * Completed appointments for the chosen patient are the billable consultations.
   * The server prices the line from the doctor's stored fee, so the client never
   * sees or invents that amount. Already-billed appointments are rejected by the
   * backend with 409 if picked anyway.
   */
  useEffect(() => {
    if (!patientId) {
      setAppointments([]);
      setAppointmentId("");
      setLabRequests([]);
      setSelectedLabRequestIds([]);
      setLabRequestsError("");
      return undefined;
    }
    let cancelled = false;
    getAppointments({ patientId, status: "COMPLETED", limit: 25 })
      .then((data) => {
        if (!cancelled) setAppointments(data?.items || []);
      })
      .catch(() => {
        if (!cancelled) setAppointments([]);
      });
    setLabRequestsLoading(true);
    setLabRequestsError("");
    getBillableLabRequests(patientId)
      .then((data) => {
        if (!cancelled) setLabRequests(data || []);
      })
      .catch((error) => {
        if (cancelled) return;
        setLabRequests([]);
        setLabRequestsError(getErrorMessage(error, "Could not load unbilled laboratory requests."));
      })
      .finally(() => {
        if (!cancelled) setLabRequestsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const setItem = (index, key, value) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [key]: value } : item)));
  };

  const submit = async () => {
    const manualItems = items
      .filter((item) => item.description.trim() && item.unitPrice !== "")
      .map((item) => ({
        description: item.description.trim(),
        unitPrice: Number(item.unitPrice),
        quantity: Number(item.quantity) || 1,
      }));

    if (!patientId) {
      toast.error("Select a patient.");
      return;
    }
    if (!appointmentId && selectedLabRequestIds.length === 0 && manualItems.length === 0) {
      toast.error("Add a consultation, laboratory request, or at least one priced line.");
      return;
    }
    if (labRequestsError) {
      toast.error("Resolve the laboratory request loading error before issuing this invoice.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        patientId,
        appointment: appointmentId || undefined,
        labRequestIds: selectedLabRequestIds.length ? selectedLabRequestIds : undefined,
        items: manualItems.length ? manualItems : undefined,
        discount: discount === "" ? 0 : Number(discount),
        tax: tax === "" ? 0 : Number(tax),
        notes: notes.trim() || undefined,
      };
      const result = await createInvoice(payload);
      toast.success(`${result.invoiceNo} issued for Rs. ${formatMoney(result.total)}.`);
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not issue this invoice."));
    } finally {
      setSaving(false);
    }
  };

  const chosenAppointment = appointments.find((row) => row._id === appointmentId);

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      size="lg"
      title="Issue an invoice"
      description="Amounts are priced by the server from the doctor's fee and the laboratory catalogue."
      closeDisabled={saving}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-full border border-deept/20 px-4 py-2 text-sm font-bold text-ink-soft transition hover:bg-lavender-pale"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-full bg-teal-mid px-5 py-2 text-sm font-bold text-white transition hover:bg-teal-deep disabled:opacity-60"
          >
            {saving ? "Issuing…" : "Issue invoice"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="inv-patient-search" className="mb-1.5 block text-sm font-semibold text-deept">
            Patient
          </label>
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              id="inv-patient-search"
              type="text"
              value={patientQuery}
              onChange={(e) => {
                setPatientQuery(e.target.value);
                setPatientId("");
                setSelectedLabRequestIds([]);
              }}
              placeholder="Search patients by name or email"
              className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
            />
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-deept/10">
            {patients.length === 0 ? (
              <p className="px-4 py-3 text-sm text-ink-soft">No patients match that search.</p>
            ) : (
              patients.map((patient) => (
                <button
                  key={patient._id}
                  type="button"
                  onClick={() => {
                    setPatientId(patient._id);
                    setPatientQuery(patient.name);
                  }}
                  className={`flex w-full items-center gap-3 border-b border-deept/5 px-4 py-2 text-left last:border-0 transition hover:bg-teal-pale/30 ${
                    patientId === patient._id ? "bg-teal-pale" : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{patient.name}</span>
                    <span className="block truncate text-xs text-ink-soft">{patient.email}</span>
                  </span>
                  {patientId === patient._id && <span className="text-xs font-bold text-teal-mid">Selected</span>}
                </button>
              ))
            )}
          </div>
        </div>

        <div>
          <label htmlFor="inv-appointment" className="mb-1.5 block text-sm font-semibold text-deept">
            Consultation to bill (optional)
          </label>
          <select
            id="inv-appointment"
            value={appointmentId}
            onChange={(e) => setAppointmentId(e.target.value)}
            disabled={!patientId}
            className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none transition focus:border-teal-mid disabled:opacity-60"
          >
            <option value="">No consultation on this invoice</option>
            {appointments.map((appointment) => (
              <option key={appointment._id} value={appointment._id}>
                {appointment.appointmentNo} · {appointment.doctorName} · {formatDate(appointment.appointmentDate, "DD MMM YYYY")}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-ink-soft">
            {patientId
              ? chosenAppointment
                ? "The line is priced from this doctor's consultation fee."
                : "No completed consultations found for this patient."
              : "Choose a patient to list their completed consultations."}
          </p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-semibold text-deept">Completed laboratory work to bill (optional)</p>
          {!patientId ? (
            <p className="text-xs text-ink-soft">Choose a patient to list their unbilled laboratory requests.</p>
          ) : labRequestsLoading ? (
            <p className="text-xs text-ink-soft">Loading laboratory requests...</p>
          ) : labRequestsError ? (
            <p role="alert" className="text-xs font-semibold text-coral-dark">{labRequestsError}</p>
          ) : labRequests.length ? (
            <div className="max-h-48 space-y-2 overflow-y-auto rounded-xl border border-deept/10 p-3">
              {labRequests.map((request) => {
                const requestId = String(request._id);
                const selected = selectedLabRequestIds.includes(requestId);
                return (
                  <label key={requestId} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-teal-pale/40">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => {
                        setSelectedLabRequestIds((current) =>
                          event.target.checked
                            ? [...current, requestId]
                            : current.filter((id) => id !== requestId)
                        );
                      }}
                      className="mt-1 accent-teal-mid"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-ink">{request.test?.name || "Laboratory test"}</span>
                      <span className="block text-xs text-ink-soft">
                        {humanise(request.status)} · {formatDate(request.requestedDate, "DD MMM YYYY")}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-bold text-teal-deep">Rs. {formatMoney(request.amount)}</span>
                  </label>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-ink-soft">No completed, unbilled laboratory requests found for this patient.</p>
          )}
          <p className="mt-1.5 text-xs text-ink-soft">The server uses the test price captured when it was ordered. Already billed requests are excluded.</p>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-sm font-semibold text-deept">Additional lines</span>
            <button
              type="button"
              onClick={() => setItems((current) => [...current, { description: "", unitPrice: "", quantity: "1" }])}
              className="inline-flex items-center gap-1 rounded-full border border-teal/30 px-3 py-1 text-xs font-bold text-teal-mid transition hover:bg-teal-pale"
            >
              <Plus className="size-3" />
              Add line
            </button>
          </div>

          <div className="flex flex-col gap-2">
            {items.map((item, index) => (
              <div key={index} className="grid grid-cols-[minmax(0,1fr)_5rem_5rem_auto] items-end gap-2">
                <div>
                  {index === 0 && <span className="mb-1 block text-xs font-bold uppercase text-ink-soft">Description</span>}
                  <input
                    value={item.description}
                    onChange={(e) => setItem(index, "description", e.target.value)}
                    placeholder="e.g. Dressing, procedure, consumable"
                    className="h-10 w-full rounded-lg border border-deept/15 px-2 text-sm outline-none focus:border-teal-mid"
                  />
                </div>
                <div>
                  {index === 0 && <span className="mb-1 block text-xs font-bold uppercase text-ink-soft">Price</span>}
                  <input
                    type="number"
                    min={0}
                    step="1"
                    value={item.unitPrice}
                    onChange={(e) => setItem(index, "unitPrice", e.target.value)}
                    className="h-10 w-full rounded-lg border border-deept/15 px-2 text-sm outline-none focus:border-teal-mid"
                  />
                </div>
                <div>
                  {index === 0 && <span className="mb-1 block text-xs font-bold uppercase text-ink-soft">Qty</span>}
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => setItem(index, "quantity", e.target.value)}
                    className="h-10 w-full rounded-lg border border-deept/15 px-2 text-sm outline-none focus:border-teal-mid"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setItems((current) => current.filter((_, i) => i !== index))}
                  disabled={items.length === 1}
                  className="inline-flex size-10 items-center justify-center rounded-lg border border-coral/40 text-coral-dark transition hover:bg-coral-pale disabled:opacity-40"
                  aria-label="Remove line"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="inv-discount" className="mb-1.5 block text-sm font-semibold text-deept">
              Discount
            </label>
            <input
              id="inv-discount"
              type="number"
              min={0}
              value={discount}
              onChange={(e) => setDiscount(e.target.value)}
              placeholder="0"
              className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
            />
          </div>
          <div>
            <label htmlFor="inv-tax" className="mb-1.5 block text-sm font-semibold text-deept">
              Tax
            </label>
            <input
              id="inv-tax"
              type="number"
              min={0}
              value={tax}
              onChange={(e) => setTax(e.target.value)}
              placeholder="0"
              className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
            />
          </div>
          <div>
            <label htmlFor="inv-notes" className="mb-1.5 block text-sm font-semibold text-deept">
              Notes
            </label>
            <input
              id="inv-notes"
              value={notes}
              maxLength={200}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional"
              className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

/** Records an in-person payment against one invoice. */
function PaymentModal({ open, onClose, invoice, onSaved }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [transactionRef, setTransactionRef] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !invoice) return;
    setAmount(String(invoice.balance ?? ""));
    setMethod("CASH");
    setTransactionRef("");
    setNote("");
  }, [open, invoice]);

  const needsRef = METHODS_NEEDING_REF.includes(method);

  const submit = async () => {
    setSaving(true);
    try {
      const result = await recordPayment({
        invoiceId: invoice._id,
        amount: Number(amount),
        method,
        transactionRef: transactionRef.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success(
        `Payment of Rs. ${formatMoney(result.payment.amount)} recorded. ${result.invoice.invoiceNo} is now ${humanise(
          result.invoice.status
        ).toLowerCase()}.`
      );
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not record this payment."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onClose}
      size="sm"
      title="Record a payment"
      description={invoice ? `${invoice.invoiceNo} · balance Rs. ${formatMoneyExact(invoice.balance)}` : undefined}
      closeDisabled={saving}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-deept/20 px-4 py-2 text-sm font-bold text-ink-soft transition hover:bg-lavender-pale"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="rounded-full bg-teal-mid px-5 py-2 text-sm font-bold text-white transition hover:bg-teal-deep disabled:opacity-60"
          >
            {saving ? "Recording…" : "Record payment"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="pay-amount" className="mb-1.5 block text-sm font-semibold text-deept">
            Amount
          </label>
          <input
            id="pay-amount"
            type="number"
            min={1}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
          />
          <p className="mt-1 text-xs text-ink-soft">
            A partial payment is allowed. The invoice balance is recalculated by the server.
          </p>
        </div>

        <div>
          <label htmlFor="pay-method" className="mb-1.5 block text-sm font-semibold text-deept">
            Method
          </label>
          <select
            id="pay-method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
          >
            {MANUAL_METHODS.map((option) => (
              <option key={option} value={option}>
                {humanise(option)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-ink-soft">
            eSewa payments are recorded by the payment service after the gateway confirms them, so they cannot be
            entered here.
          </p>
        </div>

        {needsRef && (
          <div>
            <label htmlFor="pay-ref" className="mb-1.5 block text-sm font-semibold text-deept">
              Transaction reference
            </label>
            <input
              id="pay-ref"
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="Required for card and online settlement"
              className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
            />
          </div>
        )}

        <div>
          <label htmlFor="pay-note" className="mb-1.5 block text-sm font-semibold text-deept">
            Note (optional)
          </label>
          <input
            id="pay-note"
            value={note}
            maxLength={200}
            onChange={(e) => setNote(e.target.value)}
            className="h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
          />
        </div>
      </div>
    </Modal>
  );
}

export default function BillingPage() {
  const [tab, setTab] = useState("invoices");
  const [range, setRange] = useState({ from: "", to: "" });

  const [summary, setSummary] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [invoicePage, setInvoicePage] = useState(1);
  const [invoiceFilters, setInvoiceFilters] = useState({ status: "", search: "" });
  const [invoicePagination, setInvoicePagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [payments, setPayments] = useState([]);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentFilters, setPaymentFilters] = useState({ method: "", status: "", search: "" });
  const [paymentPagination, setPaymentPagination] = useState({ page: 1, totalPages: 1, total: 0 });

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [paying, setPaying] = useState(null);
  const [voiding, setVoiding] = useState(null);
  const [voidReason, setVoidReason] = useState("");

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rangeParams = { from: range.from || undefined, to: range.to || undefined };

      // The summary, the list and the payments table are independent reads, so a
      // failure in one still leaves the others usable.
      const [summaryResult, invoiceResult, paymentResult] = await Promise.all([
        getBillingSummary(rangeParams),
        getInvoices({
          ...rangeParams,
          status: invoiceFilters.status || undefined,
          search: invoiceFilters.search.trim() || undefined,
          page: invoicePage,
          limit: 20,
        }),
        getPayments({
          ...rangeParams,
          method: paymentFilters.method || undefined,
          status: paymentFilters.status || undefined,
          search: paymentFilters.search.trim() || undefined,
          page: paymentPage,
          limit: 20,
        }),
      ]);

      setSummary(summaryResult);
      setInvoices(invoiceResult?.items || []);
      setInvoicePagination(invoiceResult?.pagination || { page: 1, totalPages: 1, total: 0 });
      setPayments(paymentResult?.items || []);
      setPaymentPagination(paymentResult?.pagination || { page: 1, totalPages: 1, total: 0 });
    } catch (err) {
      setError(getErrorMessage(err, "Could not load billing."));
    } finally {
      setIsLoading(false);
    }
  }, [
    range.from,
    range.to,
    invoiceFilters.status,
    invoiceFilters.search,
    invoicePage,
    paymentFilters.method,
    paymentFilters.status,
    paymentFilters.search,
    paymentPage,
  ]);

  useEffect(() => {
    const timer = setTimeout(load, 250);
    return () => clearTimeout(timer);
  }, [load]);

  const openDetail = async (invoice) => {
    setDetail(invoice);
    setDetailLoading(true);
    try {
      setDetail(await getInvoice(invoice._id));
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not load this invoice."));
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmVoid = async () => {
    if (!voiding) return;
    setBusyId(voiding._id);
    try {
      await voidInvoice(voiding._id, voidReason.trim() || undefined);
      toast.success(`${voiding.invoiceNo} voided.`);
      setVoiding(null);
      await load();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not void this invoice."));
    } finally {
      setBusyId(null);
    }
  };

  const byStatus = (summary?.byStatus || []).reduce((acc, row) => ({ ...acc, [row.status]: row }), {});

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold leading-tight text-teal-deep">Billing &amp; Payments</h1>
          <p className="text-base font-medium text-ink-soft">Invoices, settlements and outstanding balances.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={load}
            disabled={isLoading}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-deept/15 bg-white px-4 text-sm font-semibold text-teal-deep transition hover:border-teal-mid hover:text-teal-mid disabled:opacity-60"
          >
            <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-teal-mid px-5 text-sm font-semibold text-white shadow-lg shadow-teal-mid/30 transition hover:-translate-y-0.5 hover:bg-teal-deep"
          >
            <Plus className="size-4" />
            Issue invoice
          </button>
        </div>
      </div>

      {/* Date range applies to the summary, invoices and payments alike. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div>
          <label htmlFor="bill-from" className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">
            From
          </label>
          <input
            id="bill-from"
            type="date"
            value={range.from}
            onChange={(e) => {
              setRange((current) => ({ ...current, from: e.target.value }));
              setInvoicePage(1);
              setPaymentPage(1);
            }}
            className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
          />
        </div>
        <div>
          <label htmlFor="bill-to" className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">
            To
          </label>
          <input
            id="bill-to"
            type="date"
            value={range.to}
            onChange={(e) => {
              setRange((current) => ({ ...current, to: e.target.value }));
              setInvoicePage(1);
              setPaymentPage(1);
            }}
            className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
          />
        </div>
        {(range.from || range.to) && (
          <button
            type="button"
            onClick={() => {
              setRange({ from: "", to: "" });
              setInvoicePage(1);
              setPaymentPage(1);
            }}
            className="h-11 rounded-full border border-deept/15 px-4 text-sm font-semibold text-ink-soft transition hover:border-teal-mid hover:text-teal-mid"
          >
            Clear range
          </button>
        )}
      </div>

      {/* Summary tiles - invoiced and collected are different figures. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { title: "Invoiced", value: formatMoney(summary?.invoiced), icon: FileText, tint: "bg-lavender-pale", iconTint: "bg-lavender/30 text-lavender" },
          { title: "Collected", value: formatMoney(summary?.collected), icon: TrendingUp, tint: "bg-teal-pale", iconTint: "bg-teal-mid/15 text-teal-mid" },
          { title: "Outstanding", value: formatMoney(summary?.outstanding), icon: Wallet, tint: "bg-softteal", iconTint: "bg-teal-mid/15 text-teal-mid" },
          { title: "Discounts given", value: formatMoney(summary?.discounts), icon: Receipt, tint: "bg-teal-pale", iconTint: "bg-teal-mid/15 text-teal-mid" },
        ].map((tile) => (
          <div key={tile.title} className={`rounded-2xl border border-deept/5 p-5 ${tile.tint}`}>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-soft">{tile.title}</p>
                <p className="mt-1 font-heading text-2xl font-bold text-teal-deep">Rs. {tile.value}</p>
              </div>
              <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tile.iconTint}`}>
                <tile.icon className="size-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {summary && (
        <div className="flex flex-wrap gap-2">
          {summary.byStatus.map((row) => (
            <button
              key={row.status}
              type="button"
              onClick={() => {
                setInvoiceFilters((current) => ({ ...current, status: current.status === row.status ? "" : row.status }));
                setInvoicePage(1);
                setTab("invoices");
              }}
              className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
                invoiceFilters.status === row.status && tab === "invoices"
                  ? "bg-teal-mid text-white shadow-md shadow-teal-mid/30"
                  : "border border-deept/15 bg-white text-ink-soft hover:border-teal-mid/40 hover:text-teal-mid"
              }`}
            >
              {humanise(row.status)}
              <span className="rounded-full bg-teal-pale/30 px-2 py-0.5 text-xs">{row.count}</span>
              <span className="text-xs">Rs. {formatMoney(row.total)}</span>
            </button>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { value: "invoices", label: "Invoices" },
          { value: "payments", label: "Payments" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setTab(option.value)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              tab === option.value
                ? "bg-teal-mid text-white shadow-md shadow-teal-mid/30"
                : "border border-deept/15 bg-white text-ink-soft hover:border-teal-mid/40 hover:text-teal-mid"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isLoading && !summary ? (
        <LoadingSkeleton rows={6} columns={6} />
      ) : error ? (
        <ErrorState title="Could not load billing" description={error} onRetry={load} />
      ) : tab === "invoices" ? (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <select
              value={invoiceFilters.status}
              onChange={(e) => {
                setInvoiceFilters((current) => ({ ...current, status: e.target.value }));
                setInvoicePage(1);
              }}
              aria-label="Filter invoices by status"
              className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
            >
              {INVOICE_STATUSES.map((option) => (
                <option key={option.value || "ALL"} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <div className="relative w-full sm:w-80">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
              <input
                type="text"
                value={invoiceFilters.search}
                onChange={(e) => {
                  setInvoiceFilters((current) => ({ ...current, search: e.target.value }));
                  setInvoicePage(1);
                }}
                placeholder="Search invoice number or patient"
                className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
              />
            </div>
          </div>

          {invoices.length === 0 ? (
            <p className="rounded-2xl border border-deept/10 bg-white px-6 py-10 text-center text-sm text-ink-soft">
              No invoices match these filters.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b-2 border-deept/10 bg-softteal/50">
                      {["Invoice", "Patient", "Issued", "Total", "Paid", "Balance", "Status", "Actions"].map((header) => (
                        <th
                          key={header}
                          scope="col"
                          className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft"
                        >
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-deept/5">
                    {invoices.map((invoice) => (
                      <tr key={invoice._id} className="transition-colors hover:bg-teal-pale/30">
                        <td className="px-5 py-4 font-mono text-xs font-semibold text-teal-mid">{invoice.invoiceNo}</td>
                        <td className="px-5 py-4 font-semibold text-ink">
                          {invoice.patient?.name || "Unknown patient"}
                        </td>
                        <td className="px-5 py-4 text-ink-soft">{formatDate(invoice.issuedAt, "DD MMM YYYY")}</td>
                        <td className="px-5 py-4 font-semibold text-ink">Rs. {formatMoneyExact(invoice.total)}</td>
                        <td className="px-5 py-4 text-ink-soft">Rs. {formatMoneyExact(invoice.amountPaid)}</td>
                        <td className="px-5 py-4 font-semibold text-coral-dark">Rs. {formatMoneyExact(invoice.balance)}</td>
                        <td className="px-5 py-4">
                          <StatusBadge status={invoice.status} />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openDetail(invoice)}
                              className="inline-flex items-center gap-1 rounded-full border border-lavender/50 px-2.5 py-1 text-xs font-bold text-lavender transition hover:bg-lavender-pale"
                            >
                              <Eye className="size-3" />
                              View
                            </button>
                            {invoice.balance > 0 && invoice.status !== "VOID" && (
                              <button
                                type="button"
                                onClick={() => setPaying(invoice)}
                                className="inline-flex items-center gap-1 rounded-full bg-teal-mid px-2.5 py-1 text-xs font-bold text-white transition hover:bg-teal-deep"
                              >
                                <Wallet className="size-3" />
                                Pay
                              </button>
                            )}
                            {invoice.status !== "VOID" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setVoiding(invoice);
                                  setVoidReason("");
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-coral/40 px-2.5 py-1 text-xs font-bold text-coral-dark transition hover:bg-coral-pale"
                              >
                                <Ban className="size-3" />
                                Void
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {invoicePagination.totalPages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-ink-soft">
                Page {invoicePagination.page} of {invoicePagination.totalPages} · {invoicePagination.total} invoices
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={invoicePagination.page <= 1}
                  onClick={() => setInvoicePage((current) => Math.max(1, current - 1))}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-deept/15 bg-white text-ink-soft disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={invoicePagination.page >= invoicePagination.totalPages}
                  onClick={() => setInvoicePage((current) => current + 1)}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-deept/15 bg-white text-ink-soft disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <select
                value={paymentFilters.method}
                onChange={(e) => {
                  setPaymentFilters((current) => ({ ...current, method: e.target.value }));
                  setPaymentPage(1);
                }}
                aria-label="Filter payments by method"
                className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
              >
                <option value="">All methods</option>
                {[...MANUAL_METHODS, "ESEWA", "KHALTI"].map((method) => (
                  <option key={method} value={method}>
                    {humanise(method)}
                  </option>
                ))}
              </select>
              <select
                value={paymentFilters.status}
                onChange={(e) => {
                  setPaymentFilters((current) => ({ ...current, status: e.target.value }));
                  setPaymentPage(1);
                }}
                aria-label="Filter payments by status"
                className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
              >
                <option value="">All statuses</option>
                {["SUCCESS", "PENDING", "FAILED", "REFUNDED"].map((status) => (
                  <option key={status} value={status}>
                    {humanise(status)}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative w-full sm:w-80">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
              <input
                type="text"
                value={paymentFilters.search}
                onChange={(e) => {
                  setPaymentFilters((current) => ({ ...current, search: e.target.value }));
                  setPaymentPage(1);
                }}
                placeholder="Search payment number or reference"
                className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
              />
            </div>
          </div>

          {payments.length === 0 ? (
            <p className="rounded-2xl border border-deept/10 bg-white px-6 py-10 text-center text-sm text-ink-soft">
              No payments match these filters.
            </p>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead>
                    <tr className="border-b-2 border-deept/10 bg-softteal/50">
                      {["Payment", "Invoice", "Patient", "Amount", "Method", "Status", "Paid at", "Received by"].map(
                        (header) => (
                          <th
                            key={header}
                            scope="col"
                            className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft"
                          >
                            {header}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-deept/5">
                    {payments.map((payment) => (
                      <tr key={payment._id} className="transition-colors hover:bg-teal-pale/30">
                        <td className="px-5 py-4 font-mono text-xs font-semibold text-teal-mid">{payment.paymentNo}</td>
                        <td className="px-5 py-4 font-mono text-xs text-ink-soft">{payment.invoice?.invoiceNo || "—"}</td>
                        <td className="px-5 py-4 font-semibold text-ink">{payment.patient?.name || "Unknown patient"}</td>
                        <td className="px-5 py-4 font-semibold text-ink">Rs. {formatMoneyExact(payment.amount)}</td>
                        <td className="px-5 py-4 text-ink-soft">{humanise(payment.method)}</td>
                        <td className="px-5 py-4">
                          <StatusBadge status={payment.status} />
                        </td>
                        <td className="px-5 py-4 text-ink-soft">{formatDateTime(payment.paidAt)}</td>
                        <td className="px-5 py-4 text-ink-soft">{payment.receivedBy?.name || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {paymentPagination.totalPages > 1 && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-ink-soft">
                Page {paymentPagination.page} of {paymentPagination.totalPages} · {paymentPagination.total} payments
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={paymentPagination.page <= 1}
                  onClick={() => setPaymentPage((current) => Math.max(1, current - 1))}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-deept/15 bg-white text-ink-soft disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  type="button"
                  disabled={paymentPagination.page >= paymentPagination.totalPages}
                  onClick={() => setPaymentPage((current) => current + 1)}
                  className="inline-flex size-10 items-center justify-center rounded-full border border-deept/15 bg-white text-ink-soft disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <CreateInvoiceModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={load} />

      <PaymentModal open={Boolean(paying)} onClose={() => setPaying(null)} invoice={paying} onSaved={load} />

      {/* Invoice detail */}
      <Modal
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        size="lg"
        title={detail?.invoiceNo || "Invoice"}
        description={detail ? `${detail.patient?.name} · issued ${formatDate(detail.issuedAt, "DD MMM YYYY")}` : undefined}
        closeDisabled={detailLoading}
        footer={
          detail && detail.balance > 0 && detail.status !== "VOID" ? (
            <button
              type="button"
              onClick={() => {
                setPaying(detail);
                setDetail(null);
              }}
              className="rounded-full bg-teal-mid px-5 py-2 text-sm font-bold text-white transition hover:bg-teal-deep"
            >
              Record payment
            </button>
          ) : null
        }
      >
        {detailLoading || !detail ? (
          <LoadingSkeleton rows={4} />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.status} />
              {detail.status === "VOID" && detail.voidReason && (
                <span className="text-xs text-ink-soft">Voided: {detail.voidReason}</span>
              )}
            </div>

            <div className="overflow-hidden rounded-xl border border-deept/10">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-deept/10 bg-softteal/50">
                    <th className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Item</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-ink-soft">Qty</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-ink-soft">Price</th>
                    <th className="px-4 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-ink-soft">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-deept/5">
                  {detail.items.map((item, index) => (
                    <tr key={`${item.description}-${index}`}>
                      <td className="px-4 py-2.5 text-ink">{item.description}</td>
                      <td className="px-4 py-2.5 text-right text-ink-soft">{item.quantity}</td>
                      <td className="px-4 py-2.5 text-right text-ink-soft">Rs. {formatMoneyExact(item.unitPrice)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-ink">Rs. {formatMoneyExact(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-soft">Subtotal</dt>
                <dd className="font-semibold text-ink">Rs. {formatMoneyExact(detail.subtotal)}</dd>
              </div>
              {detail.discount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Discount</dt>
                  <dd className="font-semibold text-coral-dark">− Rs. {formatMoneyExact(detail.discount)}</dd>
                </div>
              )}
              {detail.tax > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-soft">Tax</dt>
                  <dd className="font-semibold text-ink">Rs. {formatMoneyExact(detail.tax)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t border-deept/10 pt-1.5">
                <dt className="font-bold text-deept">Total</dt>
                <dd className="font-bold text-teal-deep">Rs. {formatMoneyExact(detail.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Paid</dt>
                <dd className="font-semibold text-ink">Rs. {formatMoneyExact(detail.amountPaid)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-ink-soft">Balance</dt>
                <dd className="font-bold text-coral-dark">Rs. {formatMoneyExact(detail.balance)}</dd>
              </div>
            </dl>

            {detail.notes && <p className="rounded-xl bg-lavender-pale px-4 py-3 text-sm text-ink">{detail.notes}</p>}

            {detail.payments.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-soft">Payments</p>
                <ul className="divide-y divide-deept/5 rounded-xl border border-deept/10">
                  {detail.payments.map((payment) => (
                    <li key={payment._id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <span>
                        <span className="block font-semibold text-ink">{payment.paymentNo}</span>
                        <span className="block text-xs text-ink-soft">
                          {humanise(payment.method)} · {formatDateTime(payment.paidAt)}
                          {payment.receivedBy?.name ? ` · ${payment.receivedBy.name}` : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-semibold text-ink">Rs. {formatMoneyExact(payment.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Void confirmation */}
      <Modal
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        size="sm"
        title="Void this invoice?"
        description={voiding ? `${voiding.invoiceNo} · ${voiding.patient?.name} · Rs. ${formatMoneyExact(voiding.total)}` : undefined}
        closeDisabled={Boolean(busyId)}
        footer={
          <>
            <button
              type="button"
              onClick={() => setVoiding(null)}
              className="rounded-full border border-deept/20 px-4 py-2 text-sm font-bold text-ink-soft transition hover:bg-lavender-pale"
            >
              Keep invoice
            </button>
            <button
              type="button"
              onClick={confirmVoid}
              disabled={Boolean(busyId)}
              className="rounded-full bg-coral px-5 py-2 text-sm font-bold text-white transition hover:bg-coral-dark disabled:opacity-60"
            >
              {busyId ? "Voiding…" : "Void invoice"}
            </button>
          </>
        }
      >
        <p className="text-sm font-medium text-ink-soft">
          Voiding is not a reversal and is refused while any payment is recorded against the invoice. Refund the
          payments first if money has changed hands.
        </p>
        <label htmlFor="void-reason" className="mb-1.5 mt-4 block text-sm font-semibold text-deept">
          Reason (optional)
        </label>
        <textarea
          id="void-reason"
          rows={3}
          maxLength={300}
          value={voidReason}
          onChange={(e) => setVoidReason(e.target.value)}
          placeholder="e.g. Raised against the wrong patient"
          className="w-full rounded-2xl border border-deept/20 px-4 py-2.5 text-sm outline-none transition focus:border-teal-mid"
        />
      </Modal>
    </div>
  );
}