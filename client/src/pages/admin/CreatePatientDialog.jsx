import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus, Mail, Phone, MapPin, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createPatientAccount } from "@/services/adminApi";
import { getErrorMessage } from "@/lib/axios";

const schema = z.object({
  name: z.string().trim().min(2, "Please enter the patient's full name"),
  email: z.string().email("Please enter a valid email address"),
  contactNumber: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s\-()]{6,19}$/, "Please enter a valid contact number"),
  address: z.string().trim().max(300, "Address is too long").optional().or(z.literal("")),
});

/**
 * Admin-initiated Patient provisioning.
 *
 * There is deliberately no password field. The backend generates a secure
 * temporary password and emails it over SMTP, so an Admin can never set a weak
 * or already-known credential for a patient. The success state makes that
 * explicit, because the Admin will not see the password themselves.
 */
export default function CreatePatientDialog({ open, onClose, onCreated }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [createdEmail, setCreatedEmail] = useState(null);

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", contactNumber: "", address: "" },
  });

  const close = () => {
    form.reset();
    setError(null);
    setCreatedEmail(null);
    onClose?.();
  };

  const onSubmit = async (values) => {
    setIsSubmitting(true);
    setError(null);
    try {
      const result = await createPatientAccount({
        name: values.name,
        email: values.email,
        contactNumber: values.contactNumber,
        address: values.address || undefined,
      });
      setCreatedEmail(result?.user?.email || values.email);
      toast.success("Patient account created. The temporary password has been emailed.");
      onCreated?.(result?.user);
      form.reset();
    } catch (err) {
      const message = getErrorMessage(err, "Could not create the Patient account.");
      setError(message);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-deept/40 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-patient-title"
        className="w-full max-w-lg rounded-3xl border border-deept/20 bg-white p-7 shadow-2xl"
      >
        {createdEmail ? (
          <div className="text-center">
            <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-teal-pale">
              <MailCheck className="size-7 text-teal-mid" />
            </span>
            <h2 id="create-patient-title" className="font-heading text-xl font-extrabold text-teal-deep">
              Account created
            </h2>
            <p className="mt-2 text-sm text-ink-soft">
              A temporary password has been emailed to{" "}
              <span className="font-semibold text-ink">{createdEmail}</span>. The patient must
              change it the first time they sign in.
            </p>
            <p className="mt-3 rounded-xl bg-teal-pale/60 px-3.5 py-2.5 text-xs text-ink-soft">
              For security the password is never shown here and cannot be retrieved later. If the
              email does not arrive, the account was not created.
            </p>
            <Button
              type="button"
              onClick={close}
              className="mt-6 h-11 w-full rounded-full bg-teal-mid font-bold text-white hover:bg-teal-deep"
            >
              Done
            </Button>
          </div>
        ) : (
          <>
            <div className="mb-5 text-center">
              <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-softteal">
                <UserPlus className="size-7 text-teal-mid" />
              </span>
              <h2 id="create-patient-title" className="font-heading text-xl font-extrabold text-teal-deep">
                Register a Patient
              </h2>
              <p className="mt-1.5 text-sm text-ink-soft">
                Creates a login for walk-in and referred patients.
              </p>
            </div>

            {error && (
              <div role="alert" className="mb-4 rounded-xl border border-coral/30 bg-coral-pale px-3.5 py-3 text-sm text-coral-dark">
                {error}
              </div>
            )}

            <div className="mb-4 rounded-xl bg-teal-pale/60 px-3.5 py-3 text-xs text-ink-soft">
              HILMS generates a secure temporary password and emails it to the patient. It is never
              displayed or stored in plain text.
            </div>

            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <div>
                <label htmlFor="cp-name" className="mb-1.5 block text-sm font-semibold text-deept">
                  Full name
                </label>
                <Input
                  id="cp-name"
                  placeholder="Asha Shrestha"
                  className="h-11 rounded-xl border-deept/15"
                  {...form.register("name")}
                />
                {form.formState.errors.name && (
                  <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.name.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="cp-email" className="mb-1.5 block text-sm font-semibold text-deept">
                  Email address
                </label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                  <Input
                    id="cp-email"
                    type="email"
                    placeholder="patient@example.com"
                    className="h-11 rounded-xl border-deept/15 pl-9"
                    {...form.register("email")}
                  />
                </div>
                {form.formState.errors.email && (
                  <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.email.message}</p>
                )}
              </div>

              <div>
                <label htmlFor="cp-phone" className="mb-1.5 block text-sm font-semibold text-deept">
                  Contact number
                </label>
                <div className="relative">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
                  <Input
                    id="cp-phone"
                    placeholder="+977 98XXXXXXXX"
                    className="h-11 rounded-xl border-deept/15 pl-9"
                    {...form.register("contactNumber")}
                  />
                </div>
                {form.formState.errors.contactNumber && (
                  <p className="mt-1 text-xs text-coral-dark">
                    {form.formState.errors.contactNumber.message}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="cp-address" className="mb-1.5 block text-sm font-semibold text-deept">
                  Address <span className="font-normal text-ink-soft">(optional)</span>
                </label>
                <div className="relative">
                  <MapPin className="pointer-events-none absolute left-3 top-3 size-4 text-ink-soft" />
                  <Input
                    id="cp-address"
                    placeholder="Ward 3, HILMS"
                    className="h-11 rounded-xl border-deept/15 pl-9"
                    {...form.register("address")}
                  />
                </div>
                {form.formState.errors.address && (
                  <p className="mt-1 text-xs text-coral-dark">{form.formState.errors.address.message}</p>
                )}
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={close}
                  disabled={isSubmitting}
                  className="h-11 flex-1 rounded-full border border-deept/15 text-sm font-semibold text-ink-soft transition hover:bg-softteal/30 disabled:opacity-50"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="h-11 flex-1 rounded-full bg-teal-mid font-bold text-white shadow-lg shadow-teal-mid/25 hover:bg-teal-deep"
                >
                  {isSubmitting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Creating...
                    </span>
                  ) : (
                    "Create &amp; email password"
                  )}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
