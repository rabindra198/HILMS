const PDFDocument = require("pdfkit");
const { safeFileName } = require("./reportExport");

/**
 * Generic tabular PDF for the administrative reports (FR-AD-05).
 *
 * WHY a generic builder and not one document per report: the daily, monthly,
 * patient, revenue and laboratory reports are all "a title, a key-figure strip and
 * a table". Five near-identical PDF functions drift within a week - different
 * margins, different header colours, one of them forgetting the page footer. One
 * builder that takes `{ title, meta, figures, columns, rows }` keeps them all
 * identical, and adding a report is then a data change, not a new renderer.
 *
 * Reuses the palette from `prescriptionPdf` so an exported report is visually part
 * of the same system as the clinical documents.
 */

const TEAL = "#1f4a40";
const TEAL_MID = "#2e7c67";
const INK = "#25332e";
const MUTED = "#5b6b65";
const LINE = "#d9e2dd";
const BAND = "#dcefe7";

const PAGE_MARGIN = 44;
const CONTENT_WIDTH = 545;
const BOTTOM_LIMIT = 760;

/**
 * Distributes the available width across columns.
 *
 * A column may ask for a relative `weight` instead of an absolute width, so a
 * report adding a column does not have to re-measure the whole table.
 */
const resolveWidths = (columns) => {
  const fixed = columns.reduce((sum, column) => sum + (column.width || 0), 0);
  const flexible = columns.filter((column) => !column.width);
  const remaining = Math.max(120, CONTENT_WIDTH - fixed);

  const totalWeight = flexible.reduce((sum, column) => sum + (column.weight || 1), 0) || 1;

  return columns.map((column) => {
    if (column.width) return column.width;
    return Math.floor(remaining * ((column.weight || 1) / totalWeight));
  });
};

const formatCell = (value) => {
  if (value === null || value === undefined || value === "") return "-";
  if (value instanceof Date) return value.toLocaleDateString("en-GB");
  return String(value);
};

/** Adds a page when `needed` pixels would not fit, and returns the new top. */
const ensureRoom = (doc, y, needed) => {
  if (y + needed <= BOTTOM_LIMIT) return y;
  doc.addPage();
  return PAGE_MARGIN;
};

/**
 * Renders one report to a PDF Buffer.
 *
 * @param {object} report
 * @param {string} report.title
 * @param {Array<{label: string, value: any}>} [report.meta]      subtitle facts
 * @param {Array<{label: string, value: any}>} [report.figures]   key figures strip
 * @param {Array<{label: string, key: string, width?: number, weight?: number, align?: string}>} report.columns
 * @param {Array<object>} report.rows
 * @param {string} [report.footnote]
 * @returns {Promise<Buffer>}
 */
