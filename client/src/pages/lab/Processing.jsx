import { useCallback, useEffect, useMemo, useState } from "react";
import { Beaker, Paperclip, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { laboratoryApi, getApiError, getLabError } from "@/services/laboratoryApi";
import { LabCard, LabPageShell, LabTableState, LabTrustNote } from "./LabPageShell";

const FLAGS = ["NORMAL", "HIGH", "LOW", "ABNORMAL", "CRITICAL"];

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "-" : parsed.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
};

const fieldClass = "h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20";
const labelClass = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft";

const emptyParameter = () => ({ parameter: "", value: "", unit: "", referenceRange: "", min: null, max: null, isNumeric: true, isRequired: true, sexSpecific: false, configured: false, flag: "NORMAL", remarks: "" });

/**
 * A default flag derived from the configured bounds, so an out-of-range value is
 * flagged as the technician types. The server re-derives this on save and an
 * explicit technician choice always wins, so this is convenience, not authority.
 */
const deriveFlag = (value, min, max) => {
  if (min == null && max == null) return null;
  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  if (min != null && numeric < min) return "LOW";
  if (max != null && numeric > max) return "HIGH";
  return "NORMAL";
};

export default function ProcessingPage() {
  const [items, setItems] = useState([]);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState("");
  const [active, setActive] = useState(null);
  const [notes, setNotes] = useState("");
  const [parameters, setParameters] = useState([emptyParameter()]);
  const [files, setFiles] = useState([]);
  const [saving, setSaving] = useState(false);
  const [templateLoading, setTemplateLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [processingItems, resultData] = await Promise.all([
        laboratoryApi.getProcessing({ limit: 0 }),
        laboratoryApi.getResults({ limit: 0 }),
      ]);
      setItems(processingItems);
      setResults(resultData);
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

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return items.filter((item) => {
      const status = String(item.status || "").toUpperCase();
      if (stage && status !== stage) return false;
      if (!query) return true;
      return [
        item._id,
        item.patient?.name,
        item.test?.name,
        item.test?.testName,
        item.sample?.sampleId,
        item.sample?.barcode,
      ].some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [items, search, stage]);

  const resultsFor = (requestId) => results.filter((result) => String(result.labRequest) === String(requestId));

  /**
   * Frontend-side check that every required parameter has a recorded result with
   * a real value, before the Complete request is sent (FR-LB-02 frontend
   * validation). Mirrors the backend rule so the technician gets immediate
   * feedback instead of a round-trip.
   *
   * Matching prefers the stable parameterId and falls back to a normalized
   * name, exactly like the backend, so the two stay in sync. The backend always
   * re-checks - this is convenience, not authority.
   */
  const validateCompletion = async (item) => {
    const testId = item.test?._id || item.test;
    const patientId = item.patient?._id || item.patient;
    if (!testId) return [];
    let template;
    try {
      template = await laboratoryApi.getTestParameters(testId, patientId);
    } catch {
      return []; // Can't preload required params - let the backend decide.
    }
    if (!template || template.resultStyle === "NARRATIVE") return [];
    const required = (template.parameters || []).filter((p) => p.isRequired !== false);
    if (!required.length) return [];

    const saved = resultsFor(item._id);
    const recordedById = new Set();
    const recordedByName = new Set();
    for (const result of saved) {
      for (const parameter of (result.parameters || [])) {
        if (!String(parameter.value || "").trim()) continue;
        if (parameter.parameterId) recordedById.add(String(parameter.parameterId));
        recordedByName.add(String(parameter.parameter || "").trim().toLowerCase());
      }
    }
    return required
      .filter((parameter) => {
        const idMatch = parameter.parameterId && recordedById.has(String(parameter.parameterId));
        const nameMatch = recordedByName.has(String(parameter.parameter || "").trim().toLowerCase());
        return !idMatch && !nameMatch;
      })
      .map((parameter) => parameter.parameter);
  };

  const transition = async (item, action) => {
    setBusyId(item._id);
    try {
      if (action === "start") {
        await laboratoryApi.startProcessing(item._id, notes || undefined);
        toast.success("Processing started");
      } else {
        const missing = await validateCompletion(item);
        if (missing.length > 0) {
          toast.error(`Please enter all required test results before completing processing. Missing required parameter: ${missing.join(", ")}`);
          return;
        }
        await laboratoryApi.completeProcessing(item._id, notes || undefined);
        toast.success("Processing completed");
      }
      setNotes("");
      await load();
    } catch (actionError) {
      const { message, missingParameters } = getLabError(actionError);
      if (missingParameters.length > 0) {
        toast.error(`Please enter all required test results before completing processing. Missing required parameter: ${missingParameters.join(", ")}`);
      } else {
        toast.error(message);
      }
    } finally {
      setBusyId(null);
    }
  };

  const openResultEntry = async (item) => {
    setActive(item);
    setFiles([]);
    setNotes(item.processingNotes || "");
    setParameters([]);
    setTemplateLoading(true);
    try {
      const testId = item.test?._id || item.test;
      const patientId = item.patient?._id || item.patient;
      if (testId) {
         // FR-LB-06: the blank rows come from the test's configured panel, with the
         // unit and reference range resolved for THIS patient (sex-specific ranges
         // need the patient's gender). The technician types values, not ranges.
         const template = await laboratoryApi.getTestParameters(testId, patientId);
         const rows = (template?.parameters || []).map((parameter) => ({
           parameterId: parameter.parameterId || parameter._id,
           parameter: parameter.parameter,
           value: "",
           unit: parameter.unit || "",
           referenceRange: parameter.referenceRange || "",
           min: parameter.min ?? null,
           max: parameter.max ?? null,
           isNumeric: parameter.isNumeric !== false,
           isRequired: parameter.isRequired !== false,
           sexSpecific: parameter.sexSpecific === true,
           configured: true,
           flag: "NORMAL",
           remarks: "",
         }));
        setParameters(rows.length ? rows : [emptyParameter()]);
      } else {
        setParameters([emptyParameter()]);
      }
    } catch (templateError) {
      // A template lookup failure must not block ad-hoc entry on the bench.
      setParameters([{ ...emptyParameter(), parameter: item.test?.name || item.test?.testName || "" }]);
      toast.error(getApiError(templateError));
    } finally {
      setTemplateLoading(false);
    }
  };

  const updateParameter = (index, key, value) => {
    setParameters((current) =>
      current.map((parameter, position) => {
        if (position !== index) return parameter;
        const next = { ...parameter, [key]: value };
        if (key === "value") {
          const derived = deriveFlag(value, parameter.min, parameter.max);
          if (derived) next.flag = derived;
        }
        return next;
      })
    );
  };

  const saveResult = async (event) => {
    event.preventDefault();
    if (!active) return;
    const filled = parameters.filter((parameter) => parameter.parameter.trim() && parameter.value.trim());
    if (!filled.length) {
      toast.error("At least one parameter with a name and a value is required");
      return;
    }
    setSaving(true);
    try {
      const processingNotes = notes.trim() || undefined;
      if (files.length) {
        // multipart so the server can store and validate the binary itself
        const payload = new FormData();
        payload.append("labRequest", active._id);
        payload.append("sample", active.sample?._id || "");
        payload.append("parameters", JSON.stringify(filled));
        if (processingNotes) payload.append("processingNotes", processingNotes);
        files.forEach((file) => payload.append("attachments", file));
        await laboratoryApi.createResultWithFiles(payload);
      } else {
        await laboratoryApi.createResult({
          labRequest: active._id,
          sample: active.sample?._id,
          parameters: filled,
          attachments: [],
          processingNotes,
        });
      }
      toast.success("Result recorded");
      setNotes("");
      setActive(null);
      await load();
    } catch (saveError) {
      toast.error(getApiError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const inProcessing = items.filter((item) => String(item.status).toUpperCase() === "PROCESSING").length;
  const awaitingBench = items.filter((item) => String(item.status).toUpperCase() === "SAMPLE_COLLECTED").length;
  const awaitingReport = items.filter((item) => String(item.status).toUpperCase() === "COMPLETED").length;

  return (
    <LabPageShell
      title="Processing"
      description="Run tests on collected specimens, record results, and close out the bench."
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <LabCard title="On the bench"><p className="font-heading text-3xl font-extrabold text-teal-deep">{loading ? "..." : inProcessing}</p><p className="mt-1 text-sm text-ink-soft">Currently processing</p></LabCard>
        <LabCard title="Awaiting a bench"><p className="font-heading text-3xl font-extrabold text-teal-deep">{loading ? "..." : awaitingBench}</p><p className="mt-1 text-sm text-ink-soft">Samples ready to run</p></LabCard>
        <LabCard title="Awaiting a report"><p className="font-heading text-3xl font-extrabold text-teal-deep">{loading ? "..." : awaitingReport}</p><p className="mt-1 text-sm text-ink-soft">Analysed, not yet reported</p></LabCard>
      </div>

      <LabCard
        title="Processing queue"
        description={loading ? "Loading queue..." : `${visible.length} of ${items.length} items shown.`}
      >
        <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search patient, test, sample ID or barcode..."
              aria-label="Search processing queue"
              className={`${fieldClass} pl-9`}
            />
          </div>
          <select value={stage} onChange={(event) => setStage(event.target.value)} aria-label="Filter by stage" className={fieldClass}>
            <option value="">All stages</option>
            <option value="SAMPLE_COLLECTED">Awaiting processing</option>
            <option value="PROCESSING">In processing</option>
            <option value="COMPLETED">Awaiting report</option>
          </select>
        </div>

        <div className="space-y-4">
          <LabTableState
            as="div"
            loading={loading}
            error={error}
            empty={!visible.length}
            emptyMessage={items.length ? "No items match this filter." : "Nothing is waiting on the bench. Collect a sample to start."}
          />
          {!loading && !error && visible.map((item) => {
            const status = String(item.status || "").toUpperCase();
            const recorded = resultsFor(item._id);
            return (
              <article key={item._id} className="rounded-2xl border border-deept/10 p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Beaker className="size-4 text-teal-mid" />
                      <h3 className="font-heading text-lg font-bold text-ink">{item.test?.name || item.test?.testName || "Laboratory test"}</h3>
                      <StatusBadge status={item.status} />
                    </div>
                    <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
                      <div><dt className="text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</dt><dd className="font-medium text-ink">{item.patient?.name || "-"}</dd></div>
                      <div><dt className="text-xs font-bold uppercase tracking-wider text-ink-soft">Doctor</dt><dd className="font-medium text-ink">{item.doctor?.name || "-"}</dd></div>
                      <div><dt className="text-xs font-bold uppercase tracking-wider text-ink-soft">Sample</dt><dd className="font-mono text-xs font-semibold text-teal-mid">{item.sample?.sampleId || "Not linked"}</dd></div>
                      <div><dt className="text-xs font-bold uppercase tracking-wider text-ink-soft">Specimen</dt><dd className="font-medium text-ink">{item.sample?.sampleType || item.test?.sampleType || "-"}</dd></div>
                      <div><dt className="text-xs font-bold uppercase tracking-wider text-ink-soft">Collected</dt><dd className="font-medium text-ink">{formatDateTime(item.sample?.collectionTime || item.sample?.collectionDate)}</dd></div>
                      <div><dt className="text-xs font-bold uppercase tracking-wider text-ink-soft">Started</dt><dd className="font-medium text-ink">{formatDateTime(item.processingStartedAt)}</dd></div>
                    </dl>
                    {item.processingNotes && <p className="mt-3 rounded-xl bg-softteal/40 px-4 py-2.5 text-sm text-ink-soft">Notes: {item.processingNotes}</p>}

                    {recorded.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {recorded.map((result) => (
                          <div key={result._id} className="rounded-xl border border-deept/10 p-3">
                            <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">
                              Result entered {formatDateTime(result.enteredAt)} by {result.enteredBy?.name || "laboratory staff"}
                            </p>
                            <ul className="mt-2 space-y-1 text-sm">
                              {result.parameters.map((parameter, index) => (
                                <li key={`${result._id}-${index}`} className="flex flex-wrap items-center gap-2 text-ink">
                                  <span className="font-semibold">{parameter.parameter}</span>
                                  <span className="font-mono">{parameter.value}{parameter.unit ? ` ${parameter.unit}` : ""}</span>
                                  {parameter.referenceRange && <span className="text-xs text-ink-soft">(ref {parameter.referenceRange})</span>}
                                  <StatusBadge status={parameter.flag} />
                                </li>
                              ))}
                            </ul>
                            {result.attachments?.length > 0 && (
                              <ul className="mt-2 space-y-1">
                                {result.attachments.map((file) => (
                                  <li key={file.id}>
                                    <a
                                      href={laboratoryApi.attachmentUrl(result._id, file.id)}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-mid underline underline-offset-4"
                                    >
                                      <Paperclip className="size-3.5" /> {file.fileName}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2 lg:w-52">
                    {status === "SAMPLE_COLLECTED" && (
                      <button
                        type="button"
                        disabled={busyId === item._id}
                        onClick={() => transition(item, "start")}
                        className="rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50"
                      >
                        {busyId === item._id ? "Working..." : "Start processing"}
                      </button>
                    )}
                    {status === "PROCESSING" && (
                      <>
                        <button
                          type="button"
                          onClick={() => openResultEntry(item)}
                          className="rounded-xl border border-teal-mid/40 bg-teal-pale px-4 py-2.5 text-sm font-bold text-teal-deep transition hover:bg-softteal"
                        >
                          Enter result
                        </button>
                        <button
                          type="button"
                          disabled={busyId === item._id || !recorded.length}
                          onClick={() => transition(item, "complete")}
                          className="rounded-xl border border-deept/15 px-4 py-2.5 text-sm font-bold text-teal-deep transition hover:bg-teal-pale disabled:opacity-50"
                        >
                          {busyId === item._id ? "Working..." : "Complete processing"}
                        </button>
                        {!recorded.length && <p className="text-xs text-ink-soft">Record at least one result before completing.</p>}
                      </>
                    )}
                    {status === "COMPLETED" && (
                      <>
                        <button
                          type="button"
                          onClick={() => openResultEntry(item)}
                          className="rounded-xl border border-teal-mid/40 bg-teal-pale px-4 py-2.5 text-sm font-bold text-teal-deep transition hover:bg-softteal"
                        >
                          Add result
                        </button>
                        <Link to="/lab/reports" className="rounded-xl border border-deept/15 px-4 py-2.5 text-center text-sm font-bold text-teal-deep transition hover:bg-teal-pale">
                          Generate report
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </LabCard>

      <Modal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title="Enter result"
        description={active ? `${active.test?.name || active.test?.testName || "Test"} for ${active.patient?.name || "patient"}` : undefined}
        size="lg"
        closeDisabled={saving}
        footer={
          <>
            <button type="button" onClick={() => setActive(null)} disabled={saving} className="rounded-xl border border-deept/15 px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale">
              Cancel
            </button>
            <button type="submit" form="lab-result-form" disabled={saving} className="rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50">
              {saving ? "Saving..." : "Save result"}
            </button>
          </>
        }
      >
        <form id="lab-result-form" onSubmit={saveResult} className="space-y-4">
          {templateLoading && (
            <p className="flex items-center gap-2 rounded-xl bg-softteal/40 px-4 py-3 text-sm text-ink-soft">
              <RefreshCw className="size-4 animate-spin" /> Loading the test's parameter panel...
            </p>
          )}
          {parameters.map((parameter, index) => (
            <div key={index} className="rounded-2xl border border-deept/10 p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Parameter {index + 1}
                  {parameter.isRequired && <span className="text-coral-dark">required</span>}
                  {parameter.sexSpecific && <span className="text-lavender">sex-specific range</span>}
                </p>
                {parameters.length > 1 && !parameter.configured && (
                  <button
                    type="button"
                    onClick={() => setParameters((current) => current.filter((_, position) => position !== index))}
                    className="inline-flex items-center gap-1 text-xs font-bold text-coral-dark"
                  >
                    <Trash2 className="size-3.5" /> Remove
                  </button>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor={`parameter-name-${index}`}>Parameter name</label>
                  <input
                    id={`parameter-name-${index}`}
                    value={parameter.parameter}
                    readOnly={parameter.configured}
                    onChange={(event) => updateParameter(index, "parameter", event.target.value)}
                    className={`${fieldClass} ${parameter.configured ? "bg-softteal/40 text-ink-soft" : ""}`}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`parameter-value-${index}`}>Value</label>
                  <input
                    id={`parameter-value-${index}`}
                    required
                    value={parameter.value}
                    onChange={(event) => updateParameter(index, "value", event.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`parameter-unit-${index}`}>Unit</label>
                  <input
                    id={`parameter-unit-${index}`}
                    value={parameter.unit}
                    readOnly={parameter.configured}
                    onChange={(event) => updateParameter(index, "unit", event.target.value)}
                    className={`${fieldClass} ${parameter.configured ? "bg-softteal/40 text-ink-soft" : ""}`}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor={`parameter-range-${index}`}>Reference range</label>
                  <input
                    id={`parameter-range-${index}`}
                    value={parameter.referenceRange}
                    readOnly={parameter.configured}
                    onChange={(event) => updateParameter(index, "referenceRange", event.target.value)}
                    className={`${fieldClass} ${parameter.configured ? "bg-softteal/40 text-ink-soft" : ""}`}
                  />
                  {parameter.configured && (
                    <p className="mt-1 text-xs text-ink-soft">Resolved from the test configuration for this patient.</p>
                  )}
                </div>
                <div>
                  <label className={labelClass} htmlFor={`parameter-flag-${index}`}>Flag</label>
                  <select
                    id={`parameter-flag-${index}`}
                    value={parameter.flag}
                    onChange={(event) => updateParameter(index, "flag", event.target.value)}
                    className={fieldClass}
                  >
                    {FLAGS.map((flag) => <option key={flag} value={flag}>{flag}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClass} htmlFor={`parameter-remarks-${index}`}>Remarks</label>
                  <input
                    id={`parameter-remarks-${index}`}
                    value={parameter.remarks}
                    onChange={(event) => updateParameter(index, "remarks", event.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => setParameters((current) => [...current, emptyParameter()])}
            className="inline-flex items-center gap-2 rounded-xl border border-deept/15 px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale"
          >
            <Plus className="size-4" /> Add parameter
          </button>

          <div>
            <label className={labelClass} htmlFor="result-attachments">Attachments (JPG, PNG, WEBP, GIF or PDF, up to 5)</label>
            <input
              id="result-attachments"
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
              onChange={(event) => setFiles(Array.from(event.target.files || []))}
              className="w-full text-sm text-ink-soft file:mr-3 file:rounded-xl file:border-0 file:bg-teal-pale file:px-4 file:py-2 file:text-sm file:font-bold file:text-teal-deep"
            />
            {files.length > 0 && (
              <ul className="mt-2 space-y-1 text-xs text-ink-soft">
                {files.map((file) => <li key={file.name}>{file.name} ({Math.round(file.size / 1024)} KB)</li>)}
              </ul>
            )}
          </div>

          <div>
            <label className={labelClass} htmlFor="result-notes">Processing notes</label>
            <textarea
              id="result-notes"
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className={`${fieldClass} h-auto py-2.5`}
            />
            <p className="mt-1.5 text-xs text-ink-soft">
              Saved on this request and kept when processing is completed.
            </p>
          </div>
        </form>
      </Modal>

      <LabTrustNote />
    </LabPageShell>
  );
}
