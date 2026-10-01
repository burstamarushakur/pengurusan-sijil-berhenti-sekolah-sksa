import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const TEMPLATE_URL = '/sijil-template.pdf';
const SIGNATURE_URL = '/tandatangan-gb-clean.png';

const PAGE_HEIGHT = 842;
const VALUE_X = 205;
const TABLE_VALUE_X = 198.75;
const BLACK = rgb(0, 0, 0);

function dateMY(value) {
  if (!value) return '';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  if (!y || !m || !d) return String(value);
  return `${d}/${m}/${y}`;
}

function serial(settings, serialNo) {
  const prefix = (settings?.serial_prefix || settings?.school_code || 'jba5095');
  return `${prefix}/2026/${String(serialNo || 0).padStart(3, '0')}`;
}

function fitText(font, text, maxWidth, preferred = 12, min = 8.5) {
  let size = preferred;
  const value = String(text || '');
  while (size > min && font.widthOfTextAtSize(value, size) > maxWidth) size -= 0.25;
  return size;
}

function drawText(page, font, text, x, topY, opts = {}) {
  const value = String(text || '');
  if (!value) return;
  const preferred = opts.size || 12;
  const size = opts.maxWidth ? fitText(font, value, opts.maxWidth, preferred, opts.minSize || 8.5) : preferred;
  // Coordinates in the source template were measured from the top using PyMuPDF.
  // pdf-lib uses bottom-left coordinates; the +10.3 aligns 12 pt Times New Roman-like baselines.
  const y = PAGE_HEIGHT - topY - 10.3;
  page.drawText(value, { x, y, size, font, color: BLACK });
}

async function loadAssets() {
  const [templateBytes, signatureBytes] = await Promise.all([
    fetch(TEMPLATE_URL).then((r) => r.arrayBuffer()),
    fetch(SIGNATURE_URL).then((r) => r.arrayBuffer()),
  ]);
  return { templateBytes, signatureBytes };
}

async function stampStudent(pdfDoc, templateDoc, templatePageIndex, student, settings, fonts, signatureImage) {
  const [templatePage] = await pdfDoc.copyPages(templateDoc, [templatePageIndex]);
  pdfDoc.addPage(templatePage);
  const page = pdfDoc.getPage(pdfDoc.getPageCount() - 1);
  const bold = fonts.bold;
  const regular = fonts.regular;

  // Serial number: exact box from the master template.
  drawText(page, regular, serial(settings, student.serial_no), 503, 43.3, { size: 10.2, maxWidth: 69, minSize: 7.5 });

  // Main fields (measured from the 2025 AutoCrat output).
  drawText(page, bold, student.full_name, VALUE_X, 255.74, { maxWidth: 365, minSize: 9 });
  drawText(page, bold, dateMY(student.date_of_birth), VALUE_X, 283.34, { maxWidth: 150 });
  drawText(page, bold, student.birth_certificate_no, VALUE_X, 310.94, { maxWidth: 170 });
  drawText(page, bold, student.identification_no, VALUE_X, 338.53, { maxWidth: 180 });
  drawText(page, bold, dateMY(student.school_entry_date), VALUE_X, 366.13, { maxWidth: 150 });
  drawText(page, bold, dateMY(settings?.leaving_date || '2026-12-31'), VALUE_X, 393.73, { maxWidth: 150 });
  drawText(page, bold, 'BAIK', VALUE_X, 421.33, { maxWidth: 100 });

  drawText(page, bold, student.leadership, TABLE_VALUE_X, 482.52, { maxWidth: 371, minSize: 8 });
  drawText(page, bold, student.koku?.club, TABLE_VALUE_X, 507.57, { maxWidth: 371, minSize: 8 });
  drawText(page, bold, student.koku?.sport, TABLE_VALUE_X, 532.62, { maxWidth: 371, minSize: 8 });
  drawText(page, bold, student.koku?.uniform, TABLE_VALUE_X, 557.67, { maxWidth: 371, minSize: 8 });

  // Signature: transparent cleaned image, deliberately wide/short so it fits the space above the name.
  page.drawImage(signatureImage, {
    x: 202,
    y: 162,
    width: 160,
    height: 48,
  });

  drawText(page, bold, dateMY(settings?.leaving_date || '2026-12-31'), 61, 739.60, { maxWidth: 120 });
}

export async function makeStudentPdf(student, settings) {
  const { templateBytes, signatureBytes } = await loadAssets();
  const templateDoc = await PDFDocument.load(templateBytes);
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    bold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
  };
  const signatureImage = await pdfDoc.embedPng(signatureBytes);
  await stampStudent(pdfDoc, templateDoc, 0, student, settings, fonts, signatureImage);
  return pdfDoc.save();
}

export async function makeClassPdf(students, settings) {
  const { templateBytes, signatureBytes } = await loadAssets();
  const templateDoc = await PDFDocument.load(templateBytes);
  const pdfDoc = await PDFDocument.create();
  const fonts = {
    bold: await pdfDoc.embedFont(StandardFonts.TimesRomanBold),
    regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
  };
  const signatureImage = await pdfDoc.embedPng(signatureBytes);

  for (const student of students) {
    await stampStudent(pdfDoc, templateDoc, 0, student, settings, fonts, signatureImage);
  }
  return pdfDoc.save();
}

export function downloadBytes(bytes, filename) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function previewBytes(bytes) {
  const blob = new Blob([bytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