const buildReportPdf = (report) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const columns = report.columns || [];
    const widths = resolveWidths(columns);

    // ---- Masthead ----
    doc.rect(PAGE_MARGIN, PAGE_MARGIN, CONTENT_WIDTH, 58).fill(TEAL);
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(16).text("HILMS", PAGE_MARGIN + 16, PAGE_MARGIN + 12);
    doc.font("Helvetica").fontSize(8.5).text(
      "Hospital Information & Laboratory Management System",
      PAGE_MARGIN + 16,
      PAGE_MARGIN + 33
    );
    doc.font("Helvetica-Bold").fontSize(12).text(report.title || "Report", PAGE_MARGIN + 280, PAGE_MARGIN + 14, {
      width: 249,
      align: "right",
    });
    doc.font("Helvetica").fontSize(8).fillColor("#cfe3da").text(
      `Generated ${new Date().toLocaleString("en-GB")}`,
      PAGE_MARGIN + 280,
      PAGE_MARGIN + 33,
      { width: 249, align: "right" }
    );

    let y = PAGE_MARGIN + 74;

    // ---- Meta facts ----
    if (report.meta?.length) {
      const perRow = 3;
      const cellWidth = Math.floor(CONTENT_WIDTH / perRow);

      report.meta.forEach((entry, index) => {
        const column = index % perRow;
        const row = Math.floor(index / perRow);
        const x = PAGE_MARGIN + column * cellWidth;
        const rowY = y + row * 30;

        doc.font("Helvetica").fontSize(7.5).fillColor(MUTED).text(String(entry.label).toUpperCase(), x, rowY, {
          width: cellWidth - 8,
        });
        doc.font("Helvetica-Bold").fontSize(10).fillColor(INK).text(formatCell(entry.value), x, rowY + 10, {
          width: cellWidth - 8,
        });
      });

      y += Math.ceil(report.meta.length / perRow) * 30 + 8;
    }

    // ---- Key figures ----
    if (report.figures?.length) {
      const perRow = Math.min(4, report.figures.length);
      const cellWidth = Math.floor(CONTENT_WIDTH / perRow);
      const rows = Math.ceil(report.figures.length / perRow);

      report.figures.forEach((entry, index) => {
        const column = index % perRow;
        const row = Math.floor(index / perRow);
        const x = PAGE_MARGIN + column * cellWidth;
        const rowY = y + row * 42;

        doc.rect(x, rowY, cellWidth - 8, 36).fill(BAND);
        doc.font("Helvetica").fontSize(7.5).fillColor(TEAL_MID).text(String(entry.label).toUpperCase(), x + 8, rowY + 6, {
          width: cellWidth - 22,
        });
        doc.font("Helvetica-Bold").fontSize(13).fillColor(TEAL).text(formatCell(entry.value), x + 8, rowY + 17, {
          width: cellWidth - 22,
        });
      });

      y += rows * 42 + 10;
    }

    // ---- Table ----
    if (columns.length) {
      const drawHeader = (top) => {
        doc.rect(PAGE_MARGIN, top, CONTENT_WIDTH, 20).fill("#eef4f1");
        doc.font("Helvetica-Bold").fontSize(8).fillColor(TEAL);

        let x = PAGE_MARGIN + 6;
        columns.forEach((column, index) => {
          doc.text(String(column.label).toUpperCase(), x, top + 6, {
            width: widths[index] - 10,
            align: column.align || "left",
          });
          x += widths[index];
        });

        return top + 24;
      };

      y = drawHeader(y);

      (report.rows || []).forEach((row, rowIndex) => {
        const cells = columns.map((column) => formatCell(row[column.key]));
        const tallest = cells.reduce((max, cell, index) => {
          const height = doc.font("Helvetica").fontSize(8.5).heightOfString(cell, { width: widths[index] - 10 });
          return Math.max(max, height);
        }, 0);

        const rowHeight = Math.max(18, tallest + 8);

        if (y + rowHeight > BOTTOM_LIMIT) {
          doc.addPage();
          y = drawHeader(PAGE_MARGIN);
        }

        if (rowIndex % 2 === 1) {
          doc.rect(PAGE_MARGIN, y - 2, CONTENT_WIDTH, rowHeight).fill("#f8fbfa");
        }

        let x = PAGE_MARGIN + 6;
        doc.font("Helvetica").fontSize(8.5).fillColor(INK);
        columns.forEach((column, index) => {
          doc.text(cells[index], x, y, {
            width: widths[index] - 10,
            align: column.align || "left",
          });
          x += widths[index];
        });

        y += rowHeight;
      });

      if (!report.rows?.length) {
        doc.font("Helvetica-Oblique").fontSize(9).fillColor(MUTED).text(
          "No records matched this report.",
          PAGE_MARGIN + 6,
          y + 4
        );
        y += 18;
      }

      y += 6;
    }

    if (report.footnote) {
      y = ensureRoom(doc, y, 26);
      doc.font("Helvetica-Oblique").fontSize(8).fillColor(MUTED).text(report.footnote, PAGE_MARGIN, y, {
        width: CONTENT_WIDTH,
      });
    }

    // ---- Footer on every page ----
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(7.5).fillColor(MUTED);
      doc.text(
        "Generated by HILMS. Figures reflect records stored in the system at the time of export.",
        PAGE_MARGIN,
        790,
        { width: 420 }
      );
      doc.text(`Page ${i - range.start + 1} of ${range.count}`, PAGE_MARGIN + 430, 790, {
        width: 115,
        align: "right",
      });
    }

    doc.end();
  });

/** `daily-report-2026-04-12.pdf` */
const reportFileName = (base, extension) => safeFileName(base, extension);

module.exports = { buildReportPdf, reportFileName, resolveWidths, formatCell };