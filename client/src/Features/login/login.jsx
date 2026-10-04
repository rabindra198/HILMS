import { useEffect, useState } from "react";
import { useNavigate, Link, useLocation, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  HeartPulse,
  Mail,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  LogIn,
  KeyRound,
  UserPlus,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import RequestAccessDialog from "@/Features/request-access/RequestAccessDialog";
import { getErrorMessage } from "@/lib/axios";
import { getRoleHome } from "@/lib/roles";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

const REASON_MESSAGES = {
  PENDING: "Your access request is still pending administrator approval.",
  REJECTED: "Your access request was rejected. Please contact the hospital administrator.",
  INACTIVE: "Your account has been deactivated. Please contact the hospital administrator.",
};

function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login, getErrorMessage: contextErrorMessage } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [formError, setFormError] = useState(null);
  const [accessOpen, setAccessOpen] = useState(searchParams.get("requestAccess") === "1");

  // Landing-page links point at /login?requestAccess=1 so the dialog opens
  // without needing a separate registration page.
  useEffect(() => {
    if (searchParams.get("requestAccess") === "1") {
      setAccessOpen(true);
    }
  }, [searchParams]);

  const closeAccessDialog = () => {
    setAccessOpen(false);
    if (searchParams.get("requestAccess") === "1") {
      const next = new URLSearchParams(searchParams);
      next.delete("requestAccess");
      setSearchParams(next, { replace: true });
    }
  };

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Shown when the guard bounced a non-approved (pending/rejected) user here.
  const accessNotice = REASON_MESSAGES[location.state?.reason] || null;

  const onSubmit = async (values) => {
    setIsLoading(true);
    setFormError(null);
    try {
      const user = await login(values.email, values.password, remember);

      // The role used for the redirect always comes from the backend response.
      // A freshly approved Doctor / Laboratory account is sent to the forced
      // password change instead of its dashboard; the backend refuses the
      // dashboard independently until the temporary password is replaced.
      if (user.mustChangePassword) {
        toast.success("Signed in. Please set a new password to continue.");
        navigate("/change-password", { replace: true });
        return;
      }

      toast.success(`Welcome back, ${user.name?.split(" ")[0] || "there"}!`);
      navigate(getRoleHome(user.role), { replace: true });
    } catch (error) {
      const status = error.response?.status;
      const message = contextErrorMessage
        ? contextErrorMessage(error)
        : getErrorMessage(error, "Login failed");

      if (status === 403 && error.response?.data?.status) {
        setFormError(REASON_MESSAGES[error.response.data.status] || message);
      } else {
        setFormError(message);
      }
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-softteal/40">
      {/* decorative background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-blob absolute -right-16 -top-20 h-64 w-64 rounded-full bg-softlavender/50 blur-2xl" />
        <div className="animate-blob absolute -left-20 top-1/3 h-60 w-60 rounded-full bg-softteal/40 blur-2xl" style={{ animationDelay: "-7s" }} />
        <div className="animate-blob absolute bottom-10 right-1/4 h-52 w-52 rounded-full bg-softteal/60 blur-2xl" style={{ animationDelay: "-12s" }} />
        <span className="absolute left-[10%] top-[15%] text-xl opacity-15">✚</span>
        <span className="absolute right-[12%] top-[20%] text-lg opacity-15">♥</span>
        <span className="absolute bottom-[25%] left-[8%] text-sm opacity-15">🩺</span>
        <span className="absolute bottom-[18%] right-[15%] text-lg opacity-10">🧪</span>
      </div>

      {/* header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 lg:px-12">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-teal-deep to-lavender shadow-md">
            <HeartPulse className="size-5 text-white" />
          </span>
          <span className="text-lg font-extrabold text-deept">HILMS</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-mutedink sm:inline">
            Need access to HILMS?
          </span>
          <button
            type="button"
            onClick={() => setAccessOpen(true)}
            className="flex h-9 items-center justify-center rounded-full bg-teal-mid px-4 text-sm font-bold text-white transition hover:bg-teal-deep"
          >
            Request Access
          </button>
        </div>
      </header>

      {/* main content */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-8">
        <div className="w-full max-w-[480px] fade-up">
          {/* login card */}
          <div className="rounded-[28px] border border-deept/20 bg-white p-7 shadow-[0_18px_40px_-18px_rgba(31,74,64,0.28)] sm:p-9">
            {/* card header */}
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-extrabold" style={{ color: "#1a1a1a" }}>
                Welcome back
              </h1>
              <p className="mt-1.5 text-sm text-mutedink">
                Sign in to your HILMS account.
              </p>
            </div>

            {(accessNotice || formError) && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-xl border border-coral-pale bg-coral-pale/40 px-3.5 py-3 text-sm text-coral-dark"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{accessNotice || formError}</span>
              </div>
            )}

            {/* form */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              {/* email */}
              <div>
                <label htmlFor="login-email" className="mb-1.5 block text-sm font-semibold text-deept">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mutedink" />
                  <Input
                    id="login-email"
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

              {/* password */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="login-password" className="block text-sm font-semibold text-deept">
                    Password
                  </label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold text-teal underline-offset-2 hover:text-deept hover:underline"
                  >
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mutedink" />
                  <Input
                    id="login-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-11 rounded-xl border-deept/15 pl-9 pr-9"
                    {...form.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
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

              {/* FR-AUTH-08: keep this device signed in for longer. */}
              <label className="flex cursor-pointer select-none items-center gap-2 text-sm text-mutedink">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(event) => setRemember(event.target.checked)}
                  className="size-4 rounded border-deept/30 accent-teal-mid"
                />
                Remember me on this device
              </label>

              {/* submit button */}
              <Button
                type="submit"
                className="h-[46px] w-full rounded-full bg-teal-mid text-base font-bold text-white shadow-[0_10px_24px_-8px_rgba(46,124,103,0.65)] transition hover:-translate-y-0.5 hover:bg-teal-deep"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Logging in...
                  </span>
                ) : (
                  <>
                    <LogIn className="size-4" />
                    Login
                  </>
                )}
              </Button>

              {/* request access */}
              <p className="text-center text-sm text-mutedink">
                Don&apos;t have access yet?{" "}
                <button
                  type="button"
                  onClick={() => setAccessOpen(true)}
                  className="inline-flex items-center gap-1 font-semibold text-teal underline-offset-2 hover:text-deept hover:underline"
                >
                  <UserPlus className="size-3.5" />
                  Request Access
                </button>
              </p>
            </form>
          </div>

          {/* security note */}
          <div className="mt-5 flex items-center justify-center gap-4 text-xs text-mutedink">
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3.5 text-teal" />
              Secure authentication
            </span>
            <span className="size-1 rounded-full bg-deept/20" />
            <span className="flex items-center gap-1">
              <KeyRound className="size-3.5 text-teal" />
              Role-based access
            </span>
          </div>
        </div>
      </main>

      {/* Request Access opens as a dialog on the login page - Patient
          self-registration and Doctor/Laboratory approval requests both live
          here, so no separate registration page is needed. */}
      <RequestAccessDialog open={accessOpen} onClose={closeAccessDialog} />
    </div>
  );
}

export default LoginPage;
