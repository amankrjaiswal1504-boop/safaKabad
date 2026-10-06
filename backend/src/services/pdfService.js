// PDF documents (receipts, certificates, reports) with PDFKit. The built-in
// Helvetica font has no rupee glyph, so amounts are written as "Rs.".
const PDFDocument = require('pdfkit');
const { TIMEZONE } = require('../config/locale');

const BRAND = '#0F6247';
const INK = '#171F1C';
const MUTED = '#59625E';

const rs = (n) => `Rs. ${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const date = (d) => new Date(d).toLocaleDateString('en-GB', { timeZone: TIMEZONE, day: 'numeric', month: 'long', year: 'numeric' });

function toBuffer(build) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Producer: 'ScrapMate' } });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

function header(doc, title, subtitle) {
  doc.rect(50, 50, 28, 28).fill(BRAND);
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(16).text('S', 50, 56, { width: 28, align: 'center' });
  doc.fillColor(INK).fontSize(18).text('ScrapMate', 86, 52);
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('Doorstep scrap pickup & recycling', 86, 72);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(title, 300, 52, { width: 245, align: 'right' });
  if (subtitle) doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(subtitle, 300, 72, { width: 245, align: 'right' });
  doc.moveTo(50, 98).lineTo(545, 98).strokeColor('#E4E1D8').stroke();
  doc.y = 115;
}

function footer(doc, text) {
  doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(text, 50, 770, { width: 495, align: 'center' });
}

function keyValues(doc, rows) {
  rows.forEach(([k, v]) => {
    const y = doc.y;
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(k, 50, y, { width: 150 });
    doc.fillColor(INK).text(v || '-', 200, y, { width: 345 });
    doc.moveDown(0.4);
  });
}

function receiptPdf(pickup) {
  return toBuffer((doc) => {
    header(doc, pickup.type === 'donation' ? 'Donation receipt' : 'Payment receipt', `${pickup.pickupId} · ${date(pickup.completedAt || pickup.scheduledDate)}`);
    const a = pickup.addressSnapshot || {};
    keyValues(doc, [
      ['Customer', pickup.customer?.name],
      ['Phone', pickup.contactPhone],
      ['Address', [a.houseNumber, a.street, a.locality, a.city, a.pinCode].filter(Boolean).join(', ')],
      ['Collector', pickup.collector?.name],
      ['Payment method', pickup.payout?.method ? pickup.payout.method.replace('_', ' ') : '-'],
      ['Payment status', pickup.payout?.status || '-'],
    ]);
    doc.moveDown();
    const top = doc.y;
    const cols = [50, 250, 340, 430];
    doc.rect(50, top, 495, 22).fill('#F1EFE8');
    doc.fillColor(INK).font('Helvetica-Bold').fontSize(10);
    ['Item', 'Weight / qty', 'Rate', 'Amount'].forEach((h, i) => doc.text(h, cols[i] + 6, top + 6, { width: i === 3 ? 109 : 90, align: i === 3 ? 'right' : 'left' }));
    let y = top + 28;
    doc.font('Helvetica').fontSize(10);
    pickup.items.forEach((it) => {
      doc.fillColor(INK).text(it.itemName + (it.condition ? ` (${it.condition.replace('_', ' ')})` : ''), cols[0] + 6, y, { width: 190 });
      doc.text(`${it.actualWeight ?? '-'} ${it.unit || 'kg'}`, cols[1] + 6, y, { width: 90 });
      doc.text(it.rateApplied != null ? rs(it.rateApplied) : '-', cols[2] + 6, y, { width: 90 });
      doc.text(it.subtotal != null ? rs(it.subtotal) : '-', cols[3] + 6, y, { width: 109, align: 'right' });
      y += 22;
      doc.moveTo(50, y - 6).lineTo(545, y - 6).strokeColor('#E4E1D8').stroke();
    });
    y += 4;
    const line = (label, value, bold) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 12 : 10).fillColor(INK);
      doc.text(label, 300, y, { width: 130 });
      doc.text(value, 430, y, { width: 115, align: 'right' });
      y += bold ? 22 : 18;
    };
    line('Subtotal', rs(pickup.finalAmount));
    if (pickup.bonusAmount) line(`Bonus${pickup.coupon?.code ? ` (${pickup.coupon.code})` : ''}`, `+ ${rs(pickup.bonusAmount)}`);
    line('Total paid', rs((pickup.finalAmount || 0) + (pickup.bonusAmount || 0)), true);
    doc.y = y + 20;
    doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(
      'Weights were recorded on a digital scale at your doorstep. Rates are the ScrapMate rates for your city on the pickup date.',
      50,
      doc.y,
      { width: 495 }
    );
    footer(doc, 'Thank you for recycling with ScrapMate. This is a computer-generated receipt.');
  });
}

function certificatePdf({ title, certificateNo, recipient, lines, statement, issuedOn }) {
  return toBuffer((doc) => {
    doc.rect(30, 30, 535, 782).lineWidth(2).strokeColor(BRAND).stroke();
    header(doc, title, `Certificate no. ${certificateNo}`);
    doc.moveDown(2);
    doc.font('Helvetica').fontSize(11).fillColor(MUTED).text('This is to certify that', { align: 'center' });
    doc.moveDown(0.5);
    doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(recipient, { align: 'center' });
    doc.moveDown(0.8);
    doc.font('Helvetica').fontSize(11).fillColor(INK).text(statement, { align: 'center', width: 495 });
    doc.moveDown(1.5);
    keyValues(doc, lines);
    doc.moveDown(3);
    doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`Issued on ${date(issuedOn || new Date())}`, 50, doc.y);
    doc.text('Authorised signatory, ScrapMate Recycling Operations', 300, doc.y - 12, { width: 245, align: 'right' });
    footer(doc, 'Verify this certificate by contacting ScrapMate support with the certificate number.');
  });
}

function reportPdf({ title, subtitle, sections }) {
  return toBuffer((doc) => {
    header(doc, title, subtitle);
    sections.forEach((s) => {
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(s.heading, 50);
      doc.moveDown(0.3);
      if (s.rows) keyValues(doc, s.rows);
      if (s.table) {
        s.table.forEach((row) => {
          doc.font('Helvetica').fontSize(9).fillColor(INK).text(row.join('   |   '), 50, doc.y, { width: 495 });
        });
      }
    });
    footer(doc, `Generated ${new Date().toLocaleString('en-GB', { timeZone: TIMEZONE })} (Nepal time)`);
  });
}

module.exports = { receiptPdf, certificatePdf, reportPdf, rs };
