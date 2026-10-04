import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, QrCode, RefreshCw, ScanLine, Search } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { laboratoryApi, getApiError } from "@/services/laboratoryApi";
import { LabCard, LabPageShell, LabResponsiveList, LabTrustNote } from "./LabPageShell";

const SAMPLE_STATUSES = ["COLLECTED", "RECEIVED", "REJECTED"];

const formatDate = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

const formatTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return parsed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

/** `datetime-local` needs `YYYY-MM-DDTHH:mm` in local time, not an ISO string. */
const toLocalInputValue = (date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

/** `YYYY-MM-DD` in the technician's own timezone, never a UTC-shifted day. */
const toLocalDayValue = (date) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

/** Default collection time is the current clock time as `HH:mm`. */
const nowClockValue = () => toLocalInputValue(new Date()).slice(11, 16);

const fieldClass = "h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20";
const labelClass = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft";

export default function SamplesPage() {
  const [samples, setSamples] = useState([]);
  const [acceptedRequests, setAcceptedRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({
    labRequest: "",
    sampleType: "",
    collectionDate: toLocalDayValue(new Date()),
    collectionTime: nowClockValue(),
    notes: "",
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const [label, setLabel] = useState(null);
  const [labelLoadingId, setLabelLoadingId] = useState(null);
  const [scanCode, setScanCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [sampleData, requestData] = await Promise.all([
        laboratoryApi.getSamples({ limit: 0 }),
        laboratoryApi.getRequests({ status: "ACCEPTED", limit: 0 }),
      ]);
      setSamples(sampleData);
      setAcceptedRequests(requestData);
    } catch (loadError) {
      const message = getApiError(loadError);
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Deep link from the requests screen: preselect the accepted request and infer
  // the sample type the ordered test requires.
  useEffect(() => {
    const requestId = searchParams.get("request");
    if (!requestId || !acceptedRequests.length) return;
    const match = acceptedRequests.find((item) => item._id === requestId);
    if (!match) return;
    setForm((current) => ({
      ...current,
      labRequest: requestId,
      sampleType: match.test?.sampleType || current.sampleType,
    }));
  }, [acceptedRequests, searchParams]);

  const selectedRequest = useMemo(
    () => acceptedRequests.find((item) => item._id === form.labRequest) || null,
    [acceptedRequests, form.labRequest]
  );

  // The list is the full set already loaded, so filtering here keeps typing
  // instant instead of round-tripping on every keystroke.
  const visibleSamples = useMemo(() => {
    const query = search.trim().toLowerCase();
    return samples.filter((sample) => {
      if (statusFilter && String(sample.status).toUpperCase() !== statusFilter) return false;
      if (!query) return true;
      return [sample.sampleId, sample.barcode, sample.patient?.name, sample.patient?.email, sample.test?.name, sample.test?.testName]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [samples, search, statusFilter]);

  const collect = async (event) => {
    event.preventDefault();
    if (!form.labRequest) {
      toast.error("Select an accepted request");
      return;
    }
    setSubmitting(true);
    try {
      // SRS FR-LB-03 records the collection DAY and the TIME OF DAY as two
      // separate facts. Sending one timestamp for both would force a specimen
      // collected at 09:30 to be filed as collected at midnight.
      const sample = await laboratoryApi.createSample({
        labRequest: form.labRequest,
        sampleType: form.sampleType || selectedRequest?.test?.sampleType,
        collectionDate: form.collectionDate,
        collectionTime: form.collectionTime || undefined,
        notes: form.notes || undefined,
      });
      toast.success(`Sample ${sample.sampleId} collected`);
      setForm({
        labRequest: "",
        sampleType: "",
        collectionDate: toLocalDayValue(new Date()),
        collectionTime: nowClockValue(),
        notes: "",
      });
      setSearchParams({});
      await load();
    } catch (submitError) {
      toast.error(getApiError(submitError));
    } finally {
      setSubmitting(false);
    }
  };

  const updateStatus = async (sample, nextStatus) => {
    setBusyId(sample._id);
    try {
      await laboratoryApi.updateSample(sample._id, { status: nextStatus });
      toast.success(`Sample marked ${nextStatus.toLowerCase()}`);
      await load();
    } catch (statusError) {
      toast.error(getApiError(statusError));
    } finally {
      setBusyId(null);
    }
  };

  const openLabel = async (sample, format = "barcode") => {
    setLabelLoadingId(sample._id);
    try {
      // The SVG (and the non-PHI payload it encodes) is produced by the server so
      // the printed code always matches the sample record.
      const data = await laboratoryApi.getSampleLabel(sample._id, format);
      setLabel({ ...data, _id: sample._id });
    } catch (labelError) {
      toast.error(getApiError(labelError));
    } finally {
      setLabelLoadingId(null);
    }
  };

  const lookupSample = async (event) => {
    event.preventDefault();
    const code = scanCode.trim();
    if (!code) {
      toast.error("Enter or scan a specimen code");
      return;
    }
    setScanning(true);
    try {
      const sample = await laboratoryApi.lookupSample(code);
      setScanResult(sample);
      toast.success(`Identified sample ${sample.sampleId}`);
    } catch (lookupError) {
      setScanResult(null);
      toast.error(getApiError(lookupError));
    } finally {
      setScanning(false);
    }
  };

  return (
    <LabPageShell
      title="Sample collection"
      description="Record collected specimens and track them through to the processing bench."
      actions={
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-deept/15 bg-white px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale disabled:opacity-50"
        >
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      }
    >
      <LabCard title="Collect a sample" description="The sample ID and barcode are generated by the server so they cannot be chosen by the caller.">
        <form onSubmit={collect} className="grid gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <label htmlFor="sample-request" className={labelClass}>Accepted request</label>
            <select
              id="sample-request"
              required
              value={form.labRequest}
              onChange={(event) => {
                const next = acceptedRequests.find((item) => item._id === event.target.value);
                setForm((current) => ({ ...current, labRequest: event.target.value, sampleType: next?.test?.sampleType || current.sampleType }));
              }}
              className={fieldClass}
            >
              <option value="">Select an accepted request</option>
              {acceptedRequests.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.patient?.name || "Patient"} &middot; {item.test?.name || item.test?.testName || "Laboratory test"}
                </option>
              ))}
            </select>
            {!loading && !acceptedRequests.length && (
              <p className="mt-2 text-xs text-ink-soft">No requests are awaiting a sample. Accept a pending request first.</p>
            )}
          </div>

          <div>
            <label htmlFor="sample-type" className={labelClass}>Sample type</label>
            <input
              id="sample-type"
              list="sample-type-options"
              value={form.sampleType}
              onChange={(event) => setForm((current) => ({ ...current, sampleType: event.target.value }))}
              placeholder={selectedRequest?.test?.sampleType || "blood"}
              className={fieldClass}
            />
            <datalist id="sample-type-options">
              {["blood", "urine", "stool", "sputum", "swab", "tissue", "other"].map((option) => <option key={option} value={option} />)}
            </datalist>
            {selectedRequest?.test?.sampleType && (
              <p className="mt-1.5 text-xs text-ink-soft">This test is configured for {selectedRequest.test.sampleType}.</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="collection-date" className={labelClass}>Collection date</label>
              <input
                id="collection-date"
                type="date"
                required
                max={toLocalDayValue(new Date())}
                value={form.collectionDate}
                onChange={(event) => setForm((current) => ({ ...current, collectionDate: event.target.value }))}
                className={fieldClass}
              />
            </div>
            <div>
              <label htmlFor="collection-time" className={labelClass}>Collection time</label>
              <input
                id="collection-time"
                type="time"
                value={form.collectionTime}
                onChange={(event) => setForm((current) => ({ ...current, collectionTime: event.target.value }))}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="lg:col-span-2">
            <label htmlFor="sample-notes" className={labelClass}>Notes (optional)</label>
            <textarea
              id="sample-notes"
              rows={2}
              value={form.notes}
              onChange={(event) => setForm((current) => ({ ...current, notes: event.target.value }))}
              placeholder="Collection conditions, fasting status, container used..."
              className={`${fieldClass} h-auto py-2.5`}
            />
          </div>

          <div className="lg:col-span-2">
            <button
              type="submit"
              disabled={submitting || !acceptedRequests.length}
              className="rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
            >
              {submitting ? "Recording sample..." : "Record sample"}
            </button>
          </div>
        </form>
      </LabCard>

      <LabCard
        title="Specimen receipt"
        description="Scan or type a specimen code to identify the sample at the bench."
      >
        <form onSubmit={lookupSample} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <ScanLine className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              value={scanCode}
              onChange={(event) => setScanCode(event.target.value)}
              placeholder="Scan barcode / QR or type the code or sample ID"
              aria-label="Specimen code"
              className={`${fieldClass} pl-9 font-mono`}
            />
          </div>
          <button
            type="submit"
            disabled={scanning}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
          >
            <ScanLine className={`size-4 ${scanning ? "animate-pulse" : ""}`} />
            {scanning ? "Identifying..." : "Identify"}
          </button>
        </form>
        {scanResult && (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 rounded-2xl border border-teal-mid/30 bg-teal-pale/60 p-4 text-sm">
            <span className="font-mono text-sm font-bold text-teal-mid">{scanResult.sampleId}</span>
            <span className="text-ink-soft">Patient <span className="font-semibold text-ink">{scanResult.patient?.name || "—"}</span></span>
            <span className="text-ink-soft">Test <span className="font-semibold text-ink">{scanResult.test?.name || scanResult.test?.testName || "—"}</span></span>
            <StatusBadge status={scanResult.status} />
          </div>
        )}
      </LabCard>

      <LabCard
        title="Collected samples"
        description={loading ? "Loading samples..." : `${visibleSamples.length} of ${samples.length} samples shown.`}
      >
        <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search sample ID, barcode, patient or test..."
              aria-label="Search samples"
              className={`${fieldClass} pl-9`}
            />
          </div>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filter by sample status" className={fieldClass}>
            <option value="">All statuses</option>
            {SAMPLE_STATUSES.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        <LabResponsiveList
          rows={visibleSamples}
          loading={loading}
          error={error}
          empty={!visibleSamples.length}
          emptyMessage={samples.length ? "No samples match this search." : "No samples have been collected yet."}
          columns={[
            { header: "Sample", primary: true, render: (sample) => <span className="font-mono text-xs font-bold text-teal-mid">{sample.sampleId}</span> },
            { header: "Barcode", render: (sample) => <span className="font-mono text-xs text-ink-soft">{sample.barcode || "-"}</span> },
            { header: "Patient", render: (sample) => <span className="font-medium text-ink">{sample.patient?.name || "Patient"}</span> },
            { header: "Test", render: (sample) => <span className="text-ink-soft">{sample.test?.name || sample.test?.testName || "-"}</span> },
            { header: "Type", render: (sample) => <span className="text-ink-soft">{sample.sampleType || "-"}</span> },
            { header: "Collected", render: (sample) => <span className="text-ink-soft">{formatDate(sample.collectionDate)}</span> },
            { header: "Time", render: (sample) => <span className="text-ink-soft">{formatTime(sample.collectionTime)}</span> },
            { header: "Status", render: (sample) => <StatusBadge status={sample.status} /> },
          ]}
          actions={(sample) => {
            const currentStatus = String(sample.status || "").toUpperCase();
            return (
              <>
                <button
                  type="button"
                  disabled={labelLoadingId === sample._id}
                  onClick={() => openLabel(sample)}
                  className="inline-flex items-center gap-1 rounded-lg border border-deept/15 px-3 py-2 text-xs font-bold text-teal-deep transition hover:bg-teal-pale disabled:opacity-50"
                >
                  <Printer className="size-3.5" /> {labelLoadingId === sample._id ? "Loading" : "Label"}
                </button>
                {currentStatus !== "RECEIVED" && currentStatus !== "REJECTED" && (
                  <button
                    type="button"
                    disabled={busyId === sample._id}
                    onClick={() => updateStatus(sample, "RECEIVED")}
                    className="rounded-lg border border-deept/15 px-3 py-2 text-xs font-bold text-teal-deep transition hover:bg-teal-pale disabled:opacity-50"
                  >
                    Mark received
                  </button>
                )}
                {currentStatus !== "REJECTED" && (
                  <button
                    type="button"
                    disabled={busyId === sample._id}
                    onClick={() => updateStatus(sample, "REJECTED")}
                    className="rounded-lg border border-coral/40 px-3 py-2 text-xs font-bold text-coral-dark transition hover:bg-coral-pale disabled:opacity-50"
                  >
                    Reject
                  </button>
                )}
                {currentStatus === "REJECTED" && <span className="self-center text-xs text-ink-soft">Not analysable</span>}
              </>
            );
          }}
        />
      </LabCard>

      <Modal
        open={Boolean(label)}
        onClose={() => setLabel(null)}
        title={label ? `Specimen label ${label.sampleId}` : "Specimen label"}
        description="The code is generated by the server and identifies the sample at receipt."
        size="md"
        footer={
          <>
            <button
              type="button"
              onClick={() => openLabel({ _id: label?._id }, label?.format === "qr" ? "barcode" : "qr")}
              className="rounded-xl border border-deept/15 px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale"
            >
              Show {label?.format === "qr" ? "barcode" : "QR"}
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="inline-flex items-center gap-2 rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid"
            >
              <Printer className="size-4" /> Print
            </button>
          </>
        }
      >
        {label && (
          <div className="lab-label-print space-y-3 text-center">
            <p className="font-mono text-sm font-bold text-ink">{label.sampleId}</p>
            <div
              className="mx-auto max-w-xs overflow-hidden rounded-xl border border-deept/10 bg-white p-3"
              dangerouslySetInnerHTML={{ __html: label.svg }}
            />
            <p className="flex items-center justify-center gap-1 break-all font-mono text-[10px] text-ink-soft">
              {label.format === "qr" ? <QrCode className="size-3 shrink-0" /> : <ScanLine className="size-3 shrink-0" />}
              {label.value}
            </p>
          </div>
        )}
      </Modal>

      <LabTrustNote />
    </LabPageShell>
  );
}
