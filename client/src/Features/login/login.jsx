import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";

const loginSchema = z.object({
  email: z.string().email("Please enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const onSubmit = async (values) => {
    setIsLoading(true);
    try {
      const user = await login(values.email, values.password);
      toast.success("Welcome back!");
      if (user.role === "admin") {
        navigate("/admin/dashboard");
      } else if (user.role === "doctor") {
        navigate("/doctor/dashboard");
      } else if (user.role === "lab") {
        navigate("/lab/dashboard");
      } else {
        navigate("/patient/dashboard");
      }
    } catch (error) {
      toast.error(error.response?.data?.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-cream">
      {/* decorative background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="animate-blob absolute -right-16 -top-20 h-64 w-64 rounded-full bg-softlavender/50 blur-2xl" />
        <div className="animate-blob absolute -left-20 top-1/3 h-60 w-60 rounded-full bg-softteal/40 blur-2xl" style={{ animationDelay: "-7s" }} />
        <div className="animate-blob absolute bottom-10 right-1/4 h-52 w-52 rounded-full bg-softcream/60 blur-2xl" style={{ animationDelay: "-12s" }} />
        {/* small decorative elements */}
        <span className="absolute left-[10%] top-[15%] text-xl opacity-15">✚</span>
        <span className="absolute right-[12%] top-[20%] text-lg opacity-15">♥</span>
        <span className="absolute bottom-[25%] left-[8%] text-sm opacity-15">🩺</span>
        <span className="absolute bottom-[18%] right-[15%] text-lg opacity-10">🧪</span>
      </div>

      {/* header */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 lg:px-12">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-coral to-lavender shadow-md">
            <HeartPulse className="size-5 text-white" />
          </span>
          <span className="text-lg font-extrabold text-deept">HILMS</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-mutedink sm:inline">
            Don&apos;t have an account?
          </span>
          <Link
            to="/signup"
            className="flex h-9 items-center justify-center rounded-full bg-coral px-4 text-sm font-bold text-white transition hover:bg-coral-dark"
          >
            Register
          </Link>
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

            {/* form */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* email */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-deept">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mutedink" />
                  <Input
                    type="email"
                    placeholder="m@example.com"
                    className="h-11 rounded-xl border-deept/15 pl-9"
                    {...form.register("email")}
                  />
                </div>
                {form.formState.errors.email && (
                  <p className="mt-1 text-xs text-coral-dark">
                    {form.formState.errors.email.message}
                  </p>
                )}
              </div>

              {/* password */}
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-deept">
                  Password
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mutedink" />
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="h-11 rounded-xl border-deept/15 pl-9 pr-9"
                    {...form.register("password")}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-mutedink hover:text-deept"
                  >
                    {showPassword ? (
                      <EyeOff className="size-4" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                  </button>
                </div>
                {form.formState.errors.password && (
                  <p className="mt-1 text-xs text-coral-dark">
                    {form.formState.errors.password.message}
                  </p>
                )}
              </div>

              {/* submit button */}
              <Button
                type="submit"
                className="h-[46px] w-full rounded-full bg-coral text-base font-bold text-white shadow-[0_10px_24px_-8px_rgba(242,106,80,0.65)] transition hover:-translate-y-0.5 hover:bg-coral-dark"
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

              {/* signup link */}
              <p className="text-center text-sm text-mutedink">
                Don&apos;t have an account?{" "}
                <Link
                  to="/signup"
                  className="font-semibold text-teal underline-offset-2 hover:text-deept hover:underline"
                >
                  Sign up
                </Link>
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
            <span>Role-based access</span>
          </div>
        </div>
      </main>
    </div>
  );
}

export default LoginPage;
