import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Eye,
  FlaskConical,
  Pencil,
  Receipt,
  RefreshCw,
  Search,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { StatusBadge } from "@/components/common/StatusBadge";
import CreatePatientDialog from "@/pages/admin/CreatePatientDialog";
import { getPatients, getPatient, updatePatient } from "@/services/adminApi";
import { getErrorMessage } from "@/lib/axios";
import { formatDate } from "@/lib/formatDate";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useSocketEvent } from "@/context/useSocket";
import { SOCKET_EVENTS } from "@/lib/socketEvents";

/**
 * Patient administration (FR-AD-04).
 *
 * This uses the dedicated `/admin/patients` endpoints rather than the generic
 * user list. That matters: `listPatients` filters, paginates and decorates each
 * row with clinical counters in one grouped aggregation, so the table below is
 * server-paginated instead of downloading every patient and filtering in the
 * browser - which is what this screen used to do and why it stalled as the
 * registry grew.
 *
 * Account status and role are intentionally NOT editable here. The backend
 * refuses them on this route so that editing a patient's address cannot also
 * escalate or deactivate the account; lifecycle changes go through the access
 * and user-management endpoints.
 */

const STATUS_FILTERS = [
  { value: "", label: "All statuses" },
  { value: "APPROVED", label: "Approved" },
  { value: "PENDING", label: "Pending" },
  { value: "REJECTED", label: "Rejected" },
];

const PAGE_SIZE = 20;

