import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  User,
  Mail,
  Phone,
  Lock,
  Eye,
  EyeOff,
  MapPin,
  ChevronDown,
  Check,
  ShieldCheck,
  Users,
  Stethoscope,
  FlaskConical,
  Clock,
  Send,
  X,
  AlertCircle,
  BadgeCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { ROLES } from "@/lib/roles";
import { getErrorMessage } from "@/lib/axios";
import { cn } from "@/lib/utils";

const ROLE_OPTIONS = [
  {
    value: ROLES.PATIENT,
    label: "Patient",
    icon: Users,
    description: "Create an account right away - no approval needed.",
  },
  {
    value: ROLES.DOCTOR,
    label: "Doctor",
    icon: Stethoscope,
    description: "Requires Admin approval and an NMC number.",
  },
  {
    value: ROLES.LAB,
    label: "Laboratory",
    icon: FlaskConical,
    description: "Requires Admin approval and a registry number.",
  },
];

const PHONE_PATTERN = /^[0-9+\-\s()]{7,20}$/;

const EMPTY = {
  role: ROLES.PATIENT,
  name: "",
  email: "",
  address: "",
  contactNumber: "",
  password: "",
  confirmPassword: "",
  nmcNumber: "",
  labRegistryNumber: "",
};

/**
 * Role-aware validation. Only the fields relevant to the selected role are
 * required, which mirrors the two distinct backend endpoints.
 */
const accessSchema = z
  .object({
    role: z.enum([ROLES.PATIENT, ROLES.DOCTOR, ROLES.LAB]),
    name: z.string().min(2, "Name must be at least 2 characters").max(120, "Name is too long"),
    email: z.string().email("Please enter a valid email"),
    address: z.string().min(5, "Address must be at least 5 characters").max(300, "Address is too long"),
    contactNumber: z
      .string()
      .min(7, "Please enter a valid contact number")
      .regex(PHONE_PATTERN, "Please enter a valid contact number"),
    password: z.string().optional(),
    confirmPassword: z.string().optional(),
    nmcNumber: z.string().optional(),
    labRegistryNumber: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === ROLES.PATIENT) {
      if (!data.password || data.password.length < 6) {
        ctx.addIssue({ code: "custom", path: ["password"], message: "Password must be at least 6 characters" });
      }
      if (data.password !== data.confirmPassword) {
        ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Passwords do not match" });
      }
    }
    if (data.role === ROLES.DOCTOR && !data.nmcNumber?.trim()) {
      ctx.addIssue({ code: "custom", path: ["nmcNumber"], message: "NMC number is required" });
    }
    if (data.role === ROLES.LAB && !data.labRegistryNumber?.trim()) {
      ctx.addIssue({
        code: "custom",
        path: ["labRegistryNumber"],
        message: "Laboratory registry number is required",
      });
    }
  });

/**
 * "Request Access" modal, opened from the Login page.
 *
 * The dialog intentionally hosts both public account-creation paths so the
 * user never has to leave the login screen:
 *   - Patient   -> POST /auth/register/patient  (active account immediately)
 *   - Doctor/Lab-> POST /auth/access-requests   (PENDING, Admin approval)
 */
