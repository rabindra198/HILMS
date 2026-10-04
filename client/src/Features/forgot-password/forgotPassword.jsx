import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { HeartPulse, Mail, ArrowLeft, ShieldCheck, Send, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { getErrorMessage } from "@/lib/axios";

const forgotPasswordSchema = z.object({
  email: z.string().email("Please enter a valid email"),
});

function ForgotPasswordPage() {
  const navigate = useNavigate();
  const { forgotPassword } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [formError, setFormError] = useState(null);

  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = async (values) => {
    setIsLoading(true);
    setFormError(null);
    try {
      await forgotPassword(values.email);
      setSent(true);
      toast.success("Password reset issued");
    } catch (error) {
      const message = getErrorMessage(error, "Could not process your request.");
      setFormError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthShell>
      {!sent ? (
        <div className="rounded-[28px] border border-deept/20 bg-white p-7 shadow-[0_18px_40px_-18px_rgba(31,74,64,0.28)] sm:p-9">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-extrabold" style={{ color: "#1a1a1a" }}>
              Forgot password
            </h1>
            <p className="mt-1.5 text-sm text-mutedink">
              Enter your registered email and we&apos;ll email you a link to choose a new password.
            </p>
          </div>

          {formError && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-xl border border-coral-pale bg-coral-pale/40 px-3.5 py-3 text-sm text-coral-dark"
            >
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div>
              <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-semibold text-deept">
                Email
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mutedink" />
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  placeholder="m@example.com"
                  className="h-11 rounded-xl border-deept/15 pl-9"
                  {...form.register("email")}
                />
              </div>
              {form.formState.errors.email && (
                <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.email.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="h-[46px] w-full rounded-full bg-teal-mid text-base font-bold text-white shadow-[0_10px_24px_-8px_rgba(46,124,103,0.65)] transition hover:-translate-y-0.5 hover:bg-teal-deep"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Sending...
                </span>
              ) : (
                <>
                  <Send className="size-4" />
                  Send Reset Token
                </>
              )}
            </Button>

            <p className="text-center text-sm text-mutedink">
              Remembered it?{" "}
              <Link to="/login" className="font-semibold text-teal underline-offset-2 hover:text-deept hover:underline">
                Back to Login
              </Link>
            </p>
          </form>
        </div>
      ) : (
        <div className="rounded-[28px] border border-deept/20 bg-white p-7 text-center shadow-[0_18px_40px_-18px_rgba(31,74,64,0.28)] sm:p-9">
          <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-teal-pale">
            <MailCheck className="size-8 text-teal-mid" />
          </span>
          <h1 className="text-2xl font-extrabold" style={{ color: "#1a1a1a" }}>
            Check your inbox
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-mutedink">
            If an account exists for <strong className="text-deept">{form.getValues("email")}</strong>, we&apos;ve
            emailed you a password reset link. It expires in 30 minutes and can only be used once.
          </p>

          <div className="mt-7 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
            <Button
              onClick={() => navigate("/reset-password", { replace: true })}
              className="h-11 rounded-full bg-teal-mid px-6 text-sm font-bold text-white shadow-[0_10px_24px_-8px_rgba(46,124,103,0.65)] transition hover:bg-teal-deep"
            >
              I&apos;ve got my code
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/login", { replace: true })}
              className="h-11 rounded-full px-6 text-sm font-semibold"
            >
              Back to Login
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center justify-center gap-4 text-xs text-mutedink">
        <span className="flex items-center gap-1">
          <ShieldCheck className="size-3.5 text-teal" />
          Secure recovery
        </span>
        <span className="size-1 rounded-full bg-deept/20" />
        <span>Single-use token</span>
      </div>
    </AuthShell>
  );
}

/** Shared auth-page chrome, matching the existing login design. */
export function AuthShell({ children }) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-softteal/40">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-blob absolute -right-16 -top-20 h-64 w-64 rounded-full bg-softlavender/50 blur-2xl" />
        <div className="animate-blob absolute -left-20 top-1/3 h-60 w-60 rounded-full bg-softteal/40 blur-2xl" style={{ animationDelay: "-7s" }} />
        <div className="animate-blob absolute bottom-10 right-1/4 h-52 w-52 rounded-full bg-softteal/60 blur-2xl" style={{ animationDelay: "-12s" }} />
      </div>

      <header className="relative z-10 flex items-center justify-between px-6 py-4 lg:px-12">
        <Link to="/login" className="flex items-center gap-2.5 no-underline">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-deep to-lavender shadow-md">
            <HeartPulse className="size-5 text-white" />
          </span>
          <span className="text-lg font-extrabold text-deept">HILMS</span>
        </Link>
        <Link
          to="/login"
          className="flex h-9 items-center justify-center gap-1.5 rounded-full bg-teal-mid px-4 text-sm font-bold text-white no-underline transition hover:bg-teal-deep"
        >
          <ArrowLeft className="size-4" />
          Login
        </Link>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-8">
        <div className="w-full max-w-[480px] fade-up">{children}</div>
      </main>
    </div>
  );
}

export default ForgotPasswordPage;
