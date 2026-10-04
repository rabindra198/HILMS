import { useCallback, useEffect, useState } from "react";
import { CreditCard, Info, RefreshCw } from "lucide-react";
import { patientApi, getApiError } from "@/services/patientApi";
import { StatCard } from "@/components/common/StatCard";
import {
  PatientCard,
  PatientPageShell,
  PatientResponsiveList,
  StatusBadge,
  SECONDARY_BUTTON,
  formatDate,
  formatMoney,
  humanise,
} from "./patientUi";

/**
 * Billing (FR-PT-09).
 *
 * Payment is real here, not a placeholder. `Invoice` and `Payment` are stored
 * records and eSewa settlement is verified SERVER-SIDE before any money is
 * recorded: the browser posts the signed form fields to eSewa, eSewa returns to
 * the backend, and only the backend writes SUCCESS.
 *
 * That is precisely why the previous version of this screen is gone rather than
 * hidden. It drove `khalti-checkout-web` from the browser and marked an invoice
 * "Paid" on a client-side callback, so a patient could see a receipt for money
 * that had never been taken. Nothing here trusts this browser: it asks the server
 * to start a payment, and it renders whatever settlement state the server returns.
 */
export default function PatientPayments() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [gatewayLive, setGatewayLive] = useState(false);
  const [payingInvoice, setPayingInvoice] = useState("");
  const [payError, setPayError] = useState("");

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      setData(await patientApi.getPayments());
      setError("");
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Whether online payment is possible is the SERVER's answer, not an assumption:
  // a deployment with no eSewa credentials must not show a button that cannot work.
  useEffect(() => {
    let active = true;
    patientApi
      .getPaymentConfig()
      .then((config) => {
        if (active) setGatewayLive(Array.isArray(config?.available) && config.available.length > 0);
      })
      .catch(() => {
        if (active) setGatewayLive(false);
      });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Starts an eSewa payment and hands the browser to the gateway.
   *
   * The server creates the PENDING transaction and returns SIGNED form fields. This
   * function builds a real form and submits it to eSewa's endpoint; it cannot sign
   * anything and never decides that money arrived.
   */
  const payWithEsewa = async (invoiceId) => {
    setPayError("");
    setPayingInvoice(invoiceId);
    try {
      const result = await patientApi.initiateEsewaPayment(invoiceId);
      const { endpoint, method, fields } = result?.checkout || {};

      if (!endpoint || !fields) {
        throw new Error("The server did not return a usable checkout form.");
      }

      const form = document.createElement("form");
      form.method = method || "POST";
      form.action = endpoint;
      form.style.display = "none";

      for (const [name, value] of Object.entries(fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = name;
        input.value = value ?? "";
        form.appendChild(input);
      }

      document.body.appendChild(form);
      form.submit();
    } catch (requestError) {
      setPayError(getApiError(requestError));
      setPayingInvoice("");
    }
  };

  const items = data?.items || [];
  const summary = data?.summary || {};

  const columns = [
    {
      header: "Charge",
      primary: true,
      render: (row) => (
        <span className="font-semibold text-teal-deep">
          {row.reference}
          <span className="block text-xs font-normal text-ink-soft">{formatDate(row.date)}</span>
        </span>
      ),
    },
    {
      header: "Ordered by",
      render: (row) => row.doctor?.name || "-",
    },
    {
      header: "Status",
      render: (row) => <StatusBadge status={humanise(row.fulfilmentStatus)} />,
    },
    {
      // The real settlement state from the server. Never hardcoded: an invoice shows
      // its stored status and unbilled lab work shows PENDING.
      header: "Payment",
      render: (row) => <StatusBadge status={humanise(row.paymentStatus)} />,
    },
    {
      header: "Amount",
      align: "right",
      primary: true,
      render: (row) => <span className="font-bold text-teal-deep">{formatMoney(row.amount)}</span>,
    },
    {
      header: "",
      align: "right",
      render: (row) =>
        row.payable && gatewayLive ? (
          <button
            type="button"
            onClick={() => payWithEsewa(row.invoiceId)}
            disabled={payingInvoice === row.invoiceId}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-mid px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            <CreditCard className="size-3.5" />
            {payingInvoice === row.invoiceId ? "Redirecting..." : `Pay ${formatMoney(row.balance)}`}
          </button>
        ) : null,
    },
  ];

  return (
    <PatientPageShell
      title="Billing"
      description="Your invoices, their real settlement state, and any laboratory work not yet invoiced."
      actions={
        <button type="button" onClick={() => load({ quiet: true })} disabled={refreshing} className={SECONDARY_BUTTON}>
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      {data?.notice && (
        <div className="flex items-start gap-3 rounded-2xl border border-deept/15 bg-white px-4 py-3">
          <Info className="mt-0.5 size-5 shrink-0 text-teal-mid" />
          <p className="text-sm text-ink-soft">{data.notice}</p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          title="Total charges"
          value={loading ? "-" : formatMoney(summary.totalCharges ?? 0)}
          description="Published test prices on your orders"
          icon={Info}
        />
        <StatCard
          title="Chargeable items"
          value={loading ? "-" : summary.chargeCount ?? 0}
          description="Tests with a published price"
          icon={Info}
          variant="lavender"
        />
        <StatCard
          title="Amount paid"
          value={loading ? "-" : formatMoney(summary.paidTotal ?? 0)}
          description="Settled and verified by eSewa"
          icon={Info}
          variant="sand"
        />
        <StatCard
          title="Outstanding"
          value={loading ? "-" : formatMoney(summary.outstanding ?? 0)}
          description="Balance still payable"
          icon={Info}
          variant="lavender"
        />
      </div>

      {payError && (
        <div className="flex items-start gap-3 rounded-2xl border border-coral/40 bg-white px-4 py-3">
          <Info className="mt-0.5 size-5 shrink-0 text-coral" />
          <p className="text-sm text-ink-soft">{payError}</p>
        </div>
      )}

      {!gatewayLive && !loading && (
        <div className="flex items-start gap-3 rounded-2xl border border-deept/15 bg-white px-4 py-3">
          <Info className="mt-0.5 size-5 shrink-0 text-teal-mid" />
          <p className="text-sm text-ink-soft">
            Online payment is not available on this server right now. Any balance is still real and can be
            settled at the hospital desk.
          </p>
        </div>
      )}

      <PatientCard title="Charges" description="Invoices and outstanding laboratory work, as recorded by the hospital.">
        <PatientResponsiveList
          columns={columns}
          rows={items}
          rowKey={(row) => row.id}
          loading={loading}
          error={error}
          empty={!loading && !error && items.length === 0}
          emptyMessage="No billable tests or invoices on your account yet."
        />
      </PatientCard>
    </PatientPageShell>
  );
}