export default function RequestAccessDialog({ open, onClose }) {
  const { registerPatient, requestAccess } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [formError, setFormError] = useState(null);
  const [result, setResult] = useState(null);
  const panelRef = useRef(null);
  const headingRef = useRef(null);

  const form = useForm({
    resolver: zodResolver(accessSchema),
    defaultValues: EMPTY,
  });

  const role = form.watch("role");
  const isPatient = role === ROLES.PATIENT;
  const selectedRole = ROLE_OPTIONS.find((option) => option.value === role);

  // Reset every time the dialog is reopened so a previous submission is never
  // still on screen.
  useEffect(() => {
    if (open) {
      form.reset(EMPTY);
      setResult(null);
      setFormError(null);
      setDropdownOpen(false);
      setShowPassword(false);
      setShowConfirm(false);
      const timer = setTimeout(() => headingRef.current?.focus(), 30);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open, form]);

  // Escape to dismiss, and stop the page scrolling behind the modal.
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && !isLoading) onClose?.();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, isLoading, onClose]);

  const onSubmit = async (values) => {
    setIsLoading(true);
    setFormError(null);
    try {
      if (values.role === ROLES.PATIENT) {
        // Only patient-relevant fields are sent - no NMC / registry values.
        const response = await registerPatient({
          name: values.name,
          email: values.email,
          address: values.address,
          contactNumber: values.contactNumber,
          password: values.password,
          confirmPassword: values.confirmPassword,
        });
        setResult({
          kind: "patient",
          message:
            response?.message ||
            "Your patient account has been created. You can now sign in with your email and password.",
        });
        toast.success("Patient account created");
      } else {
        // Doctor / Laboratory: no password is ever sent. Only the identity
        // field that belongs to the chosen role is included.
        const payload = {
          name: values.name,
          email: values.email,
          address: values.address,
          contactNumber: values.contactNumber,
          requestedRole: values.role,
        };
        if (values.role === ROLES.DOCTOR) payload.nmcNumber = values.nmcNumber.trim();
        else payload.labRegistryNumber = values.labRegistryNumber.trim();

        const response = await requestAccess(payload);
        setResult({
          kind: "pending",
          message:
            response?.message ||
            "Your registration request has been submitted successfully. Please wait for Admin approval.",
          reference: response?.data?.id || response?.id,
        });
        toast.success("Registration request submitted");
      }
    } catch (error) {
      const message = getErrorMessage(error, "Could not complete your request.");
      setFormError(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-deept/45 p-3 backdrop-blur-sm sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isLoading) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="request-access-title"
        className="max-h-[calc(100dvh-2rem)] w-full max-w-[560px] overflow-y-auto overscroll-contain rounded-[28px] border border-deept/20 bg-white p-6 shadow-[0_24px_60px_-20px_rgba(31,74,64,0.45)] fade-up sm:p-7"
      >
        {/* header */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2
              id="request-access-title"
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-extrabold outline-none"
              style={{ color: "#1a1a1a" }}
            >
              {result ? "All set" : "Request Access"}
            </h2>
            <p className="mt-1 text-sm text-mutedink">
              {result
                ? result.kind === "patient"
                  ? "Your account is ready to use."
                  : "Your request is now waiting for review."
                : "Patients get an account instantly. Doctors and Laboratory staff are approved by an Admin."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close"
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-mutedink transition hover:bg-softteal/40 hover:text-deept disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* ---------------- success state ---------------- */}
        {result ? (
          <>
            <div className="mb-5 flex flex-col items-center rounded-2xl border border-deept/10 bg-teal-pale/60 px-5 py-6 text-center">
              <span
                className={cn(
                  "mb-3 flex size-14 items-center justify-center rounded-full",
                  result.kind === "patient" ? "bg-teal-pale" : "bg-softteal"
                )}
              >
                {result.kind === "patient" ? (
                  <BadgeCheck className="size-7 text-teal-mid" />
                ) : (
                  <Clock className="size-7 text-teal-mid" />
                )}
              </span>
              <p className="text-sm leading-6 text-mutedink">{result.message}</p>
              {result.reference && (
                <p className="mt-3 font-mono text-xs text-mutedink">Reference: {result.reference}</p>
              )}
            </div>

            {result.kind === "pending" && (
              <ul className="mb-5 space-y-2 rounded-2xl border border-deept/10 bg-white p-4 text-sm text-mutedink">
                {[
                  "Your request is stored with status PENDING.",
                  "An Admin reviews it and accepts or declines.",
                  "If accepted, we email you a temporary password.",
                  "You must change it the first time you sign in.",
                ].map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-teal-mid" />
                    {line}
                  </li>
                ))}
              </ul>
            )}

            <Button
              onClick={onClose}
              className="h-11 w-full rounded-full bg-teal-mid text-sm font-bold text-white transition hover:bg-teal-deep"
            >
              {result.kind === "patient" ? "Go to Login" : "Close"}
            </Button>
          </>
        ) : (
          /* ---------------- form state ---------------- */
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            {formError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-xl border border-coral-pale bg-coral-pale/40 px-3.5 py-3 text-sm text-coral-dark"
              >
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* role selector */}
            <div>
              <span className="mb-1.5 block text-sm font-semibold text-deept">I am registering as</span>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDropdownOpen((openState) => !openState)}
                  aria-haspopup="listbox"
                  aria-expanded={dropdownOpen}
                  className={cn(
                    "flex h-11 w-full items-center justify-between rounded-xl border bg-white px-3.5 text-sm transition",
                    dropdownOpen ? "border-teal-mid ring-2 ring-teal-mid/20" : "border-deept/20 hover:border-deept/40"
                  )}
                >
                  <span className="flex items-center gap-2 text-[#1a1a1a]">
                    {selectedRole && <selectedRole.icon className="size-4 text-teal-mid" />}
                    {selectedRole?.label}
                  </span>
                  <ChevronDown className={cn("size-4 text-mutedink transition", dropdownOpen && "rotate-180")} />
                </button>

                {dropdownOpen && (
                  <div
                    role="listbox"
                    className="absolute left-0 right-0 top-full z-20 mt-1.5 overflow-hidden rounded-xl border border-deept/15 bg-white shadow-lg"
                  >
                    {ROLE_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isActive = role === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          role="option"
                          aria-selected={isActive}
                          onClick={() => {
                            form.setValue("role", option.value, { shouldValidate: false });
                            // Clear fields that do not belong to the new role so
                            // irrelevant values are never submitted.
                            form.setValue("password", "");
                            form.setValue("confirmPassword", "");
                            form.setValue("nmcNumber", "");
                            form.setValue("labRegistryNumber", "");
                            setDropdownOpen(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 px-3.5 py-2.5 text-left transition hover:bg-softteal/30",
                            isActive && "bg-softteal/40"
                          )}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-softteal text-teal-mid">
                            <Icon className="size-4" />
                          </span>
                          <span className="flex-1">
                            <span className="block text-sm font-semibold text-[#1a1a1a]">{option.label}</span>
                            <span className="block text-xs text-mutedink">{option.description}</span>
                          </span>
                          {isActive && <Check className="size-4 text-teal-mid" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* name + email */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="ra-name" className="mb-1.5 block text-sm font-semibold text-deept">
                  Full name
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                  <Input
                    id="ra-name"
                    placeholder="John Doe"
                    autoComplete="name"
                    className="h-11 rounded-xl border-deept/20 pl-9"
                    {...form.register("name")}
                  />
                </div>
                {form.formState.errors.name && (
                  <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="ra-email" className="mb-1.5 block text-sm font-semibold text-deept">
                  Email
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                  <Input
                    id="ra-email"
                    type="email"
                    placeholder="m@example.com"
                    autoComplete="email"
                    className="h-11 rounded-xl border-deept/20 pl-9"
                    {...form.register("email")}
                  />
                </div>
                {form.formState.errors.email && (
                  <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.email.message}</p>
                )}
              </div>
            </div>

            {/* address + contact number */}
            <div>
              <label htmlFor="ra-address" className="mb-1.5 block text-sm font-semibold text-deept">
                Address
              </label>
              <div className="relative">
                <MapPin className="pointer-events-none absolute left-3 top-3.5 size-4 text-deept" />
                <Input
                  id="ra-address"
                  placeholder="Street, city, postal code"
                  autoComplete="street-address"
                  className="h-11 rounded-xl border-deept/20 pl-9"
                  {...form.register("address")}
                />
              </div>
              {form.formState.errors.address && (
                <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.address.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="ra-contact" className="mb-1.5 block text-sm font-semibold text-deept">
                Contact number
              </label>
              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                <Input
                  id="ra-contact"
                  type="tel"
                  placeholder="98XXXXXXXX"
                  autoComplete="tel"
                  className="h-11 rounded-xl border-deept/20 pl-9"
                  {...form.register("contactNumber")}
                />
              </div>
              {form.formState.errors.contactNumber && (
                <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.contactNumber.message}</p>
              )}
            </div>

            {/* role-specific: doctor NMC */}
            {role === ROLES.DOCTOR && (
              <div>
                <label htmlFor="ra-nmc" className="mb-1.5 block text-sm font-semibold text-deept">
                  NMC number
                </label>
                <div className="relative">
                  <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                  <Input
                    id="ra-nmc"
                    placeholder="e.g. 12345/A/5678"
                    className="h-11 rounded-xl border-deept/20 pl-9"
                    {...form.register("nmcNumber")}
                  />
                </div>
                {form.formState.errors.nmcNumber && (
                  <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.nmcNumber.message}</p>
                )}
              </div>
            )}

            {/* role-specific: laboratory registry */}
            {role === ROLES.LAB && (
              <div>
                <label htmlFor="ra-registry" className="mb-1.5 block text-sm font-semibold text-deept">
                  Laboratory registry number
                </label>
                <div className="relative">
                  <FlaskConical className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                  <Input
                    id="ra-registry"
                    placeholder="e.g. LAB-REG-0001"
                    className="h-11 rounded-xl border-deept/20 pl-9"
                    {...form.register("labRegistryNumber")}
                  />
                </div>
                {form.formState.errors.labRegistryNumber && (
                  <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.labRegistryNumber.message}</p>
                )}
              </div>
            )}

            {/* role-specific: patient password */}
            {isPatient && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label htmlFor="ra-password" className="mb-1.5 block text-sm font-semibold text-deept">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                    <Input
                      id="ra-password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="h-11 rounded-xl border-deept/20 pl-9 pr-9"
                      {...form.register("password")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-deept hover:text-black"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.password.message}</p>
                  )}
                </div>

                <div>
                  <label htmlFor="ra-confirm" className="mb-1.5 block text-sm font-semibold text-deept">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-deept" />
                    <Input
                      id="ra-confirm"
                      type={showConfirm ? "text" : "password"}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      className="h-11 rounded-xl border-deept/20 pl-9 pr-9"
                      {...form.register("confirmPassword")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm((value) => !value)}
                      aria-label={showConfirm ? "Hide password" : "Show password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-deept hover:text-black"
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
              </div>
            )}

            {/* submit */}
            <Button
              type="submit"
              className="h-[46px] w-full rounded-full bg-teal-mid text-base font-bold text-white shadow-[0_10px_24px_-8px_rgba(46,124,103,0.65)] transition hover:-translate-y-0.5 hover:bg-teal-deep"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center gap-2">
                  <span className="size-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {isPatient ? "Creating account..." : "Submitting request..."}
                </span>
              ) : (
                <>
                  <Send className="size-4" />
                  {isPatient ? "Create Account" : "Submit Request"}
                </>
              )}
            </Button>

            <p className="flex items-center justify-center gap-1.5 text-xs text-mutedink">
              <ShieldCheck className="size-3.5 text-teal" />
              {isPatient
                ? "Your account is created and active immediately."
                : "An Admin must approve before you can sign in."}
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
