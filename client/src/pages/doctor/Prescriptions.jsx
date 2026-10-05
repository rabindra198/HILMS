import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download, FileText, Plus, Printer, RefreshCw, Search } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { doctorApi, getDoctorApiError } from "@/services/doctorApi";
import {
  DoctorPageShell,
  DoctorCard,
  DoctorResponsiveList,
  DoctorTrustNote,
  StatusBadge,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  CHIP_BUTTON,
  formatDate,
  formatDateTime,
  humanise,
} from "./doctorUi";

/**
 * Prescriptions and the printable document (FR-DR-03, FR-DR-04).
 *
 * The on-screen document and the PDF come from the same `document` endpoint, so
 * what the doctor checks on screen is byte-for-byte what the patient receives.
 * The PDF link is a plain `<a href>` because the browser navigates to it - it
 * needs the `/api` prefix that the dev proxy strips, and the auth cookie rides
 * along automatically.
 */

// These values are sent to the API as `?status=`, so they must be real
// Prescription statuses (DRAFT | ISSUED | CANCELLED). "ACTIVE" and "COMPLETED"
  // existed here only as labels: both are rejected by the validator, so the two
  // chips silently returned nothing.
  const filters = [
    { value: "", label: "All" },
    { value: "ISSUED", label: "Issued" },
    { value: "DRAFT", label: "Draft" },
    { value: "CANCELLED", label: "Cancelled" },
  ];

