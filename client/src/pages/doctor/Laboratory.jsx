import { useEffect, useState } from "react";
import { FlaskConical, Search, ArrowLeftRight, MessageSquarePlus, ClipboardPlus } from "lucide-react";
import { toast } from "sonner";
import { doctorApi } from "@/services/doctorApi";
import { fallbackDoctorData } from "@/services/doctorFallback";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Modal } from "@/components/doctor/Modal";
import { LabRequestForm } from "@/components/doctor/LabRequestForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function DoctorLaboratory() {
  const [tab, setTab] = useState("requests");
  const [requests, setRequests] = useState([]);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState(null);
  const [compareWith, setCompareWith] = useState(null);
  const [comment, setComment] = useState("");
  const [treatment, setTreatment] = useState({ clinicalInterpretation: "", treatmentDecision: "", updatedDiagnosis: "", additionalMedication: "", additionalNotes: "" });
  const [previousReports, setPreviousReports] = useState([]);

  useEffect(() => {
    Promise.all([
      doctorApi.getLabRequests().catch(() => ({ requests: fallbackDoctorData.labRequests })),
      doctorApi.getLabReports().catch(() => ({ reports: fallbackDoctorData.labReports })),
    ])
      .then(([r, rep]) => {
        setRequests(r.requests);
        setReports(rep.reports);
      })
      .finally(() => setLoading(false));
  }, []);

  const loadReport = async (report) => {
    setViewing(report);
    setComment(report.comment || "");
    setTreatment(report.treatment || { clinicalInterpretation: "", treatmentDecision: "", updatedDiagnosis: "", additionalMedication: "", additionalNotes: "" });
    try {
      const data = await doctorApi.getLabReport(report.id);
      setViewing(data.report);
      setPreviousReports(data.previousReports || []);
      setComment(data.report.comment || "");
      setTreatment(data.report.treatment || {});
      return;
    } catch (e) {
      setPreviousReports(fallbackDoctorData.labReports
        .filter((r) => r.id !== report.id)
        .map((r) => ({ id: r.id, testName: r.testName, results: r.results })));
    }
  };

  const saveComment = async () => {
    try {
      await doctorApi.addReportComment(viewing.id, comment);
      toast.success("Comment saved successfully");
      setViewing((v) => ({ ...v, comment, reviewed: true }));
    } catch (e) {
      toast.error("Unable to save comment. Please try again.");
      setViewing((v) => ({ ...v, comment, reviewed: true }));
    }
  };

  const saveTreatment = async () => {
    try {
      await doctorApi.continueTreatment(viewing.id, treatment);
      toast.success("Treatment updated successfully");
      setViewing((v) => ({ ...v, treatment }));
    } catch (e) {
      toast.error("Unable to update treatment. Please try again.");
      setViewing((v) => ({ ...v, treatment }));
    }
  };

  const filteredRequests = requests.filter((r) => (r.patient?.name || "").toLowerCase().includes(search.toLowerCase()));
  const filteredReports = reports.filter((r) => (r.patient?.name || "").toLowerCase().includes(search.toLowerCase()));

  const compare = (result, prevRow) => {
    if (!prevRow) return null;
    const cur = parseFloat(String(result?.result).replace(/,/g, ""));
    const prev = parseFloat(String(prevRow?.result).replace(/,/g, ""));
    if (isNaN(cur) || isNaN(prev)) return "—";
    if (cur === prev) return "No change";
    return cur > prev ? "Increased" : "Decreased";
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-heading text-2xl font-extrabold text-teal-deep">Laboratory</h1>
          <p className="mt-1 text-sm text-ink-soft font-medium">Request tests and review laboratory reports.</p>
        </div>
        <LabRequestForm />
      </div>

      <div className="flex gap-2">
        <TabButton active={tab === "requests"} onClick={() => setTab("requests")}>Lab Requests</TabButton>
        <TabButton active={tab === "reports"} onClick={() => setTab("reports")}>Reports</TabButton>
      </div>

      <div className="relative flex-1 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by patient..." className="pl-9" />
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-2xl border border-deept/10 bg-white" />
      ) : tab === "requests" ? (
        <div className="overflow-x-auto rounded-2xl border border-deept/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-deept/10 bg-cream">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Test</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Requested Date</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Priority</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deept/5">
              {filteredRequests.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-soft">No pending laboratory requests.</td></tr>}
              {filteredRequests.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-softcream">
                  <td className="px-4 py-3 font-semibold text-ink">{r.patient?.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{r.testName}</td>
                  <td className="px-4 py-3 text-ink-soft">{r.requestedDate}</td>
                  <td className="px-4 py-3"><PriorityBadge priority={r.priority} /></td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-deept/10 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-deept/10 bg-cream">
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Patient</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Test</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Completed Date</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Status</th>
                <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-deept/5">
              {filteredReports.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-ink-soft">No completed lab reports.</td></tr>}
              {filteredReports.map((r) => (
                <tr key={r.id} className="transition-colors hover:bg-softcream">
                  <td className="px-4 py-3 font-semibold text-ink">{r.patient?.name}</td>
                  <td className="px-4 py-3 text-ink-soft">{r.testName}</td>
                  <td className="px-4 py-3 text-ink-soft">{r.completedDate || r.createdAt?.slice(0, 10)}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <button onClick={() => loadReport(r)} className="inline-flex items-center gap-1 text-sm font-semibold text-teal-mid hover:underline">
                        <Search className="size-3.5" /> Review
                      </button>
                      <button onClick={() => loadReport(r)} className="inline-flex items-center gap-1 text-sm font-semibold text-ink-soft hover:text-ink">
                        <ArrowLeftRight className="size-3.5" /> Compare
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!viewing} onClose={() => setViewing(null)} title={`Lab Report — ${viewing?.testName || ""}`} size="xl">
        {viewing && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Info label="Patient" value={viewing.patient?.name} />
              <Info label="Test" value={viewing.testName} />
              <Info label="Requested" value={viewing.requestedDate} />
              <Info label="Completed" value={viewing.completedDate} />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-sm font-semibold text-ink">Test Results</p>
                {previousReports.length > 0 && (
                  <select
                    value={compareWith?.id || ""}
                    onChange={(e) => setCompareWith(previousReports.find((p) => p.id === e.target.value) || null)}
                    className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
                  >
                    <option value="">Compare with previous...</option>
                    {previousReports.map((p) => <option key={p.id} value={p.id}>{p.testName} ({p.completedDate || p.createdAt?.slice(0, 10)})</option>)}
                  </select>
                )}
              </div>
              <ResultTable results={viewing.results || []} prevResults={compareWith?.results || []} compare={compare} />
            </div>

            <div className="rounded-xl border border-deept/10 p-4">
              <p className="mb-2 text-sm font-semibold text-ink">Add Comment</p>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder='e.g. "Results show improvement compared with the previous report."'
              />
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={saveComment}><MessageSquarePlus className="size-4" /> Save Comment</Button>
              </div>
            </div>

            <div className="rounded-xl border border-deept/10 p-4">
              <div className="mb-2 flex items-center gap-2">
                <ClipboardPlus className="size-4 text-teal-mid" />
                <p className="text-sm font-semibold text-ink">Continue Treatment</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Clinical Interpretation" value={treatment.clinicalInterpretation} onChange={(v) => setTreatment((t) => ({ ...t, clinicalInterpretation: v }))} />
                <Field label="Treatment Decision" value={treatment.treatmentDecision} onChange={(v) => setTreatment((t) => ({ ...t, treatmentDecision: v }))} />
                <Field label="Updated Diagnosis" value={treatment.updatedDiagnosis} onChange={(v) => setTreatment((t) => ({ ...t, updatedDiagnosis: v }))} />
                <Field label="Additional Medication" value={treatment.additionalMedication} onChange={(v) => setTreatment((t) => ({ ...t, additionalMedication: v }))} />
              </div>
              <div className="mt-3">
                <Field label="Additional Notes" value={treatment.additionalNotes} onChange={(v) => setTreatment((t) => ({ ...t, additionalNotes: v }))} />
              </div>
              <div className="mt-3 flex justify-end">
                <Button size="sm" onClick={saveTreatment}><ClipboardPlus className="size-4" /> Save Treatment</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${active ? "bg-teal-mid text-white" : "bg-cream text-ink-soft hover:bg-teal-pale"}`}>
      {children}
    </button>
  );
}

function PriorityBadge({ priority }) {
  const cls = priority === "Emergency" ? "bg-coral text-white" : priority === "Urgent" ? "bg-sand text-coral-dark" : "bg-lavender-pale text-lavender";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{priority}</span>;
}

function ResultTable({ results, prevResults, compare }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-deept/10">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-deept/10 bg-cream">
            <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Test</th>
            <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Result</th>
            <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Reference Range</th>
            {prevResults.length > 0 && <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Previous</th>}
            {prevResults.length > 0 && <th className="px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-ink-soft">Change</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-deept/5">
          {results.map((r, i) => {
            const prevRow = prevResults[i];
            const change = compare(r, prevRow);
            return (
              <tr key={i}>
                <td className="px-3 py-2 font-medium text-ink">{r.test}</td>
                <td className="px-3 py-2">
                  <span className={`font-semibold ${r.flag === "high" || r.flag === "low" ? "text-coral-dark" : "text-ink"}`}>{r.result}</span>
                  {r.unit && <span className="ml-1 text-xs text-ink-soft">{r.unit}</span>}
                </td>
                <td className="px-3 py-2 text-ink-soft">{r.referenceRange}</td>
                {prevResults.length > 0 && <td className="px-3 py-2 text-ink-soft">{prevRow?.result || "—"}</td>}
                {prevResults.length > 0 && (
                  <td className="px-3 py-2">
                    <span className={`text-xs font-semibold ${change === "Increased" ? "text-coral-dark" : change === "Decreased" ? "text-teal-mid" : "text-ink-soft"}`}>
                      {change === "Increased" ? "▲ " : change === "Decreased" ? "▼ " : ""}{change}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
          {results.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-ink-soft">No results recorded.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-ink-soft">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-ink">{value || "—"}</p>
    </div>
  );
}

function Field({ label, value, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-ink-soft">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
    </div>
  );
}
