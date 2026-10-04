const crypto = require("crypto");
const bwipjs = require("bwip-js");

/**
 * Specimen labelling (SRS FR-LB-03).
 *
 * The Sample ID and the machine-readable codes are generated here, on the
 * server, so a client can never choose the identifier a physical tube is
 * labelled with.
 *
 * PHI rule (SRS FR-LB-03): neither code may carry patient identity. A specimen
 * label is read aloud at the bench, photographed, and stuck on a bag that travels
 * outside the building, so the payload is limited to the sample identifier plus a
 * short integrity digest. A label scanned at specimen receipt resolves back to the
 * sample through the database, never by decoding a name off the tube.
 */

const LABEL_DOMAIN = "HILMS-LAB";

/** Strips a sample ID down to the characters Code 128 can encode losslessly. */
const normalizeForCode128 = (value) => String(value || "").replace(/[^\x20-\x7E]/g, "").trim();

/**
 * Builds the non-PHI payload carried by the QR code.
 *
 * Shape: `HILMS-LAB:<sampleId>:<checksum>`
 *
 * The checksum is a truncated SHA-256 over the sample id plus the server's
 * labelling secret. It is not a security control - anyone holding a label can
 * read it - its purpose is to detect a mis-transcribed or mis-read code before a
 * result is filed against the wrong specimen.
 */
const buildQrPayload = (sampleId, secret = process.env.SAMPLE_LABEL_SECRET || "hilms-lab-label") => {
  const id = String(sampleId || "").trim().toUpperCase();
  if (!id) return "";
  const checksum = crypto.createHash("sha256").update(`${secret}:${id}`).digest("hex").slice(0, 8).toUpperCase();
  return `${LABEL_DOMAIN}:${id}:${checksum}`;
};

/**
 * Recomputes the checksum from a decoded payload.
 *
 * Used by the specimen-receipt lookup so a mis-copied code is reported as a bad
 * label rather than silently resolving to the wrong sample.
 */
const verifyQrPayload = (payload, secret = process.env.SAMPLE_LABEL_SECRET || "hilms-lab-label") => {
  const raw = String(payload || "").trim().toUpperCase();
  const parts = raw.split(":");
  if (parts.length !== 3 || parts[0] !== LABEL_DOMAIN) return { valid: false, sampleId: "", reason: "This is not a HILMS specimen label." };
  const [, sampleId, checksum] = parts;
  if (!sampleId || !checksum) return { valid: false, sampleId, reason: "This specimen label is incomplete." };
  const expected = crypto.createHash("sha256").update(`${secret}:${sampleId}`).digest("hex").slice(0, 8).toUpperCase();
  if (expected !== checksum) {
    return { valid: false, sampleId, reason: "This specimen label failed its integrity check. Please re-label the tube." };
  }
  return { valid: true, sampleId, reason: "" };
};

/** Extracts the sample id from a scanned or typed barcode/QR payload. */
const parseQrPayload = (payload) => {
  const raw = String(payload || "").trim().toUpperCase();
  const direct = normalizeForCode128(raw);
  if (!direct) return "";
  if (direct.startsWith(`${LABEL_DOMAIN}:`)) {
    const [, sampleId] = direct.split(":");
    return sampleId || "";
  }
  return direct;
};

const svgGuard = (svg) => {
  const text = String(svg || "");
  // bwip-js emits a static path only, but the output is served as image/svg+xml
  // in a browser, so strip anything that could execute if that ever changed.
  if (!text.startsWith("<svg") || /<script|onload=|javascript:|<foreignObject/i.test(text)) {
    const error = new Error("Unable to render the specimen code");
    error.statusCode = 500;
    throw error;
  }
  return text;
};

/** Code 128 barcode, the symbology a bench label printer expects. */
const renderBarcodeSvg = (text, { scale = 2, height = 12 } = {}) => {
  const value = normalizeForCode128(text);
  if (!value) {
    const error = new Error("A barcode value is required");
    error.statusCode = 422;
    throw error;
  }
  return svgGuard(bwipjs.toSVG({
    bcid: "code128",
    text: value,
    scale,
    height,
    includetext: true,
    textxalign: "center",
    textfont: "Inconsolata",
    textsize: 10,
    padding: 6,
    paddingtop: 4,
  }));
};

/** QR code, for the phone-camera scan path used when no printer is available. */
const renderQrSvg = (text, { scale = 3 } = {}) => {
  const value = normalizeForCode128(text);
  if (!value) {
    const error = new Error("A QR value is required");
    error.statusCode = 422;
    throw error;
  }
  return svgGuard(bwipjs.toSVG({
    bcid: "qrcode",
    text: value,
    scale,
    padding: 4,
    // Error correction M survives a scuffed or creased label without inflating
    // the module count past what a phone camera resolves from 30 cm.
    eclevel: "M",
  }));
};

/**
 * Everything a specimen label needs, in one call.
 *
 * Both codes carry the same payload, so a label printed with a barcode printer
 * and a label shown on screen as a QR are interchangeable.
 */
const buildSpecimenCodes = (sampleId) => {
  const qrPayload = buildQrPayload(sampleId);
  const barcodeValue = `BC-${normalizeForCode128(sampleId)}`;
  return {
    qrPayload,
    barcode: barcodeValue,
    barcodeSvg: renderBarcodeSvg(barcodeValue),
    qrSvg: renderQrSvg(qrPayload),
  };
};

module.exports = {
  LABEL_DOMAIN,
  buildQrPayload,
  buildSpecimenCodes,
  parseQrPayload,
  renderBarcodeSvg,
  renderQrSvg,
  verifyQrPayload,
};
