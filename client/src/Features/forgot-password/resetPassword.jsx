import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { KeyRound, Lock, Eye, EyeOff, ShieldCheck, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { getErrorMessage } from "@/lib/axios";
import { AuthShell } from "./forgotPassword";

const resetPasswordSchema = z
  .object({
    token: z.string().min(8, "Please paste the reset link or code from your email"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * Accepts either the full emailed link (.../reset-password?token=abc) or a
 * bare token, and also pulls the token out of the current URL when the user
 * arrived via the emailed deep link.
 */
const extractToken = (raw) => {
  const value = String(raw || "").trim();
  if (!value) return "";
  const fromQuery = value.match(/[?&]token=([^&\s]+)/);
  if (fromQuery) return decodeURIComponent(fromQuery[1]);
  if (/^https?:\/\//i.test(value)) return "";
  return value;
};

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { resetPassword } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [done, setDone] = useState(false);
  const [formError, setFormError] = useState(null);

  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      // Arriving via the emailed deep link pre-fills the token.
      token: extractToken(searchParams.get("token") || ""),
      password: "",
      confirmPassword: "",
    },
  });

  const onSubmit = async (values) => {
    setIsLoading(true);
    setFormError(null);
    try {
      await resetPassword({ ...values, token: extractToken(values.token) });
      setDone(true);
      toast.success("Password reset successfully");
    } catch (error) {
      const message = getErrorMessage(error, "Could not reset your password.");
      setFormError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell>
        <div className="rounded-[28px] border border-deept/20 bg-white p-7 text-center shadow-[0_18px_40px_-18px_rgba(31,74,64,0.28)] sm:p-9">
          <span className="mx-auto mb-5 flex size-16 items-center justify-center rounded-full bg-teal-pale">
            <CheckCircle2 className="size-8 text-teal-mid" />
          </span>
          <h1 className="text-2xl font-extrabold" style={{ color: "#1a1a1a" }}>
            Password updated
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-mutedink">
            Your password has been reset and all other reset tokens have been invalidated. You can
            now sign in with your new password.
          </p>
          <Button
            onClick={() => navigate("/login", { replace: true })}
            className="mt-7 h-11 rounded-full bg-teal-mid px-6 text-sm font-bold text-white shadow-[0_10px_24px_-8px_rgba(46,124,103,0.65)] transition hover:bg-teal-deep"
          >
            Go to Login
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="rounded-[28px] border border-deept/20 bg-white p-7 shadow-[0_18px_40px_-18px_rgba(31,74,64,0.28)] sm:p-9">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-extrabold" style={{ color: "#1a1a1a" }}>
            Reset password
          </h1>
          <p className="mt-1.5 text-sm text-mutedink">
            Paste the reset link from your email (or just the code) and choose a new password.
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
            <label htmlFor="reset-token" className="mb-1.5 block text-sm font-semibold text-deept">
              Reset link or code
            </label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mutedink" />
              <Input
                id="reset-token"
                placeholder="Paste the link from your email"
                autoComplete="one-time-code"
                className="h-11 rounded-xl border-deept/15 pl-9 font-mono text-xs"
                {...form.register("token")}
              />
            </div>
            {form.formState.errors.token && (
              <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.token.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="reset-password" className="mb-1.5 block text-sm font-semibold text-deept">
              New password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mutedink" />
              <Input
                id="reset-password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                className="h-11 rounded-xl border-deept/15 pl-9 pr-9"
                {...form.register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-mutedink hover:text-deept"
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {form.formState.errors.password && (
              <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.password.message}</p>
            )}
          </div>

          <div>
            <label htmlFor="reset-confirm" className="mb-1.5 block text-sm font-semibold text-deept">
              Confirm new password
            </label>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mutedink" />
              <Input
                id="reset-confirm"
                type={showConfirm ? "text" : "password"}
                placeholder="••••••••"
                autoComplete="new-password"
                className="h-11 rounded-xl border-deept/15 pl-9 pr-9"
                {...form.register("confirmPassword")}
              />
              <button
                type="button"
                onClick={() => setShowConfirm((value) => !value)}
                aria-label={showConfirm ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-mutedink hover:text-deept"
              >
                {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            {form.formState.errors.confirmPassword && (
              <p className="mt-1 text-xs text-coral-dark">
                {form.formState.errors.confirmPassword.message}
              </p>
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
                Resetting...
              </span>
            ) : (
              "Reset Password"
            )}
          </Button>
        </form>
      </div>

      <div className="mt-5 flex items-center justify-center gap-4 text-xs text-mutedink">
        <span className="flex items-center gap-1">
          <ShieldCheck className="size-3.5 text-teal" />
          Secure recovery
        </span>
        <span className="size-1 rounded-full bg-deept/20" />
        <span>Expires in 30 minutes</span>
      </div>
    </AuthShell>
  );
}

export default ResetPasswordPage;
