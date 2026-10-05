import { useCallback, useEffect, useRef, useState } from "react";
import { CreditCard, Info, Loader2, RefreshCw } from "lucide-react";
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
  // The invoice currently being paid, or "" when idle. Doubles as the lock that
  // disables every Pay button on the page.
  const [payingInvoice, setPayingInvoice] = useState("");
  const [payError, setPayError] = useState("");
  // A ref, not state, for the submit lock. Two clicks inside one tick both run
  // before React re-renders, so a state guard alone still lets the second request
  // out - and a second request means a second payment attempt.
  const payInFlight = useRef(false);

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
   * The server mints a NEW transaction uuid, writes a NEW PENDING row and returns
   * form fields it has already signed with the secret key. This function builds a
   * real form and submits it to eSewa's endpoint; it cannot sign anything, it never
   * sees the secret, and it never decides that money arrived.
   *
   * Double submission is blocked at three levels, because each covers a case the
   * others miss:
   *   1. `payInFlight` (a ref) - two clicks in the same tick, before React has
   *      re-rendered to disable the button. This is the case a `disabled`
   *      attribute cannot catch.
   *   2. `disabled` on every Pay button while any payment is in flight - covers
   *      impatient clicking, and a second tap on a *different* invoice, which
   *      would otherwise start a second concurrent payment.
   *   3. The server supersedes the previous attempt and mints a fresh uuid, so
   *      even a request that escaped 1 and 2 cannot collide with the last one.
   *
   * The lock is released ONLY when the request fails. On success the browser
   * navigates to eSewa, so there is nothing to re-enable.
   */
  const payWithEsewa = async (invoiceId) => {
    if (payInFlight.current) return;

    payInFlight.current = true;
    setPayError("");
    setPayingInvoice(invoiceId);

    try {
      const result = await patientApi.initiateEsewaPayment(invoiceId);
      const { endpoint, method, fields } = result?.checkout || {};

      if (!endpoint || !fields?.transaction_uuid) {
        throw new Error("The server did not return a usable checkout form. Please try again.");
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

      // Navigating away is the normal end of this function. If the browser refuses
      // to leave - popup blocked, gateway unreachable, offline - the patient would
      // be left staring at a permanently disabled button, so unlock and say so.
      window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          payInFlight.current = false;
          setPayingInvoice("");
          setPayError(
            "We could not send you to eSewa. Check your internet connection and try paying again."
          );
        }
      }, 8000);

      form.submit();
    } catch (requestError) {
      // Failure: release the lock so the patient can retry, and say why.
      payInFlight.current = false;
      setPayingInvoice("");
      setPayError(getApiError(requestError));
    }
  };

  const paying = Boolean(payingInvoice);

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
      render: (row) => {
        if (!row.payable || !gatewayLive) return null;

        const isThisOne = payingInvoice === row.invoiceId;

        return (
          <button
            type="button"
            onClick={() => payWithEsewa(row.invoiceId)}
            // Locked while ANY payment is in flight, not just this row's: one
            // checkout at a time, so a second tap cannot start a second payment.
            disabled={paying}
            aria-busy={isThisOne}
            className="inline-flex items-center gap-1.5 rounded-xl bg-teal-mid px-3 py-2 text-xs font-semibold text-white transition hover:bg-teal-deep disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isThisOne ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                Redirecting to eSewa...
              </>
            ) : (
              <>
                <CreditCard className="size-3.5" />
                {`Pay ${formatMoney(row.balance)}`}
              </>
            )}
          </button>
        );
      },
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
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-coral/40 bg-white px-4 py-3"
        >
          <Info className="mt-0.5 size-5 shrink-0 text-coral" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink">Payment could not be started</p>
            <p className="text-sm text-ink-soft">{payError}</p>
            <p className="text-xs text-ink-soft">
              No money has been taken. You can safely try again.
            </p>
          </div>
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