function PrescriptionDocumentContent({ doc }) {
  const items = doc?.items || [];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 rounded-2xl border border-deept/12 p-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Patient</p>
          <p className="text-sm font-bold text-ink">{doc?.patient?.name}</p>
          <p className="font-mono text-xs text-ink-soft">{doc?.patient?.reference}</p>
          {doc?.patient?.age != null && <p className="text-xs text-ink-soft">{doc.patient.age} yrs · {humanise(doc.patient.gender)}</p>}
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Prescriber</p>
          <p className="text-sm font-bold text-ink">{doc?.doctor?.name}</p>
          {doc?.doctor?.qualification && <p className="text-xs text-ink-soft">{doc.doctor.qualification}</p>}
          {doc?.doctor?.specialization && <p className="text-xs text-ink-soft">{doc.doctor.specialization}</p>}
          <p className="text-xs text-ink-soft">{doc?.doctor?.department}</p>
        </div>
      </div>

      {/* Diagnosis is stored on the consultation, not the prescription document. */}
      {doc?.consultation?.diagnosis && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Diagnosis</p>
          <p className="text-sm text-ink">{doc.consultation.diagnosis}</p>
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-ink-soft">Medicines</p>
        {items.length ? (
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li key={index} className="flex items-start gap-3 rounded-xl border border-deept/12 px-4 py-3">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-teal-pale text-xs font-extrabold text-teal-deep">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-ink">{item.medicine}</p>
                  <p className="text-sm text-ink-soft">
                    {[item.dosage, item.frequency && humanise(item.frequency), item.route && humanise(item.route), item.duration]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {item.instructions && <p className="text-xs text-ink-soft">{item.instructions}</p>}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-deept/20 px-4 py-8 text-center text-sm text-ink-soft">
            No medicines on this prescription.
          </p>
        )}
      </div>

      {doc?.notes && (
        <div className="rounded-2xl bg-teal-pale/60 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-ink-soft">Advice</p>
          <p className="whitespace-pre-wrap text-sm text-ink">{doc.notes}</p>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-deept/10 pt-4 text-xs text-ink-soft">
        <span>Printed {formatDateTime(new Date())}</span>
        <span className="font-mono">{doc?.prescriptionNo}</span>
      </div>
    </div>
  );
}

function PrescriptionSheet({ document: doc, onClose }) {
  const items = doc?.items || [];

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={`Prescription ${doc?.prescriptionNo || ""}`}
        description={`Issued ${formatDate(doc?.issuedAt)} · ${items.length} medicine(s)`}
        footer={
          <>
            <button type="button" onClick={onClose} className={SECONDARY_BUTTON}>
              Close
            </button>
            <button type="button" onClick={() => window.print()} className={SECONDARY_BUTTON}>
              <Printer className="size-4" /> Print page
            </button>
            <a href={doctorApi.prescriptionPdfUrl(doc.prescriptionId, false)} target="_blank" rel="noreferrer" className={PRIMARY_BUTTON}>
              <FileText className="size-4" /> Open PDF
            </a>
            <a href={doctorApi.prescriptionPdfUrl(doc.prescriptionId, true)} className={SECONDARY_BUTTON}>
              <Download className="size-4" /> Download
            </a>
          </>
        }
      >
        <PrescriptionDocumentContent doc={doc} />
      </Modal>
      <div className="prescription-print" aria-hidden="true">
        <PrescriptionDocumentContent doc={doc} />
      </div>
    </>
  );
}

export default function DoctorPrescriptions() {
  const [params] = useSearchParams();
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [patientFilter, setPatientFilter] = useState(params.get("patient") || "");

  const [sheet, setSheet] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await doctorApi.getPrescriptions({
        limit: 100,
        ...(status ? { status } : {}),
        ...(patientFilter ? { patient: patientFilter } : {}),
        ...(search.trim().length >= 2 ? { search: search.trim() } : {}),
      });
      setRows(result.items);
      setPagination(result.pagination);
    } catch (loadError) {
      setError(getDoctorApiError(loadError));
    } finally {
      setLoading(false);
    }
  }, [status, patientFilter, search]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  // Deep link: ?prescription=<id> opens the printable sheet straight away.
  useEffect(() => {
    const id = params.get("prescription");
    if (!id) return;
    doctorApi
      .getPrescriptionDocument(id)
      .then(setSheet)
      .catch((loadError) => toast.error(getDoctorApiError(loadError)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openSheet = async (id) => {
    try {
      setSheet(await doctorApi.getPrescriptionDocument(id));
    } catch (loadError) {
      toast.error(getDoctorApiError(loadError));
    }
  };

  return (
    <DoctorPageShell
      title="Prescriptions"
      description="Every prescription you have issued, with the printable patient document."
      actions={
        <>
          <button type="button" onClick={load} disabled={loading} className={CHIP_BUTTON}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <Link to="/doctor/consultations" className={CHIP_BUTTON}>
            <Plus className="size-4" /> Prescribe from a visit
          </Link>
        </>
      }
    >
      <DoctorCard
        title="Issued prescriptions"
        description={loading ? "Loading..." : pagination ? `${pagination.total} total` : `${rows.length} shown`}
      >
        <div className="mb-5 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by prescription number or medicine..."
              aria-label="Search prescriptions"
              className="w-full rounded-xl border border-deept/15 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((option) => (
              <button
                key={option.value || "all"}
                type="button"
                onClick={() => setStatus(option.value)}
                className={
                  status === option.value
                    ? "rounded-full bg-teal-deep px-3 py-1.5 text-xs font-bold text-white"
                    : "rounded-full border border-deept/15 bg-white px-3 py-1.5 text-xs font-bold text-teal-deep hover:bg-teal-pale"
                }
              >
                {option.label}
              </button>
            ))}
            {patientFilter && (
              <button type="button" onClick={() => setPatientFilter("")} className="rounded-full bg-teal-mid/15 px-3 py-1.5 text-xs font-bold text-teal-mid">
                This patient ×
              </button>
            )}
          </div>
        </div>

        <DoctorResponsiveList
          rows={rows}
          loading={loading}
          error={error}
          empty={!rows.length}
          emptyMessage="No prescriptions match. Prescribe from a consultation to create one."
          columns={[
            {
              header: "Prescription",
              primary: true,
              render: (item) => (
                <>
                  <p className="font-mono text-xs font-bold text-teal-mid">{item.prescriptionNo}</p>
                  <p className="text-xs text-ink-soft">{formatDate(item.issuedAt || item.createdAt)}</p>
                </>
              ),
            },
            {
              header: "Patient",
              render: (item) => (
                <>
                  <p className="font-semibold text-ink">{item.patient?.name || "Patient"}</p>
                  <p className="text-xs text-ink-soft">{item.patient?.reference}</p>
                </>
              ),
            },
            {
              header: "Medicines",
              render: (item) => (
                <span className="block max-w-[220px] truncate text-ink-soft">
                  {(item.items || []).map((entry) => entry.medicine).filter(Boolean).join(", ") || "-"}
                </span>
              ),
            },
            { header: "Diagnosis", hideOnMobile: true, render: (item) => <span className="text-ink-soft">{item.diagnosis || "-"}</span> },
            { header: "Status", render: (item) => <StatusBadge status={item.status} /> },
          ]}
          actions={(item) => (
            <>
              <button type="button" onClick={() => openSheet(item._id)} className={CHIP_BUTTON}>
                <FileText className="size-3.5" /> View
              </button>
              <a href={doctorApi.prescriptionPdfUrl(item._id, true)} className={CHIP_BUTTON}>
                <Download className="size-3.5" /> PDF
              </a>
            </>
          )}
        />
      </DoctorCard>

      {sheet && <PrescriptionSheet document={sheet} onClose={() => setSheet(null)} />}

      <DoctorTrustNote />
    </DoctorPageShell>
  );
}
