import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  RefreshCw,
  Download,
  FileSpreadsheet,
  FileText,
  Search,
  BarChart3,
  CalendarDays,
  Wallet,
  FlaskConical,
  UserRound,
} from "lucide-react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingSkeleton } from "@/components/common/LoadingSkeleton";
import { getReport, getReportPatients, downloadReport } from "@/services/adminApi";
import { getErrorMessage } from "@/lib/axios";
import { formatDate } from "@/lib/formatDate";
import { formatMoney, todayInputValue } from "@/lib/format";

/**
 * Administrative reporting (FR-AD-05).
 *
 * This page does not know the shape of any individual report. The server returns
 * `columns` and `rows` together, so the table is rendered from the payload itself
 * and a new report kind needs no change here.
 *
 * The export buttons call the SAME endpoint the JSON route is built from
 * (`adminReportService.build`), so a downloaded file is by construction the table
 * that was on screen rather than a second query that might answer a slightly
 * different question.
 *
 * Every figure below is a live aggregation - nothing here is a stored total,
 * because a cached total is wrong the moment an appointment is cancelled or a
 * payment is recorded.
 */

const KINDS = [
  { value: "daily", label: "Daily", icon: CalendarDays },
  { value: "monthly", label: "Monthly", icon: BarChart3 },
  { value: "revenue", label: "Revenue", icon: Wallet },
  { value: "laboratory", label: "Laboratory", icon: FlaskConical },
  { value: "patient", label: "Patient", icon: UserRound },
];

/** Figure keys whose values are money and must not be shown as bare numbers. */
const MONEY_FIGURES = new Set(["revenue", "collected", "invoiced", "outstanding"]);

// Headline figures rotate through the same four-tone palette as the Laboratory
// and dashboard stat tiles, so a KPI row reads identically wherever it appears.
const FIGURE_TILE_BG = ["bg-teal-pale", "bg-softteal", "bg-lavender-pale", "bg-teal-pale"];

const humaniseFigure = (key) =>
  key
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());

