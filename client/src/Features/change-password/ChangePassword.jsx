import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  HeartPulse,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  KeyRound,
  AlertCircle,
  ArrowRight,
  LogOut,
  Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { getRoleHome } from "@/lib/roles";
import { getErrorMessage } from "@/lib/axios";

const changePasswordSchema = z
  .object({
    temporaryPassword: z.string().min(1, "Please enter the temporary password you received"),
    newPassword: z.string().min(6, "New password must be at least 6 characters"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .refine((data) => data.newPassword !== data.temporaryPassword, {
    message: "New password must be different from the temporary password",
    path: ["newPassword"],
  });

/**
 * First-login password change.
 *
 * Reached automatically when a Patient, Doctor or Laboratory signs in with the
 * temporary password emailed when their account was provisioned or approved.
 * The session already exists, so this screen only needs to replace the
 * credential. Until it succeeds, the backend refuses every other protected
 * route with 403 PASSWORD_CHANGE_REQUIRED.
 *
 * This is a dedicated page rather than a modal on purpose: a modal would vanish
 * on refresh, and the requirement is that the change is still pending after a
 * page reload.
 */
export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { user, changePassword, logout } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formError, setFormError] = useState(null);

  const form = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { temporaryPassword: "", newPassword: "", confirmPassword: "" },
  });

  const onSubmit = async (values) => {
    setIsLoading(true);
    setFormError(null);
    try {
      await changePassword({
        temporaryPassword: values.temporaryPassword,
        newPassword: values.newPassword,
        confirmPassword: values.confirmPassword,
      });
      // changePassword refreshes the user, so the mustChangePassword flag is
      // already cleared and ProtectedRoute will now let the user through.
      toast.success("Password updated. Welcome to HILMS!");
      navigate(getRoleHome(user?.role), { replace: true });
    } catch (error) {
      const message = getErrorMessage(error, "Could not update your password.");
      setFormError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  // "Cancel / Log out": the only legitimate exit while a temporary password is
  // still held. The session is discarded server-side, so there is no half
  // authenticated state left behind.
  const onCancel = async () => {
    setIsLoading(true);
    try {
      await logout();
      toast("Signed out. You can sign in again with your temporary password.");
      navigate("/login", { replace: true });
    } catch (error) {
      setFormError(getErrorMessage(error, "Could not sign out."));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-softteal/40">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-blob absolute -right-16 -top-20 h-64 w-64 rounded-full bg-softlavender/50 blur-2xl" />
        <div className="animate-blob absolute -left-20 top-1/3 h-60 w-60 rounded-full bg-softteal/40 blur-2xl" style={{ animationDelay: "-7s" }} />
      </div>

      <header className="relative z-10 flex items-center gap-2.5 px-6 py-4 lg:px-12">
        <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-deep to-lavender shadow-md">
          <HeartPulse className="size-5 text-white" />
        </span>
        <span className="text-lg font-extrabold text-deept">HILMS</span>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-10">
        <div className="w-full max-w-[480px] fade-up">
          <div className="rounded-[28px] border border-deept/20 bg-white p-7 shadow-[0_18px_40px_-18px_rgba(31,74,64,0.28)] sm:p-9">
            <div className="mb-6 text-center">
              <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-softteal">
                <KeyRound className="size-7 text-teal-mid" />
              </span>
              <h1 className="text-2xl font-extrabold" style={{ color: "#1a1a1a" }}>
                Set a new password
              </h1>
              <p className="mt-1.5 text-sm text-mutedink">
                Your account was created with a temporary password. Choose your own before
                continuing to your dashboard.
              </p>
            </div>

            {user?.email && (
              <div className="mb-4 flex items-center gap-2 rounded-xl border border-deept/10 bg-teal-pale/60 px-3.5 py-2.5 text-sm text-mutedink">
                <Mail className="size-4 shrink-0 text-teal-mid" />
                <span className="truncate">{user.email}</span>
              </div>
            )}

            {formError && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-xl border border-coral-pale bg-coral-pale/40 px-3.5 py-3 text-sm text-coral-dark"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {/* temporary password */}
              <div>
                <label htmlFor="cp-current" className="mb-1.5 block text-sm font-semibold text-deept">
                  Temporary password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mutedink" />
                  <Input
                    id="cp-current"
                    type={showCurrent ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="The password from your email"
                    className="h-11 rounded-xl border-deept/15 pl-9 pr-9"
                    {...form.register("temporaryPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent((value) => !value)}
                    aria-label={showCurrent ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-mutedink hover:text-deept"
                  >
                    {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {form.formState.errors.temporaryPassword && (
                  <p className="mt-1 text-xs text-coral-dark">
                    {form.formState.errors.temporaryPassword.message}
                  </p>
                )}
              </div>

              {/* new password */}
              <div>
                <label htmlFor="cp-new" className="mb-1.5 block text-sm font-semibold text-deept">
                  New password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mutedink" />
                  <Input
                    id="cp-new"
                    type={showNew ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    className="h-11 rounded-xl border-deept/15 pl-9 pr-9"
                    {...form.register("newPassword")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew((value) => !value)}
                    aria-label={showNew ? "Hide password" : "Show password"}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-mutedink hover:text-deept"
                  >
                    {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {form.formState.errors.newPassword && (
                  <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.newPassword.message}</p>
                )}
              </div>

              {/* confirm new password */}
              <div>
                <label htmlFor="cp-confirm" className="mb-1.5 block text-sm font-semibold text-deept">
                  Confirm new password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mutedink" />
                  <Input
                    id="cp-confirm"
                    type={showConfirm ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="••••••••"
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
                    Updating...
                  </span>
                ) : (
                  <>
                    <ArrowRight className="size-4" />
                    Save and Continue
                  </>
                )}
              </Button>

              <button
                type="button"
                onClick={onCancel}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-mutedink transition hover:bg-softteal/40 hover:text-deept disabled:opacity-50"
              >
                <LogOut className="size-4" />
                Cancel / Log out
              </button>
            </form>
          </div>

          <div className="mt-5 flex items-center justify-center gap-4 text-xs text-mutedink">
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-teal" />
              Your temporary password stops working immediately
            </span>
          </div>
        </div>
      </main>
    </div>
  );
}
