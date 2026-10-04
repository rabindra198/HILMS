import { useCallback, useEffect, useState } from "react";
import { Download, Eye, Printer, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { patientApi, getApiError } from "@/services/patientApi";
import {
  PatientCard,
  PatientPageShell,
  PatientResponsiveList,
  PatientTrustNote,
  StatusBadge,
  LABEL_CLASS,
  PRIMARY_BUTTON,
  SECONDARY_BUTTON,
  formatDate,
  humanise,
} from "./patientUi";

/**
 * Prescriptions (FR-PT-06).
 *
 * The PDF link points at `/patient/prescriptions/:id/document.pdf`, which runs the
 * SAME builder and renderer the doctor endpoint uses, so the patient downloads the
 * identical document rather than a second, patient-only rendering of it.
 *
 * The link is an `<a href>` rather than an axios call because the response is
 * binary; authentication is the httpOnly cookie the browser sends on its own.
 */
export default function PatientPrescriptions() {
  const [prescriptions, setPrescriptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [document_, setDocument] = useState(null);
  const [documentLoading, setDocumentLoading] = useState(false);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    try {
      setPrescriptions(await patientApi.getPrescriptions());
      setError("");
    } catch (requestError) {
      setError(getApiError(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const viewPrescription = async (id) => {
    setDocumentLoading(true);
    setDocument({ loading: true });
    try {
      setDocument(await patientApi.getPrescriptionDocument(id));
    } catch (requestError) {
      toast.error(getApiError(requestError));
      setDocument(null);
    } finally {
      setDocumentLoading(false);
    }
  };

  const columns = [
    {
      header: "Prescription",
      primary: true,
      render: (row) => (
        <span className="font-semibold text-teal-deep">
          {row.prescriptionNo}
          <span className="block text-xs font-normal text-ink-soft">
            {row.medicineCount} medicine{row.medicineCount === 1 ? "" : "s"}
          </span>
        </span>
      ),
    },
    {
      header: "Doctor",
      render: (row) => row.doctor?.name || "-",
    },
    {
      header: "Issued",
      render: (row) => formatDate(row.issuedAt),
    },
    {
      header: "Review by",
      render: (row) => formatDate(row.followUpDate),
    },
    {
      header: "Status",
      render: (row) => <StatusBadge status={humanise(row.status)} />,
    },
  ];

  return (
    <PatientPageShell
      title="My prescriptions"
      description="Medicines your doctor has prescribed, and the printable document for each."
      actions={
        <button type="button" onClick={() => load({ quiet: true })} disabled={refreshing} className={SECONDARY_BUTTON}>
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <PatientCard title="Prescriptions" description="Newest first.">
        <PatientResponsiveList
          columns={columns}
          rows={prescriptions}
          rowKey={(row) => row.id}
          loading={loading}
          error={error}
          empty={!loading && !error && prescriptions.length === 0}
          emptyMessage="No prescriptions yet. They appear here as soon as a doctor issues one."
          actions={(row) => (
            <>
              <button
                type="button"
                onClick={() => viewPrescription(row.id)}
                className={SECONDARY_BUTTON.replace("px-4 py-2.5", "px-3 py-2")}
              >
                <Eye className="size-4" />
                View
              </button>
              <a
                href={patientApi.prescriptionPdfUrl(row.id, true)}
                target="_blank"
                rel="noreferrer"
                className={SECONDARY_BUTTON.replace("px-4 py-2.5", "px-3 py-2")}
              >
                <Download className="size-4" />
                PDF
              </a>
            </>
          )}
        />
        <div className="mt-4">
          <PatientTrustNote />
        </div>
      </PatientCard>

      <Modal
        open={Boolean(document_)}
        onClose={() => setDocument(null)}
        title={document_?.prescriptionNo ? `Prescription ${document_.prescriptionNo}` : "Prescription"}
        description={document_?.issuedAt ? `Issued ${formatDate(document_.issuedAt)}` : ""}
        size="lg"
        footer={
          <>
            <button type="button" onClick={() => setDocument(null)} className={SECONDARY_BUTTON}>
              Close
            </button>
            <button type="button" onClick={() => window.print()} className={SECONDARY_BUTTON}>
              <Printer className="size-4" />
              Print
            </button>
            {document_?.prescriptionId && (
              <a href={patientApi.prescriptionPdfUrl(document_.prescriptionId, true)} className={PRIMARY_BUTTON}>
                <Download className="size-4" />
                Download PDF
              </a>
            )}
          </>
        }
      >
        {documentLoading || document_?.loading ? (
          <p className="text-sm text-ink-soft">Loading prescription...</p>
        ) : document_ ? (
          <div className="space-y-5">
            <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className={LABEL_CLASS}>Patient</dt>
                <dd className="font-semibold text-teal-deep">{document_.patient?.name}</dd>
                {document_.patient?.age != null && (
                  <dd className="text-xs text-ink-soft">
                    {document_.patient.age} yrs
                    {document_.patient.gender ? `, ${humanise(document_.patient.gender)}` : ""}
                    {document_.patient.bloodGroup ? `, ${document_.patient.bloodGroup}` : ""}
                  </dd>
                )}
              </div>
              <div>
                <dt className={LABEL_CLASS}>Doctor</dt>
                <dd className="font-semibold text-teal-deep">{document_.doctor?.name || "-"}</dd>
                {document_.doctor?.nmcNumber && <dd className="text-xs text-ink-soft">NMC {document_.doctor.nmcNumber}</dd>}
              </div>
              <div>
                <dt className={LABEL_CLASS}>Diagnosis</dt>
                <dd className="font-semibold text-teal-deep">{document_.consultation?.diagnosis || "-"}</dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-2 font-heading text-base font-bold text-teal-deep">Medicines</h3>
              <div className="overflow-hidden rounded-xl border border-deept/10">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-deept/10 bg-softteal/50">
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Medicine</th>
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">Dose</th>
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">How often</th>
                      <th className="px-3 py-2 text-xs font-bold uppercase tracking-wider text-ink-soft">For</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-deept/5">
                    {(document_.items || []).map((item, index) => (
                      <tr key={index}>
                        <td className="px-3 py-2 font-semibold">{item.medicine}</td>
                        <td className="px-3 py-2">{item.dosage}</td>
                        <td className="px-3 py-2">{humanise(item.frequency)}</td>
                        <td className="px-3 py-2">{item.duration}</td>
                      </tr>
                    ))}
                    {(document_.items || []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-sm text-ink-soft">
                          No medicines recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {(document_.items || []).some((item) => item.instructions) && (
                <ul className="mt-3 space-y-1">
                  {document_.items
                    .filter((item) => item.instructions)
                    .map((item, index) => (
                      <li key={index} className="text-sm text-ink-soft">
                        <span className="font-semibold text-teal-deep">{item.medicine}:</span> {item.instructions}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {document_.notes && (
              <div>
                <h3 className="mb-1 font-heading text-base font-bold text-teal-deep">Doctor&rsquo;s notes</h3>
                <p className="text-sm text-ink-soft">{document_.notes}</p>
              </div>
            )}
          </div>
        ) : null}
      </Modal>
    </PatientPageShell>
  );
}