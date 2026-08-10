const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

/**
 * Renders a simple titled table to a PDF buffer.
 * columns: [{ key, label, width? }], rows: [{ [key]: value }]
 */
function renderTablePdf({
  title, subtitle, columns, rows,
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(16).text('VoucherHub', { align: 'center' });
    doc.fontSize(13).text(title, { align: 'center' });
    if (subtitle) doc.fontSize(10).fillColor('#555').text(subtitle, { align: 'center' });
    doc.moveDown(1.5);

    const startX = 40;
    const totalWidth = 515;
    const colWidth = totalWidth / columns.length;

    doc.fontSize(10).fillColor('#000');
    columns.forEach((c, i) => doc.text(c.label, startX + i * colWidth, doc.y, { width: c.width || colWidth, continued: i < columns.length - 1 }));
    doc.moveDown(0.5);
    doc.moveTo(startX, doc.y).lineTo(startX + totalWidth, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.3);

    rows.forEach((row) => {
      const y = doc.y;
      doc.fontSize(9).fillColor('#000');
      columns.forEach((c, i) => doc.text(String(row[c.key] ?? ''), startX + i * colWidth, y, { width: c.width || colWidth }));
      doc.moveDown(0.7);
      if (doc.y > 780) doc.addPage();
    });

    if (!rows.length) doc.fontSize(10).fillColor('#888').text('Tidak ada data untuk periode ini.');

    doc.end();
  });
}

/**
 * Renders a simple titled table to an .xlsx buffer.
 * columns: [{ key, label, width? }], rows: [{ [key]: value }]
 */
async function renderTableExcel({
  title, subtitle, columns, rows, sheetName = 'Laporan',
}) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName);

  sheet.mergeCells(1, 1, 1, columns.length);
  sheet.getCell(1, 1).value = title;
  sheet.getCell(1, 1).font = { bold: true, size: 14 };

  if (subtitle) {
    sheet.mergeCells(2, 1, 2, columns.length);
    sheet.getCell(2, 1).value = subtitle;
  }

  sheet.addRow([]);
  const headerRow = sheet.addRow(columns.map((c) => c.label));
  headerRow.font = { bold: true };
  rows.forEach((row) => sheet.addRow(columns.map((c) => row[c.key] ?? '')));

  sheet.columns = columns.map((c) => ({ width: c.excelWidth || 18 }));

  return workbook.xlsx.writeBuffer();
}

module.exports = { renderTablePdf, renderTableExcel };
