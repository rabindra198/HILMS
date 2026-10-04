import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Where eSewa returns the customer.
 *
 * The backend settles the transaction FIRST and only then redirects here, so this
 * page is a receipt of a decision the server already made - it does not decide
 * anything itself. The `status` it renders is the one the payment service wrote.
 *
 * "Pending" is deliberately shown as its own outcome rather than folded into
 * success: eSewa confirms a transaction out of band, so a payment can genuinely be
 * undecided at this moment and will be settled once the gateway answers.
 */
const OUTCOMES = {
  SUCCESS: {
    icon: CheckCircle2,
    tone: "text-teal-mid",
    title: "Payment received",
    body: "eSewa confirmed this payment and the hospital has been notified.",
  },
  REFUNDED: {
    icon: XCircle,
    tone: "text-coral",
    title: "Payment refunded",
    body: "eSewa reported this transaction as refunded, so the balance has returned to the invoice.",
  },
  FAILED: {
    icon: XCircle,
    tone: "text-coral",
    title: "Payment not completed",
    body: "The payment did not go through and no money has been taken.",
  },
  PENDING: {
    icon: Clock,
    tone: "text-lavender-deep",
    title: "Payment is still processing",
    body: "eSewa has not confirmed this payment yet. It will update automatically, and you can pay again if it does not.",
  },
};

export default function PaymentResult() {
  const [params] = useSearchParams();
  const status = (params.get("status") || "PENDING").toUpperCase();
  const outcome = OUTCOMES[status] || OUTCOMES.PENDING;

  const payment = params.get("payment");
  const invoice = params.get("invoice");
  const reason = params.get("reason");

  const Icon = outcome.icon;

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-6 text-foreground md:p-10">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader>
            <Icon className={`mb-2 size-9 ${outcome.tone}`} />
            <CardTitle>{outcome.title}</CardTitle>
            <CardDescription>{outcome.body}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(payment || invoice) && (
              <dl className="space-y-1 rounded-xl border border-deept/15 px-4 py-3 text-sm">
                {payment && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-soft">Payment</dt>
                    <dd className="font-semibold text-teal-deep">{payment}</dd>
                  </div>
                )}
                {invoice && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-soft">Invoice</dt>
                    <dd className="font-semibold text-teal-deep">{invoice}</dd>
                  </div>
                )}
                {reason && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-ink-soft">Reason</dt>
                    <dd className="text-right text-ink-soft">{reason}</dd>
                  </div>
                )}
              </dl>
            )}

            <Button asChild className="w-full">
              <Link to="/patient/payments">Go to Billing</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}