const EXPORT_FORMATS = [
  { value: "csv", label: "CSV", icon: FileText },
  { value: "excel", label: "Excel", icon: FileSpreadsheet },
  { value: "pdf", label: "PDF", icon: Download },
];

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function Reports() {
  const [kind, setKind] = useState("daily");
  const [report, setReport] = useState(null);

  // Per-kind parameters. Only the ones the selected kind uses are sent.
  const [date, setDate] = useState(todayInputValue());
  const now = new Date();
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [from, setFrom] = useState(todayInputValue());
  const [to, setTo] = useState(todayInputValue());
  const [patientId, setPatientId] = useState("");
  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(null);

  const buildParams = useCallback(() => {
    if (kind === "daily") return { date };
    if (kind === "monthly") return { year, month };
    if (kind === "patient") return { patientId };
    return { from, to };
  }, [kind, date, year, month, patientId, from, to]);

  const load = useCallback(async () => {
    // The patient report is keyed on a patient; asking the server without one is
    // a guaranteed 422, so wait for the picker instead of firing a doomed request.
    if (kind === "patient" && !patientId) {
      setReport(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      setReport(await getReport(kind, buildParams()));
    } catch (err) {
      setError(getErrorMessage(err, "Could not build this report."));
      setReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [kind, buildParams, patientId]);

  useEffect(() => {
    load();
  }, [load]);

  // Patient report needs a patient, so the picker is only fetched for that kind.
  useEffect(() => {
    if (kind !== "patient") return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await getReportPatients({ search: patientQuery.trim() || undefined });
        if (!cancelled) setPatients(result || []);
      } catch {
        if (!cancelled) setPatients([]);
      }
    }, patientQuery ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [kind, patientQuery]);

  const exportReport = async (format) => {
    setExporting(format);
    try {
      const filename = await downloadReport(kind, { ...buildParams(), format });
      toast.success(`${filename} downloaded.`);
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not export this report."));
    } finally {
      setExporting(null);
    }
  };

  const figures = Object.entries(report?.figures || {});
  const columns = report?.columns || [];
  const rows = report?.rows || [];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="font-heading text-3xl font-extrabold leading-tight text-teal-deep">Reports</h1>
          <p className="text-base font-medium text-ink-soft">
            Live operational figures. Exports contain exactly the rows shown below.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={isLoading}
          className="inline-flex h-11 items-center gap-2 self-start rounded-full border border-deept/15 bg-white px-4 text-sm font-semibold text-teal-deep transition hover:border-teal-mid hover:text-teal-mid disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* Report kind */}
      <div className="flex flex-wrap gap-2">
        {KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setKind(option.value)}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition ${
              kind === option.value
                ? "bg-teal-mid text-white shadow-md shadow-teal-mid/30"
                : "border border-deept/15 bg-white text-ink-soft hover:border-teal-mid/40 hover:text-teal-mid"
            }`}
          >
            <option.icon className="size-4" />
            {option.label}
          </button>
        ))}
      </div>

      {/* Per-kind parameters */}
      <div className="flex flex-col gap-4 rounded-2xl border border-deept/10 bg-white p-5 sm:flex-row sm:items-end">
        {kind === "daily" && (
          <div>
            <label htmlFor="rep-date" className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">
              Report date
            </label>
            <input
              id="rep-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
            />
          </div>
        )}

        {kind === "monthly" && (
          <>
            <div>
              <label htmlFor="rep-year" className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">
                Year
              </label>
              <input
                id="rep-year"
                type="number"
                min="2000"
                max={now.getFullYear() + 1}
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="h-11 w-32 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
              />
            </div>
            <div>
              <label htmlFor="rep-month" className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">
                Month
              </label>
              <select
                id="rep-month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
              >
                {monthNames.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </>
        )}

        {(kind === "revenue" || kind === "laboratory") && (
          <>
            <div>
              <label htmlFor="rep-from" className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">
                From
              </label>
              <input
                id="rep-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
              />
            </div>
            <div>
              <label htmlFor="rep-to" className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">
                To
              </label>
              <input
                id="rep-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-11 rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid"
              />
            </div>
          </>
        )}

        {kind === "patient" && (
          <div className="w-full">
            <label htmlFor="rep-patient" className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-soft">
              Patient
            </label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
              <input
                id="rep-patient"
                type="text"
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  setPatientId("");
                }}
                placeholder="Search patients by name, email or phone"
                className="h-11 w-full rounded-xl border border-deept/15 bg-white pl-10 pr-4 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20"
              />
            </div>
            <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-deept/10">
              {patients.length === 0 ? (
                <p className="px-4 py-3 text-sm text-ink-soft">No patients match that search.</p>
              ) : (
                patients.map((patient) => (
                  <button
                    key={patient._id}
                    type="button"
                    onClick={() => {
                      setPatientId(patient._id);
                      setPatientQuery(patient.name);
                    }}
                    className={`flex w-full items-center gap-3 border-b border-deept/5 px-4 py-2 text-left last:border-0 transition hover:bg-teal-pale/30 ${
                      patientId === patient._id ? "bg-teal-pale" : ""
                    }`}
                  >
                    <UserRound className="size-4 shrink-0 text-teal-mid" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{patient.name}</span>
                      <span className="block truncate text-xs text-ink-soft">{patient.email}</span>
                    </span>
                    {patientId === patient._id && <span className="text-xs font-bold text-teal-mid">Selected</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={6} columns={5} />
      ) : error ? (
        <ErrorState title="Could not build this report" description={error} onRetry={load} />
      ) : !report ? (
        <div className="rounded-2xl border border-dashed border-deept/20 bg-white px-5 py-16 text-center">
          <BarChart3 className="mx-auto size-8 text-ink-soft/60" />
          <p className="mt-3 text-sm font-semibold text-ink">Nothing to report yet</p>
          <p className="mt-1 text-sm text-ink-soft">
            {kind === "patient"
              ? "Choose a patient to build their clinical history report."
              : "Adjust the filters above to build a report."}
          </p>
        </div>
      ) : (
        <>
          {/* Headline figures */}
          {figures.length > 0 && (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
              {figures.map(([key, value], index) => (
                <div
                  key={key}
                  className={`rounded-2xl border border-deept/5 ${FIGURE_TILE_BG[index % FIGURE_TILE_BG.length]} p-4`}
                >
                  <p className="text-xs font-medium text-ink-soft">{humaniseFigure(key)}</p>
                  <p className="mt-1 font-heading text-xl font-bold text-teal-deep">
                    {MONEY_FIGURES.has(key) ? `Rs. ${formatMoney(value)}` : String(value ?? "—")}
                  </p>
                </div>
              ))}
            </div>
          )}

          <section className="overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-deept/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="font-heading text-lg font-bold text-teal-deep">{report.title}</h2>
                {report.label && <p className="mt-0.5 text-sm text-ink-soft">{report.label}</p>}
                {report.date && !report.label && (
                  <p className="mt-0.5 text-sm text-ink-soft">{formatDate(report.date, "DD MMM YYYY")}</p>
                )}
                {report.range?.from && !report.label && !report.date && (
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {formatDate(report.range.from, "DD MMM YYYY")} to {formatDate(report.range.to, "DD MMM YYYY")}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {EXPORT_FORMATS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => exportReport(option.value)}
                    disabled={Boolean(exporting)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-teal/30 px-3.5 py-2 text-xs font-bold text-teal-mid transition hover:bg-teal-pale disabled:opacity-60"
                  >
                    <option.icon className="size-3.5" />
                    {exporting === option.value ? "Preparing…" : option.label}
                  </button>
                ))}
              </div>
            </div>

            {rows.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-ink-soft">
                There is no activity to report for this period.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b-2 border-deept/10 bg-softteal/50">
                      {columns.map((column) => (
                        <th
                          key={column.key}
                          scope="col"
                          className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-ink-soft"
                        >
                          {column.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-deept/5">
                    {rows.map((row, index) => (
                      <tr key={index} className="transition-colors hover:bg-teal-pale/30">
                        {columns.map((column) => (
                          <td key={column.key} className="px-4 py-3 text-ink">
                            {row[column.key] ?? "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {report.footnote && (
              <p className="border-t border-deept/5 px-5 py-3 text-xs text-ink-soft">{report.footnote}</p>
            )}
          </section>

          {/* Laboratory-only breakdowns the server also returns. */}
          {Array.isArray(report.byStatus) && report.byStatus.length > 0 && (
            <section className="rounded-2xl border border-deept/10 bg-white p-5 shadow-sm">
              <h2 className="font-heading text-lg font-bold text-teal-deep">Requests by status</h2>
              <div className="mt-3 flex flex-wrap gap-2">
                {report.byStatus.map((row) => (
                  <span
                    key={row.status}
                    className="inline-flex items-center gap-2 rounded-full bg-softteal px-3 py-1.5 text-xs font-semibold text-ink"
                  >
                    {String(row.status).toLowerCase()}
                    <span className="rounded-full bg-white px-2 py-0.5 text-teal-mid">{row.count}</span>
                  </span>
                ))}
              </div>
            </section>
          )}

          {Array.isArray(report.topTests) && report.topTests.length > 0 && (
            <section className="rounded-2xl border border-deept/10 bg-white p-5 shadow-sm">
              <h2 className="font-heading text-lg font-bold text-teal-deep">Most requested tests</h2>
              <ul className="mt-3 divide-y divide-deept/5">
                {report.topTests.map((test) => (
                  <li key={test.name} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink">{test.name}</span>
                      {test.category && <span className="block text-xs text-ink-soft">{test.category}</span>}
                    </span>
                    <span className="shrink-0 font-semibold text-ink">{test.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}