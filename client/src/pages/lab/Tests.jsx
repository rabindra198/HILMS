import { useCallback, useEffect, useMemo, useState } from "react";
import { FolderCog, FlaskConical, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Modal } from "@/components/common/Modal";
import { StatusBadge } from "@/components/common/StatusBadge";
import { laboratoryApi, getApiError } from "@/services/laboratoryApi";
import { LabCard, LabPageShell, LabResponsiveList, LabTableState, LabTrustNote } from "./LabPageShell";

const SAMPLE_TYPES = ["blood", "urine", "stool", "sputum", "swab", "tissue", "other"];

const fieldClass = "h-11 w-full rounded-xl border border-deept/15 bg-white px-3 text-sm outline-none focus:border-teal-mid focus:ring-2 focus:ring-teal-mid/20";
const labelClass = "mb-1.5 block text-xs font-bold uppercase tracking-wider text-ink-soft";

const blankTest = () => ({
  name: "",
  testCode: "",
  category: "",
  description: "",
  sampleType: "blood",
  unit: "",
  normalRange: "",
  turnaroundTime: "",
  price: "",
  referenceRanges: "",
  parameters: [],
});

const blankParameter = () => ({
  parameter: "",
  unit: "",
  min: "",
  max: "",
  referenceRangeText: "",
  maleMin: "",
  maleMax: "",
  femaleMin: "",
  femaleMax: "",
  isRequired: true,
  isNumeric: true,
});

const formatPrice = (value) =>
  Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "-";