const GENDERS = [
  { value: "", label: "Not specified" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
];

const BLOOD_GROUPS = ["", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];

const GENDER_LABELS = { male: "Male", female: "Female", other: "Other" };

const EMPTY_FORM = {
  name: "",
  email: "",
  phone: "",
  contactNumber: "",
  address: "",
  dateOfBirth: "",
  gender: "",
  bloodGroup: "",
  allergies: "",
  emergencyContactName: "",
  emergencyContactNumber: "",
};

const toForm = (patient) => ({
  name: patient?.name ?? "",
  email: patient?.email ?? "",
  phone: patient?.phone ?? "",
  contactNumber: patient?.contactNumber ?? "",
  address: patient?.address ?? "",
  dateOfBirth: patient?.dateOfBirth ? String(patient.dateOfBirth).slice(0, 10) : "",
  gender: patient?.gender ?? "",
  bloodGroup: patient?.bloodGroup ?? "",
  allergies: patient?.allergies ?? "",
  emergencyContactName: patient?.emergencyContactName ?? "",
  emergencyContactNumber: patient?.emergencyContactNumber ?? "",
});

const Stat = ({ icon: Icon, label, value }) => (
  <div className="rounded-xl border border-deept/10 bg-white px-4 py-3">
    <p className="flex items-center gap-1.5 text-xs font-medium text-ink-soft">
      <Icon className="size-3.5" />
      {label}
    </p>
    <p className="mt-1 font-heading text-lg font-bold text-teal-deep">{value}</p>
  </div>
);

export default function PatientsPage() {
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const [patients, setPatients] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Debounce the search box so typing does not fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadPatients = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getPatients({ search: search || undefined, status: status || undefined, page, limit: PAGE_SIZE });
      setPatients(result.items || []);
      setPagination(result.pagination || { page: 1, totalPages: 1, total: 0, limit: PAGE_SIZE });
    } catch (loadError) {
      const message = getErrorMessage(loadError, "Unable to load patients.");
      setError(message);
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, [search, status, page]);

  useSocketEvent(SOCKET_EVENTS.PATIENT_REGISTERED, loadPatients);
  useSocketEvent("connect", loadPatients);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

  // The dashboard links here with ?new=1 to open the registration dialog directly.
  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setCreateOpen(true);
      searchParams.delete("new");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // A delete or status change on the last row of the last page would otherwise
  // leave the table showing an empty page.
  useEffect(() => {
    if (!loading && patients.length === 0 && pagination.total > 0 && page > 1) setPage(page - 1);
  }, [loading, patients.length, pagination.total, page]);

  const openDetail = async (patient) => {
    setDetailLoading(true);
    setEditing(false);
    try {
      setDetail(await getPatient(patient._id));
    } catch (loadError) {
      toast.error(getErrorMessage(loadError, "Unable to load this patient."));
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setDetail(null);
    setEditing(false);
    setForm(EMPTY_FORM);
  };

  const startEditing = () => {
    setForm(toForm(detail));
    setEditing(true);
  };

  const saveEdits = async (event) => {
    event.preventDefault();
    if (!detail) return;
    setSaving(true);
    try {
      const updated = await updatePatient(detail._id, {
        ...form,
        dateOfBirth: form.dateOfBirth || undefined,
        gender: form.gender || undefined,
        bloodGroup: form.bloodGroup || undefined,
        address: form.address || undefined,
        allergies: form.allergies || undefined,
        phone: form.phone || undefined,
        contactNumber: form.contactNumber || undefined,
        emergencyContactName: form.emergencyContactName || undefined,
        emergencyContactNumber: form.emergencyContactNumber || undefined,
      });
      setDetail(updated);
      setEditing(false);
      toast.success("Patient details updated.");
      await loadPatients();
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, "Unable to update this patient."));
    } finally {
      setSaving(false);
    }
  };

  const stats = useMemo(
    () => ({
      active: patients.filter((patient) => patient.isActive).length,
      pending: patients.filter((patient) => patient.status === "PENDING").length,
      owing: patients.filter((patient) => Number(patient.stats?.outstandingBalance) > 0).length,
    }),
    [patients]
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold leading-tight text-teal-deep">Patients</h1>
          <p className="text-base font-medium text-ink-soft">
            Registered patients, clinical activity and outstanding balances.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex self-start items-center gap-2 rounded-full bg-teal-mid px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-mid/30 transition hover:-translate-y-0.5 hover:bg-teal-deep"
        >
          <Users className="size-4" />
          Register Patient
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-deept/5 bg-teal-pale p-5">
          <p className="text-sm font-medium text-ink-soft">Total registered</p>
          <p className="font-heading text-2xl font-bold text-teal-deep">{pagination.total}</p>
        </div>
        <div className="rounded-2xl border border-deept/5 bg-lavender-pale p-5">
          <p className="text-sm font-medium text-ink-soft">Active on this page</p>
          <p className="font-heading text-2xl font-bold text-teal-deep">{stats.active}</p>
        </div>
        <div className="rounded-2xl border border-deept/5 bg-teal-pale p-5">
          <p className="text-sm font-medium text-ink-soft">Pending approval</p>
          <p className="font-heading text-2xl font-bold text-teal-deep">{stats.pending}</p>
        </div>
        <div className="rounded-2xl border border-deept/5 bg-softteal p-5">
          <p className="text-sm font-medium text-ink-soft">With a balance</p>
          <p className="font-heading text-2xl font-bold text-teal-deep">{stats.owing}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
          <input
            type="text"
            placeholder="Search by name, email or phone..."
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm text-ink outline-none transition focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
          />
        </div>
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
        >
          {STATUS_FILTERS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={loadPatients}
          disabled={loading}
          aria-label="Refresh patients"
          title="Refresh patients"
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-deept/15 bg-white px-3 text-sm font-semibold text-teal-deep transition hover:border-teal-pale disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <section className="overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
        {loading ? (
          <div className="p-5">
            <LoadingSkeleton rows={8} columns={6} />
          </div>
        ) : error ? (
          <div className="p-5">
            <ErrorState title="Could not load patients" description={error} onRetry={loadPatients} />
          </div>
        ) : patients.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-ink-soft">
            {search || status ? "No patients match these filters." : "No patients have been registered yet."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b-2 border-deept/10 bg-softteal/50">
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Reference</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Contact</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Age / Sex</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Activity</th>
                  <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wider text-ink-soft">Balance</th>
                  <th className="px-5 py-4 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                  <th className="px-5 py-4 text-right text-xs font-bold uppercase tracking-wider text-ink-soft">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-deept/5">
                {patients.map((patient) => (
                  <tr key={patient._id} className="transition-colors hover:bg-teal-pale/30">
                    <td className="px-5 py-4 font-mono text-xs font-semibold text-teal-mid">{patient.reference}</td>
                    <td className="px-5 py-4">
                      <p className="font-semibold text-ink">{patient.name}</p>
                      <p className="text-xs text-ink-soft">{patient.email}</p>
                    </td>
                    <td className="px-5 py-4 text-ink-soft">{patient.contactNumber || "Not provided"}</td>
                    <td className="px-5 py-4 text-ink-soft">
                      {patient.age !== null && patient.age !== undefined ? patient.age : "—"}
                      {patient.gender ? ` · ${GENDER_LABELS[patient.gender] ?? patient.gender}` : ""}
                    </td>
                    <td className="px-5 py-4 text-xs text-ink-soft">
                      {patient.stats?.appointments ?? 0} appointments
                      <br />
                      {patient.stats?.labRequests ?? 0} lab · {patient.stats?.invoices ?? 0} invoices
                    </td>
                    <td className="px-5 py-4 text-right font-semibold">
                      {Number(patient.stats?.outstandingBalance) > 0 ? (
                        <span className="text-coral-dark">Rs. {formatMoney(patient.stats.outstandingBalance)}</span>
                      ) : (
                        <span className="text-ink-soft">Settled</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <StatusBadge status={patient.isActive ? "Active" : patient.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => openDetail(patient)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-teal-mid transition hover:bg-teal-pale"
                      >
                        <Eye className="size-4" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {pagination.totalPages > 1 && (
          <div className="flex flex-col gap-3 border-t border-deept/10 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-ink-soft">
              Showing {(pagination.page - 1) * pagination.limit + 1}-
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} patients
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={pagination.page <= 1 || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-deept/15 px-3 py-1.5 text-xs font-semibold text-teal-deep transition hover:border-teal-pale disabled:opacity-40"
              >
                <ChevronLeft className="size-4" />
                Previous
              </button>
              <span className="text-xs font-semibold text-ink-soft">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((current) => Math.min(pagination.totalPages, current + 1))}
                disabled={pagination.page >= pagination.totalPages || loading}
                className="inline-flex items-center gap-1 rounded-lg border border-deept/15 px-3 py-1.5 text-xs font-semibold text-teal-deep transition hover:border-teal-pale disabled:opacity-40"
              >
                Next
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </section>

      {detailLoading && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-deept/40 p-4">
          <p className="rounded-2xl bg-white px-6 py-4 text-sm font-semibold text-ink">Loading patient...</p>
        </div>
      )}

      {detail && !detailLoading && (
        <div
          className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-deept/40 p-4 sm:p-8"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeDetail();
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="patient-detail-title"
            className="my-4 w-full max-w-3xl rounded-2xl bg-white shadow-2xl"
          >
            <header className="flex items-start justify-between gap-4 border-b border-deept/10 px-6 py-5">
              <div>
                <p className="font-mono text-xs font-semibold text-teal-mid">{detail.reference}</p>
                <h2 id="patient-detail-title" className="font-heading text-xl font-bold text-teal-deep">
                  {detail.name}
                </h2>
                <p className="mt-0.5 text-sm text-ink-soft">
                  {detail.email}
                  {detail.contactNumber ? ` · ${detail.contactNumber}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={detail.isActive ? "Active" : detail.status} />
                <button type="button" onClick={closeDetail} aria-label="Close" className="rounded-lg p-1.5 text-ink-soft transition hover:bg-teal-pale">
                  <X className="size-5" />
                </button>
              </div>
            </header>

            <div className="flex flex-col gap-6 px-6 py-5">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat icon={ClipboardList} label="Appointments" value={detail.stats?.appointments ?? 0} />
                <Stat icon={Stethoscope} label="Consultations" value={detail.stats?.consultations ?? 0} />
                <Stat icon={FlaskConical} label="Lab requests" value={detail.stats?.labRequests ?? 0} />
                <Stat icon={Receipt} label="Balance" value={`Rs. ${formatMoney(detail.billing?.outstanding ?? 0)}`} />
              </div>

              <section>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-heading text-base font-bold text-teal-deep">Details</h3>
                  {!editing && (
                    <button
                      type="button"
                      onClick={startEditing}
                      className="inline-flex items-center gap-1.5 rounded-full border border-teal/30 px-3 py-1.5 text-xs font-bold text-teal-mid transition hover:bg-teal-pale"
                    >
                      <Pencil className="size-3.5" />
                      Edit demographics
                    </button>
                  )}
                </div>

                {editing ? (
                  <form onSubmit={saveEdits} className="flex flex-col gap-4">
                    <p className="rounded-xl bg-teal-pale/60 px-3 py-2 text-xs text-ink-soft">
                      Account status and role cannot be changed here - use Access requests and User management.
                    </p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-soft">
                        Full name
                        <input
                          required
                          value={form.name}
                          onChange={(event) => setForm({ ...form, name: event.target.value })}
                          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-teal-mid"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-soft">
                        Email
                        <input
                          type="email"
                          value={form.email}
                          onChange={(event) => setForm({ ...form, email: event.target.value })}
                          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-teal-mid"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-soft">
                        Phone
                        <input
                          value={form.phone}
                          onChange={(event) => setForm({ ...form, phone: event.target.value })}
                          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-teal-mid"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-soft">
                        Contact number
                        <input
                          value={form.contactNumber}
                          onChange={(event) => setForm({ ...form, contactNumber: event.target.value })}
                          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-teal-mid"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-soft">
                        Date of birth
                        <input
                          type="date"
                          value={form.dateOfBirth}
                          max={new Date().toISOString().slice(0, 10)}
                          onChange={(event) => setForm({ ...form, dateOfBirth: event.target.value })}
                          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-teal-mid"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-soft">
                        Gender
                        <select
                          value={form.gender}
                          onChange={(event) => setForm({ ...form, gender: event.target.value })}
                          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-teal-mid"
                        >
                          {GENDERS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-soft">
                        Blood group
                        <select
                          value={form.bloodGroup}
                          onChange={(event) => setForm({ ...form, bloodGroup: event.target.value })}
                          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-teal-mid"
                        >
                          {BLOOD_GROUPS.map((group) => (
                            <option key={group} value={group}>
                              {group || "Unknown"}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-soft">
                        Emergency contact
                        <input
                          value={form.emergencyContactName}
                          onChange={(event) => setForm({ ...form, emergencyContactName: event.target.value })}
                          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-teal-mid"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-soft sm:col-span-2">
                        Emergency contact number
                        <input
                          value={form.emergencyContactNumber}
                          onChange={(event) => setForm({ ...form, emergencyContactNumber: event.target.value })}
                          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-teal-mid"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-soft sm:col-span-2">
                        Address
                        <input
                          value={form.address}
                          onChange={(event) => setForm({ ...form, address: event.target.value })}
                          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-teal-mid"
                        />
                      </label>
                      <label className="flex flex-col gap-1.5 text-xs font-bold text-ink-soft sm:col-span-2">
                        Allergies
                        <input
                          value={form.allergies}
                          onChange={(event) => setForm({ ...form, allergies: event.target.value })}
                          className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm font-normal text-ink outline-none focus:border-teal-mid"
                        />
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={saving}
                        className="h-11 flex-1 rounded-full bg-teal-deep text-sm font-semibold text-white transition hover:bg-teal-mid disabled:opacity-60"
                      >
                        {saving ? "Saving..." : "Save changes"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="h-11 rounded-full border border-deept/15 px-5 text-sm font-semibold text-ink-soft transition hover:border-teal-pale"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : (
                  <dl className="grid gap-4 sm:grid-cols-3">
                    {[
                      ["Date of birth", detail.formattedDateOfBirth || "Not recorded"],
                      ["Age", detail.age ?? "—"],
                      ["Gender", GENDER_LABELS[detail.gender] ?? "Not recorded"],
                      ["Blood group", detail.bloodGroup || "Unknown"],
                      ["Address", detail.address || "Not provided"],
                      ["Emergency contact", detail.emergencyContactName || "Not recorded"],
                      ["Emergency number", detail.emergencyContactNumber || "Not recorded"],
                      ["Allergies", detail.allergies || "None recorded"],
                      ["Registered", detail.createdAt ? formatDate(detail.createdAt, "DD MMM YYYY") : "Unknown"],
                    ].map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-xs font-bold uppercase text-ink-soft">{label}</dt>
                        <dd className="mt-1 break-words text-sm text-ink">{value}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </section>

              {Array.isArray(detail.assignedDoctors) && detail.assignedDoctors.length > 0 && (
                <section>
                  <h3 className="mb-2 font-heading text-base font-bold text-teal-deep">Care team</h3>
                  <ul className="flex flex-wrap gap-2">
                    {detail.assignedDoctors.map((assignment) => (
                      <li key={assignment._id} className="rounded-xl border border-deept/10 bg-teal-pale/60 px-3 py-2 text-sm">
                        <span className="font-semibold text-ink">{assignment.doctor?.name}</span>
                        {assignment.doctor?.department && (
                          <span className="ml-2 text-xs text-ink-soft">{assignment.doctor.department}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section>
                <h3 className="mb-2 font-heading text-base font-bold text-teal-deep">Recent activity</h3>
                {detail.history?.events?.length ? (
                  <ul className="divide-y divide-deept/5 rounded-xl border border-deept/10">
                    {detail.history.events.map((event, index) => (
                      <li key={`${event.type}-${index}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                        <span className="w-28 shrink-0 text-xs text-ink-soft">
                          {event.at ? formatDate(event.at, "DD MMM YYYY") : "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-medium text-ink">{event.title}</span>
                        {event.actor && <span className="truncate text-xs text-ink-soft">{event.actor}</span>}
                        <StatusBadge status={event.status || event.type} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="rounded-xl border border-dashed border-deept/20 px-4 py-6 text-center text-sm text-ink-soft">
                    No recorded activity for this patient yet.
                  </p>
                )}
              </section>

              {Array.isArray(detail.invoices) && detail.invoices.length > 0 && (
                <section>
                  <h3 className="mb-2 font-heading text-base font-bold text-teal-deep">Recent invoices</h3>
                  <ul className="divide-y divide-deept/5 rounded-xl border border-deept/10">
                    {detail.invoices.map((invoice) => (
                      <li key={invoice._id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-sm">
                        <span className="font-mono text-xs font-semibold text-teal-mid">{invoice.invoiceNo}</span>
                        <span className="min-w-0 flex-1 text-ink-soft">
                          {invoice.issuedAt ? formatDateTime(invoice.issuedAt) : "—"}
                        </span>
                        <StatusBadge status={invoice.status} />
                        <span className="font-semibold text-ink">Rs. {formatMoney(invoice.total)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          </section>
        </div>
      )}

      <CreatePatientDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={loadPatients} />
    </div>
  );
}