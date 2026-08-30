import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  HeartPulse,
  User,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ChevronDown,
  Check,
  ShieldCheck,
  Users,
  Stethoscope,
  FlaskConical,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { cn } from "@/lib/utils";

const signupSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    email: z.string().email("Please enter a valid email"),
    phone: z.string().min(7, "Please enter a valid phone number"),
    password: z.string().min(6, "Password must be at least 6 characters"),
    confirmPassword: z.string(),
    role: z.string().min(1, "Please select a role"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const roles = [
  {
    value: "patient",
    label: "Patient",
    icon: Users,
    description: "Access appointments, prescriptions, reports and medical history.",
  },
  {
    value: "doctor",
    label: "Doctor",
    icon: Stethoscope,
    description: "Manage consultations, diagnoses, lab requests and prescriptions.",
  },
  {
    value: "lab",
    label: "Laboratory",
    icon: FlaskConical,
    description: "Manage laboratory requests, samples, results and reports.",
  },
  {
    value: "admin",
    label: "Admin",
    icon: ClipboardList,
    description: "Manage patients, doctors, appointments, billing and operations.",
  },
];

function SignupPage() {
  const navigate = useNavigate();
  const { signup } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const form = useForm({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      name: "",
      email: "",
      phone: "",
      password: "",
      confirmPassword: "",
      role: "",
    },
  });

  const selectedRole = roles.find((r) => r.value === form.watch("role"));

  const onSubmit = async (values) => {
    setIsLoading(true);
    try {
      const user = await signup(
        values.name,
        values.email,
        values.password,
        values.phone,
        values.role
      );
      toast.success("Account created successfully!");
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
      toast.error(error.response?.data?.message || "Signup failed");
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
        <span className="absolute left-[25%] bottom-[35%] text-xs opacity-10">●</span>
        <span className="absolute right-[30%] top-[40%] text-xs opacity-10">●</span>
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
            Already have an account?
          </span>
          <Link
            to="/login"
            className="flex h-9 items-center justify-center rounded-full bg-coral px-4 text-sm font-bold text-white transition hover:bg-coral-dark"
          >
            Login
          </Link>
        </div>
      </header>

      {/* main content */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 pb-8">
        <div className="w-full max-w-[560px] fade-up">
          {/* signup card */}
          <div className="rounded-[28px] border border-deept/20 bg-white p-7 shadow-[0_18px_40px_-18px_rgba(31,74,64,0.28)] sm:p-9">
             {/* card header */}
             <div className="mb-6 text-center">
              <h1 className="text-2xl font-extrabold" style={{ color: "#1a1a1a" }}>
                Create your account
              </h1>
               <p className="mt-1.5 text-sm text-mutedink">
                 Join the HILMS healthcare ecosystem.
               </p>
             </div>

             {/* form */}
             <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
               {/* role dropdown */}
               <div>
                 <label className="mb-1.5 block text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                   Select Your Role
                 </label>
                 <div className="relative">
                   <button
                     type="button"
                     onClick={() => setDropdownOpen(!dropdownOpen)}
                     className={cn(
                       "flex h-11 w-full items-center justify-between rounded-xl border bg-white px-3.5 text-sm transition",
                       dropdownOpen
                         ? "border-coral ring-2 ring-coral/20"
                         : "border-deept/20 hover:border-deept/40",
                       !form.watch("role") && "text-mutedink"
                     )}
                   >
                     {selectedRole ? (
                       <span className="flex items-center gap-2" style={{ color: "#1a1a1a" }}>
                         <selectedRole.icon className="size-4 text-coral-dark" />
                         {selectedRole.label}
                       </span>
                     ) : (
                       <span>Choose your role</span>
                     )}
                     <ChevronDown
                       className={cn(
                         "size-4 text-mutedink transition",
                         dropdownOpen && "rotate-180"
                       )}
                     />
                   </button>

                   {/* dropdown menu */}
                   {dropdownOpen && (
                     <div className="absolute left-0 right-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-deept/15 bg-white shadow-lg">
                       {roles.map((r) => (
                         <button
                           key={r.value}
                           type="button"
                           onClick={() => {
                             form.setValue("role", r.value, {
                               shouldValidate: true,
                             });
                             setDropdownOpen(false);
                           }}
                           className={cn(
                             "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-softteal/30",
                             form.watch("role") === r.value && "bg-softteal/40"
                           )}
                         >
                           <span className="flex size-8 items-center justify-center rounded-lg bg-softcream text-coral-dark">
                             <r.icon className="size-4" />
                           </span>
                           <span className="flex-1">
                             <span className="block text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                               {r.label}
                             </span>
                           </span>
                           {form.watch("role") === r.value && (
                             <Check className="size-4 text-coral-dark" />
                           )}
                         </button>
                       ))}
                     </div>
                   )}
                 </div>
                 {form.formState.errors.role && (
                   <p className="mt-1 text-xs text-coral-dark">
                     {form.formState.errors.role.message}
                   </p>
                 )}
               </div>

               {/* name + email row */}
               <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                 <div>
                   <label className="mb-1.5 block text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                     Name
                   </label>
                   <div className="relative">
                     <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                     <Input
                       placeholder="John Doe"
                       className="h-11 rounded-xl border-deept/20 pl-9 text-foreground"
                       style={{ color: "#1a1a1a" }}
                       {...form.register("name")}
                     />
                   </div>
                   {form.formState.errors.name && (
                     <p className="mt-1 text-xs text-coral-dark">
                       {form.formState.errors.name.message}
                     </p>
                   )}
                 </div>
                 <div>
                   <label className="mb-1.5 block text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                     Email
                   </label>
                   <div className="relative">
                     <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                     <Input
                       type="email"
                       placeholder="m@example.com"
                       className="h-11 rounded-xl border-deept/20 pl-9 text-foreground"
                       style={{ color: "#1a1a1a" }}
                       {...form.register("email")}
                     />
                   </div>
                   {form.formState.errors.email && (
                     <p className="mt-1 text-xs text-coral-dark">
                       {form.formState.errors.email.message}
                     </p>
                   )}
                 </div>
               </div>

               {/* phone */}
               <div>
                 <label className="mb-1.5 block text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                   Phone
                 </label>
                 <div className="relative">
                   <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                   <Input
                     placeholder="98XXXXXXXX"
                     className="h-11 rounded-xl border-deept/20 pl-9 text-foreground"
                     style={{ color: "#1a1a1a" }}
                     {...form.register("phone")}
                   />
                 </div>
                 {form.formState.errors.phone && (
                   <p className="mt-1 text-xs text-coral-dark">
                     {form.formState.errors.phone.message}
                   </p>
                 )}
               </div>

               {/* password + confirm row */}
               <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                 <div>
                   <label className="mb-1.5 block text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                     Password
                   </label>
                   <div className="relative">
                     <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                     <Input
                       type={showPassword ? "text" : "password"}
                       placeholder="••••••••"
                       className="h-11 rounded-xl border-deept/20 pl-9 pr-9 text-foreground"
                       style={{ color: "#1a1a1a" }}
                       {...form.register("password")}
                     />
                     <button
                       type="button"
                       onClick={() => setShowPassword(!showPassword)}
                       className="absolute right-3 top-1/2 -translate-y-1/2 text-deept hover:text-black"
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
                 <div>
                   <label className="mb-1.5 block text-sm font-semibold" style={{ color: "#1a1a1a" }}>
                     Confirm Password
                   </label>
                   <div className="relative">
                     <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                     <Input
                       type={showConfirm ? "text" : "password"}
                       placeholder="••••••••"
                       className="h-11 rounded-xl border-deept/20 pl-9 pr-9 text-foreground"
                       style={{ color: "#1a1a1a" }}
                       {...form.register("confirmPassword")}
                     />
                     <button
                       type="button"
                       onClick={() => setShowConfirm(!showConfirm)}
                       className="absolute right-3 top-1/2 -translate-y-1/2 text-deept hover:text-black"
                     >
                       {showConfirm ? (
                         <EyeOff className="size-4" />
                       ) : (
                         <Eye className="size-4" />
                       )}
                     </button>
                   </div>
                   {form.formState.errors.confirmPassword && (
                     <p className="mt-1 text-xs text-coral-dark">
                       {form.formState.errors.confirmPassword.message}
                     </p>
                   )}
                 </div>
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
                    Creating Account...
                  </span>
                ) : (
                  "Create Account"
                )}
              </Button>

              {/* login link */}
              <p className="text-center text-sm text-mutedink">
                Already have an account?{" "}
                <Link
                  to="/login"
                  className="font-semibold text-teal underline-offset-2 hover:text-deept hover:underline"
                >
                  Login
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

export default SignupPage;