export default function TestsPage() {
  const [tests, setTests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(blankTest());
  const [saving, setSaving] = useState(false);
  const [categoryDocs, setCategoryDocs] = useState([]);
  const [categoryManager, setCategoryManager] = useState(false);
  const [categoryForm, setCategoryForm] = useState({ name: "", description: "" });
  const [categoryDrafts, setCategoryDrafts] = useState({});
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryBusyId, setCategoryBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [testData, categoryData] = await Promise.all([
        laboratoryApi.getTests({ includeInactive: "true" }),
        laboratoryApi.getCategories().catch(() => []),
      ]);
      setTests(testData);
      setCategoryDocs(categoryData);
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

  const categories = useMemo(() => {
    if (categoryDocs.length) {
      return Array.from(new Set(categoryDocs.map((doc) => doc.name).filter(Boolean))).sort();
    }
    return Array.from(new Set(tests.map((test) => test.category).filter(Boolean))).sort();
  }, [tests, categoryDocs]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return tests.filter((test) => {
      if (category && test.category !== category) return false;
      if (!query) return true;
      return [test.name, test.testName, test.testCode, test.category, test.sampleType]
        .some((value) => String(value || "").toLowerCase().includes(query));
    });
  }, [tests, search, category]);

  // Grouping by category is what makes the catalogue usable: a technician looks
  // up "what is the reference range for a lipid panel", not a flat id list.
  const grouped = useMemo(() => {
    const map = new Map();
    visible.forEach((test) => {
      const key = test.category || "Uncategorised";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(test);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [visible]);

  const openCreate = () => {
    setEditing({ mode: "create" });
    setForm(blankTest());
  };

  const openEdit = (test) => {
    setEditing({ mode: "edit", test });
    setForm({
      name: test.name || "",
      testCode: test.testCode || "",
      category: test.category || "",
      description: test.description || "",
      sampleType: test.sampleType || "blood",
      unit: test.unit || "",
      normalRange: test.normalRange || "",
      turnaroundTime: test.turnaroundTime ?? "",
      price: test.price ?? "",
      referenceRanges: (test.referenceRanges || []).join("\n"),
      parameters: (test.parameters || []).map((parameter) => ({
        parameter: parameter.parameter || "",
        unit: parameter.unit || "",
        min: parameter.min ?? "",
        max: parameter.max ?? "",
        referenceRangeText: parameter.referenceRangeText || "",
        maleMin: parameter.maleMin ?? "",
        maleMax: parameter.maleMax ?? "",
        femaleMin: parameter.femaleMin ?? "",
        femaleMax: parameter.femaleMax ?? "",
        isRequired: parameter.isRequired !== false,
        isNumeric: parameter.isNumeric !== false,
      })),
    });
  };

  const addParameter = () => setForm((current) => ({ ...current, parameters: [...current.parameters, blankParameter()] }));

  const updateTestParameter = (index, key, value) => {
    setForm((current) => ({
      ...current,
      parameters: current.parameters.map((parameter, position) => (position === index ? { ...parameter, [key]: value } : parameter)),
    }));
  };

  const removeParameter = (index) => {
    setForm((current) => ({ ...current, parameters: current.parameters.filter((_, position) => position !== index) }));
  };

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        testCode: form.testCode || undefined,
        category: form.category,
        description: form.description || undefined,
        sampleType: form.sampleType,
        unit: form.unit || undefined,
        normalRange: form.normalRange || undefined,
        turnaroundTime: form.turnaroundTime === "" ? undefined : Number(form.turnaroundTime),
        price: Number(form.price),
        referenceRanges: form.referenceRanges
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean),
        parameters: form.parameters
          .filter((parameter) => String(parameter.parameter || "").trim())
          .map((parameter, index) => ({
            parameter: parameter.parameter.trim(),
            unit: parameter.unit || undefined,
            min: parameter.min === "" ? undefined : Number(parameter.min),
            max: parameter.max === "" ? undefined : Number(parameter.max),
            referenceRangeText: parameter.referenceRangeText || undefined,
            maleMin: parameter.maleMin === "" ? undefined : Number(parameter.maleMin),
            maleMax: parameter.maleMax === "" ? undefined : Number(parameter.maleMax),
            femaleMin: parameter.femaleMin === "" ? undefined : Number(parameter.femaleMin),
            femaleMax: parameter.femaleMax === "" ? undefined : Number(parameter.femaleMax),
            isRequired: parameter.isRequired,
            isNumeric: parameter.isNumeric,
            sortOrder: index,
          })),
      };
      if (editing.mode === "create") {
        await laboratoryApi.createTest(payload);
        toast.success("Laboratory test created");
      } else {
        await laboratoryApi.updateTest(editing.test._id, payload);
        toast.success("Laboratory test updated");
      }
      setEditing(null);
      await load();
    } catch (saveError) {
      toast.error(getApiError(saveError));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (test) => {
    try {
      await laboratoryApi.setTestActive(test._id, !test.isActive);
      toast.success(test.isActive ? `${test.name} deactivated` : `${test.name} reactivated`);
      await load();
    } catch (toggleError) {
      toast.error(getApiError(toggleError));
    }
  };

  const remove = async (test) => {
    try {
      await laboratoryApi.deleteTest(test._id);
      toast.success(`${test.name} deactivated. Past reports keep their reference.`);
      await load();
    } catch (deleteError) {
      toast.error(getApiError(deleteError));
    }
  };

  const openCategoryManager = () => {
    setCategoryDrafts(Object.fromEntries(categoryDocs.map((category) => [category._id, category.name])));
    setCategoryManager(true);
  };

  const createCategory = async (event) => {
    event.preventDefault();
    const name = categoryForm.name.trim();
    if (!name) {
      toast.error("Enter a category name");
      return;
    }
    setCategorySaving(true);
    try {
      await laboratoryApi.createCategory({ name, description: categoryForm.description || undefined });
      toast.success(`Category "${name}" added`);
      setCategoryForm({ name: "", description: "" });
      await load();
    } catch (createError) {
      toast.error(getApiError(createError));
    } finally {
      setCategorySaving(false);
    }
  };

  const renameCategory = async (category, name) => {
    const next = String(name || "").trim();
    if (!next || next === category.name) return;
    setCategoryBusyId(category._id);
    try {
      await laboratoryApi.updateCategory(category._id, { name: next });
      toast.success("Category renamed. Tests filed under it were updated.");
      await load();
    } catch (renameError) {
      toast.error(getApiError(renameError));
    } finally {
      setCategoryBusyId(null);
    }
  };

  const retireCategory = async (category) => {
    setCategoryBusyId(category._id);
    try {
      await laboratoryApi.deleteCategory(category._id);
      toast.success(`Category "${category.name}" retired`);
      await load();
    } catch (retireError) {
      toast.error(getApiError(retireError));
    } finally {
      setCategoryBusyId(null);
    }
  };

  return (
    <LabPageShell
      title="Tests and reference ranges"
      description="The test catalogue the laboratory performs against, with the reference ranges results are judged by. Reference ranges and turnaround are maintained here; catalogue and pricing changes are shared with Super Admin."
      actions={
        <>
          <button
            type="button"
            onClick={openCategoryManager}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-deept/15 bg-white px-4 py-2.5 text-sm font-bold text-teal-deep transition hover:bg-teal-pale"
          >
            <FolderCog className="size-4" /> Categories
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-deep px-4 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid"
          >
            <Plus className="size-4" /> New test
          </button>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-deept/15 bg-white px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </>
      }
    >
      <LabCard
        title="Test catalogue"
        description={loading ? "Loading catalogue..." : `${visible.length} of ${tests.length} tests shown across ${categories.length} categories.`}
      >
        <div className="mb-5 grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-soft" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search test name, code, category or specimen..."
              aria-label="Search tests"
              className={`${fieldClass} pl-9`}
            />
          </div>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filter by category" className={fieldClass}>
            <option value="">All categories</option>
            {categories.map((option) => <option key={option} value={option}>{option}</option>)}
          </select>
        </div>

        <div className="space-y-6">
          <LabTableState
            as="div"
            loading={loading}
            error={error}
            empty={!visible.length}
            emptyMessage={tests.length ? "No tests match this search." : "No tests have been configured yet."}
          />
          {!loading && !error && grouped.map(([groupName, groupTests]) => (
            <section key={groupName}>
              <div className="mb-3 flex items-center gap-2">
                <FlaskConical className="size-4 text-teal-mid" />
                <h3 className="font-heading text-lg font-bold text-teal-deep">{groupName}</h3>
                <span className="rounded-full bg-teal-pale px-2 py-0.5 text-xs font-bold text-teal-mid">{groupTests.length}</span>
              </div>
              <LabResponsiveList
                rows={groupTests}
                loading={false}
                columns={[
                  {
                    header: "Test",
                    primary: true,
                    render: (test) => (
                      <>
                        <p className="font-semibold text-ink">{test.name}</p>
                        {test.description && <p className="max-w-[240px] truncate text-xs text-ink-soft">{test.description}</p>}
                      </>
                    ),
                  },
                  { header: "Code", render: (test) => <span className="font-mono text-xs text-teal-mid">{test.testCode || "-"}</span> },
                  { header: "Specimen", render: (test) => <span className="text-ink-soft">{test.sampleType || "-"}</span> },
                  { header: "Unit", render: (test) => <span className="text-ink-soft">{test.unit || "-"}</span> },
                  {
                    header: "Reference range",
                    render: (test) => <span className="block max-w-[240px] text-ink-soft">{test.normalRange || (test.referenceRanges || []).join(", ") || "-"}</span>,
                  },
                  { header: "Turnaround", render: (test) => <span className="text-ink-soft">{test.turnaroundTime ? `${test.turnaroundTime} h` : "-"}</span> },
                  { header: "Price", render: (test) => <span className="text-ink-soft">{formatPrice(test.price)}</span> },
                  { header: "Status", render: (test) => <StatusBadge status={test.isActive ? "Active" : "Inactive"} /> },
                ]}
                actions={(test) => (
                  <>
                    <button type="button" onClick={() => openEdit(test)} className="rounded-lg border border-deept/15 px-3 py-2 text-xs font-bold text-teal-deep transition hover:bg-teal-pale">
                      Edit
                    </button>
                    {test.isActive ? (
                      <button type="button" onClick={() => toggleActive(test)} className="rounded-lg border border-coral/40 px-3 py-2 text-xs font-bold text-coral-dark transition hover:bg-coral-pale">
                        Deactivate
                      </button>
                    ) : (
                      <>
                        <button type="button" onClick={() => toggleActive(test)} className="rounded-lg border border-teal-mid/40 px-3 py-2 text-xs font-bold text-teal-deep transition hover:bg-teal-pale">
                          Reactivate
                        </button>
                        <button type="button" onClick={() => remove(test)} className="rounded-lg border border-deept/15 px-3 py-2 text-xs font-bold text-ink-soft transition hover:bg-teal-pale">
                          Delete
                        </button>
                      </>
                    )}
                  </>
                )}
              />
            </section>
          ))}
        </div>
      </LabCard>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.mode === "create" ? "New laboratory test" : "Edit laboratory test"}
        description={editing?.mode === "edit" ? editing.test.name : "Reference ranges here are the default applied to new results."}
        size="lg"
        closeDisabled={saving}
        footer={
          <>
            <button type="button" onClick={() => setEditing(null)} disabled={saving} className="rounded-xl border border-deept/15 px-4 py-2.5 text-sm font-semibold text-teal-deep transition hover:bg-teal-pale">
              Cancel
            </button>
            <button type="submit" form="lab-test-form" disabled={saving} className="rounded-xl bg-teal-deep px-5 py-2.5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50">
              {saving ? "Saving..." : editing?.mode === "create" ? "Create test" : "Save changes"}
            </button>
          </>
        }
      >
        <form id="lab-test-form" onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="test-name" className={labelClass}>Test name</label>
            <input id="test-name" required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="test-code" className={labelClass}>Test code</label>
            <input id="test-code" value={form.testCode} onChange={(event) => setForm({ ...form, testCode: event.target.value.toUpperCase() })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="test-category" className={labelClass}>Category</label>
            <input id="test-category" required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="test-sample-type" className={labelClass}>Specimen type</label>
            <select id="test-sample-type" value={form.sampleType} onChange={(event) => setForm({ ...form, sampleType: event.target.value })} className={fieldClass}>
              {SAMPLE_TYPES.map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="test-unit" className={labelClass}>Default unit</label>
            <input id="test-unit" value={form.unit} onChange={(event) => setForm({ ...form, unit: event.target.value })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="test-turnaround" className={labelClass}>Turnaround (hours)</label>
            <input id="test-turnaround" type="number" min="0" value={form.turnaroundTime} onChange={(event) => setForm({ ...form, turnaroundTime: event.target.value })} className={fieldClass} />
          </div>
          <div>
            <label htmlFor="test-price" className={labelClass}>Price</label>
            <input id="test-price" type="number" min="0" step="0.01" required value={form.price} onChange={(event) => setForm({ ...form, price: event.target.value })} className={fieldClass} />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="test-description" className={labelClass}>Description</label>
            <textarea id="test-description" rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className={`${fieldClass} h-auto py-2.5`} />
          </div>
          <div className="sm:col-span-2">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <p className={labelClass}>Parameters (result analytes)</p>
                <p className="text-xs text-ink-soft">Each parameter becomes a row on result entry, carrying its own unit and reference range so the technician never retypes them.</p>
              </div>
              <button type="button" onClick={addParameter} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-deept/15 px-3 py-2 text-xs font-bold text-teal-deep transition hover:bg-teal-pale">
                <Plus className="size-3.5" /> Add parameter
              </button>
            </div>
            <div className="space-y-3">
              {form.parameters.length === 0 && (
                <p className="rounded-xl border border-dashed border-deept/20 px-4 py-3 text-sm text-ink-soft">No parameters yet. Add at least one so result entry and reports have a reference range to judge against.</p>
              )}
              {form.parameters.map((parameter, index) => (
                <div key={index} className="rounded-2xl border border-deept/10 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">Parameter {index + 1}</p>
                    <button type="button" onClick={() => removeParameter(index)} className="inline-flex items-center gap-1 text-xs font-bold text-coral-dark">
                      <Trash2 className="size-3.5" /> Remove
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className={labelClass} htmlFor={`tp-name-${index}`}>Name</label>
                      <input id={`tp-name-${index}`} value={parameter.parameter} onChange={(event) => updateTestParameter(index, "parameter", event.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`tp-unit-${index}`}>Unit</label>
                      <input id={`tp-unit-${index}`} value={parameter.unit} onChange={(event) => updateTestParameter(index, "unit", event.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`tp-min-${index}`}>Minimum</label>
                      <input id={`tp-min-${index}`} type="number" step="any" value={parameter.min} onChange={(event) => updateTestParameter(index, "min", event.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`tp-max-${index}`}>Maximum</label>
                      <input id={`tp-max-${index}`} type="number" step="any" value={parameter.max} onChange={(event) => updateTestParameter(index, "max", event.target.value)} className={fieldClass} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={labelClass} htmlFor={`tp-range-${index}`}>Reference range text (optional, shown instead of min/max)</label>
                      <input id={`tp-range-${index}`} value={parameter.referenceRangeText} onChange={(event) => updateTestParameter(index, "referenceRangeText", event.target.value)} placeholder="e.g. Negative, or 4.0 - 11.0" className={fieldClass} />
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <div>
                      <label className={labelClass} htmlFor={`tp-mmin-${index}`}>Male min</label>
                      <input id={`tp-mmin-${index}`} type="number" step="any" value={parameter.maleMin} onChange={(event) => updateTestParameter(index, "maleMin", event.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`tp-mmax-${index}`}>Male max</label>
                      <input id={`tp-mmax-${index}`} type="number" step="any" value={parameter.maleMax} onChange={(event) => updateTestParameter(index, "maleMax", event.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`tp-fmin-${index}`}>Female min</label>
                      <input id={`tp-fmin-${index}`} type="number" step="any" value={parameter.femaleMin} onChange={(event) => updateTestParameter(index, "femaleMin", event.target.value)} className={fieldClass} />
                    </div>
                    <div>
                      <label className={labelClass} htmlFor={`tp-fmax-${index}`}>Female max</label>
                      <input id={`tp-fmax-${index}`} type="number" step="any" value={parameter.femaleMax} onChange={(event) => updateTestParameter(index, "femaleMax", event.target.value)} className={fieldClass} />
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft">
                      <input type="checkbox" checked={parameter.isRequired} onChange={(event) => updateTestParameter(index, "isRequired", event.target.checked)} />
                      Required at result entry
                    </label>
                    <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-soft">
                      <input type="checkbox" checked={parameter.isNumeric} onChange={(event) => updateTestParameter(index, "isNumeric", event.target.checked)} />
                      Numeric value
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={categoryManager}
        onClose={() => setCategoryManager(false)}
        title="Test categories"
        description="Rename or retire the departments the catalogue is grouped by."
        size="lg"
      >
        <form onSubmit={createCategory} className="mb-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div>
            <label htmlFor="category-name" className={labelClass}>New category</label>
            <input id="category-name" required value={categoryForm.name} onChange={(event) => setCategoryForm({ ...categoryForm, name: event.target.value })} placeholder="e.g. Haematology" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="category-desc" className={labelClass}>Description (optional)</label>
            <input id="category-desc" value={categoryForm.description} onChange={(event) => setCategoryForm({ ...categoryForm, description: event.target.value })} className={fieldClass} />
          </div>
          <button type="submit" disabled={categorySaving} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-teal-deep px-5 text-sm font-bold text-white transition hover:bg-teal-mid disabled:opacity-50">
            <Plus className="size-4" /> {categorySaving ? "Adding..." : "Add"}
          </button>
        </form>

        <div className="space-y-2">
          {categoryDocs.length === 0 && (
            <p className="rounded-xl border border-dashed border-deept/20 px-4 py-3 text-sm text-ink-soft">No categories yet. Add one above; a category typed into the test form is created automatically.</p>
          )}
          {categoryDocs.map((category) => (
            <div key={category._id} className="flex flex-wrap items-center gap-2 rounded-xl border border-deept/10 p-3">
              <input
                value={categoryDrafts[category._id] ?? category.name}
                onChange={(event) => setCategoryDrafts((current) => ({ ...current, [category._id]: event.target.value }))}
                aria-label={`Rename ${category.name}`}
                className={`${fieldClass} h-10 min-w-[10rem] flex-1`}
              />
              <span className="rounded-full bg-teal-pale px-2 py-0.5 text-xs font-bold text-teal-mid">{category.testCount} test{category.testCount === 1 ? "" : "s"}</span>
              <button
                type="button"
                disabled={categoryBusyId === category._id}
                onClick={() => renameCategory(category, categoryDrafts[category._id])}
                className="rounded-lg border border-deept/15 px-3 py-2 text-xs font-bold text-teal-deep transition hover:bg-teal-pale disabled:opacity-50"
              >
                Save name
              </button>
              <button
                type="button"
                disabled={categoryBusyId === category._id}
                onClick={() => retireCategory(category)}
                className="rounded-lg border border-coral/40 px-3 py-2 text-xs font-bold text-coral-dark transition hover:bg-coral-pale disabled:opacity-50"
              >
                Retire
              </button>
            </div>
          ))}
        </div>
      </Modal>

      <LabTrustNote />
    </LabPageShell>
  );
}
