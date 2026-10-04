/**
 * CSV and SpreadsheetML builders for the report exports (FR-AD-05).
 *
 * These exist instead of a spreadsheet library for two reasons: the CSV grammar
 * is a hundred lines, and the dependency-free path means an export cannot break
 * because of a transitive package update. Both formats are produced here rather
 * than in a controller so the API response and a downloaded file are guaranteed
 * to contain the same values.
 */

/**
 * Neutralises spreadsheet formula injection.
 *
 * A cell beginning with =, +, - or @ is executed by Excel, LibreOffice and Google
 * Sheets when the file is opened. Patient names, clinical notes and invoice notes
 * are all free text an attacker could control, so `=HYPERLINK(...)` in a
 * "Reason for cancellation" column would run on the machine of whoever opens the
 * export. Prefixing an apostrophe forces the cell to be read as text.
 */
const neutraliseCell = (value) => {
  if (value === null || value === undefined) return "";
  let text = String(value);

  // Strip control characters that would corrupt the row/column count.
  // eslint-disable-next-line no-control-regex
  text = text.replace(/[\u0000-\u001f\u007f]/g, " ");

  if (/^[=+\-@\t\r]/.test(text)) return `'${text}`;
  return text;
};

/** Quotes a field and doubles any embedded quote, per RFC 4180. */
const quoteField = (text) => {
  const value = neutraliseCell(text);
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
};

/**
 * Builds a CSV document.
 * @param {Array<{label: string, key: string}>} columns
 * @param {Array<object>} rows
 * @returns {string}
 */
const buildCsv = (columns, rows) => {
  const header = columns.map((column) => quoteField(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => quoteField(row[column.key])).join(","));
  // A leading BOM makes Excel open UTF-8 names correctly on Windows instead of
  // rendering "Jos\u00e9" as mojibake.
  return `\uFEFF${[header, ...body].join("\r\n")}\r\n`;
};

/** The XML escape for SpreadsheetML text nodes. */
const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]/g, " ");

/**
 * Builds a SpreadsheetML 2003 workbook - the XML `.xls` format Excel, LibreOffice
 * and Google Sheets all open natively.
 *
 * Every cell is written as an inline string. That matters here: the equivalent
 * `<f>` formula element would re-introduce the formula-injection problem above,
 * and every exported column in this system is text or a number the server
 * computed.
 */
const buildSpreadsheet = ({ sheetName = "Report", columns, rows }) => {
  const headerCells = columns
    .map(
      (column) =>
        `<Cell ss:StyleID="head"><Data ss:Type="String">${escapeXml(column.label)}</Data></Cell>`
    )
    .join("");

  const bodyRows = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const value = row[column.key];
          const isNumber = column.numeric && value !== null && value !== undefined && value !== "";
          const text = isNumber ? String(value) : escapeXml(value);
          return `<Cell><Data ss:Type="${isNumber ? "Number" : "String"}">${text}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="head"><Font ss:Bold="1"/></Style>
  </Styles>
  <Worksheet ss:Name="${escapeXml(sheetName).slice(0, 31)}">
    <Table>
      <Row>${headerCells}</Row>
      ${bodyRows}
    </Table>
  </Worksheet>
</Workbook>`;
};

/** A filesystem-safe download name, e.g. `daily-report-2026-04-12.csv`. */
const safeFileName = (base, extension) => {
  const stem = String(base || "report")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${stem || "report"}.${extension}`;
};

module.exports = { buildCsv, buildSpreadsheet, neutraliseCell, escapeXml, safeFileName };