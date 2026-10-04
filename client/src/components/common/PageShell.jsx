import { ShieldCheck } from "lucide-react";

/**
 * Shared chrome for every module's list screens (Doctor, Laboratory, ...).
 *
 * These pages deliberately render NO app header bar. The sidebar already carries
 * identity, the account links (Profile / Notifications / Settings) and Logout, so
 * a second bar above the content only repeated the same controls and pushed the
 * queue off the screen. `DashboardLayout` still supplies the floating mobile menu
 * button, so navigation is unaffected on phones.
 */
export function PageShell({ title, description, actions, children }) {
  return (
    <div className="min-h-full">
      <div className="mx-auto w-full max-w-[1440px] space-y-6 px-1 py-2 sm:space-y-8 sm:px-2 lg:px-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-extrabold leading-tight text-teal-deep sm:text-3xl">{title}</h1>
            {description && <p className="mt-1 text-sm font-medium text-ink-soft sm:text-base">{description}</p>}
          </div>
          {/* Controls stack full width on a phone rather than shrinking into
              unusable slivers, then wrap freely from `sm` upwards. */}
          {actions && (
            <div className="grid w-full grid-cols-1 gap-2 [&>*]:w-full sm:flex sm:w-auto sm:flex-wrap sm:items-center [&>*]:sm:w-auto">
              {actions}
            </div>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

export function PageCard({ title, description, children, action, className = "", bodyClassName = "" }) {
  return (
    <section className={`overflow-hidden rounded-2xl border border-deept/10 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex flex-col gap-3 border-b border-deept/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="font-heading text-lg font-bold text-teal-deep sm:text-xl">{title}</h2>}
            {description && <p className="mt-1 text-sm text-ink-soft">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className={`p-4 sm:p-6 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/**
 * Empty/loading/error slot used by every list.
 *
 * `as` keeps the markup valid wherever it is placed: a table body needs a `tr`,
 * while a card that lists rows with `div`s must not receive one. The browser
 * silently reparents a stray `tr`, which drops the row out of the table.
 */
export function TableState({ as: Tag = "tr", colSpan, loading, error, empty, emptyMessage = "Nothing to show yet." }) {
  const className = "px-5 py-10 text-center text-sm";
  // `td` only makes sense inside a table; a card that lists rows with `div`s gets
  // the message directly.
  const body = (tone, text) =>
    Tag === "tr" ? <td colSpan={colSpan} className={`${className} ${tone}`}>{text}</td> : <div className={`${className} ${tone}`}>{text}</div>;

  if (loading) return <Tag>{body("text-ink-soft", "Loading...")}</Tag>;
  if (error) return <Tag>{body("text-coral-dark", error)}</Tag>;
  if (empty) return <Tag>{body("text-ink-soft", emptyMessage)}</Tag>;
  return null;
}

/**
 * One dataset, two layouts: a real table from `md` upwards and a stacked card
 * list on phones.
 *
 * Wrapping a 1000px table in a horizontal scroller is technically "responsive"
 * but unusable on a phone, where every column but the first sits off-screen and
 * the row has no visible context. `columns` is declared once and both layouts
 * read from it, so the two can never drift apart.
 *
 * `primary` columns become the card heading and drop their label; `hideOnMobile`
 * columns are desktop-only (for values that are already shown elsewhere on the
 * card). `actions` renders the row's buttons under the card fields.
 */
export function ResponsiveList({
  columns,
  rows,
  rowKey = (row) => row._id,
  loading,
  error,
  empty,
  emptyMessage = "Nothing to show yet.",
  loadingMessage,
  actions,
}) {
  const state = { loading, error, empty, emptyMessage, loadingMessage };

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b-2 border-deept/10 bg-softteal/50">
              {columns.map((column) => (
                <th
                  key={column.header}
                  scope="col"
                  className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-ink-soft ${column.align === "right" ? "text-right" : "text-left"}`}
                >
                  {column.header}
                </th>
              ))}
              {actions && (
                <th scope="col" className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-deept/5">
            <TableState {...state} colSpan={columns.length} />
            {!loading && !error && rows.map((row) => (
              <tr key={rowKey(row)} className="transition-colors hover:bg-teal-pale/30">
                {columns.map((column) => (
                  <td key={column.header} className={`px-4 py-3 align-top ${column.align === "right" ? "text-right" : ""}`}>
                    {column.render(row)}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-3 text-right align-top">
                    <div className="flex flex-wrap justify-end gap-2">{actions(row)}</div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        <TableState {...state} as="div" />
        {!loading && !error && rows.map((row) => {
          const primary = columns.filter((column) => column.primary);
          const secondary = columns.filter((column) => !column.primary && !column.hideOnMobile);
          return (
            <article key={rowKey(row)} className="rounded-2xl border border-deept/10 p-4">
              {primary.map((column) => (
                <div key={column.header} className={primary.length > 1 ? "mt-2 first:mt-0" : ""}>
                  {primary.length > 1 && (
                    <p className="text-xs font-bold uppercase tracking-wider text-ink-soft">{column.header}</p>
                  )}
                  <div className="text-sm">{column.render(row)}</div>
                </div>
              ))}
              <dl className="mt-3 space-y-2 border-t border-deept/5 pt-3">
                {secondary.map((column) => (
                  <div key={column.header} className="flex flex-wrap items-baseline justify-between gap-2">
                    <dt className="text-xs font-bold uppercase tracking-wider text-ink-soft">{column.header}</dt>
                    <dd className="min-w-0 text-right text-sm">{column.render(row)}</dd>
                  </div>
                ))}
              </dl>
              {actions && <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-deept/5 pt-3">{actions(row)}</div>}
            </article>
          );
        })}
      </div>
    </>
  );
}

/**
 * The reassurance line under a clinical list.
 *
 * `message` is overridable per module, but the wording has to stay honest: it
 * describes the access model (only an authorized care team reads these records),
 * not a promise that the data is encrypted end to end.
 */
export function TrustNote({ message = "Records are handled securely and shared only with authorized care teams." }) {
  return (
    <p className="flex items-center gap-2 text-xs text-ink-soft">
      <ShieldCheck className="size-4 shrink-0 text-teal-mid" />
      {message}
    </p>
  );
}
