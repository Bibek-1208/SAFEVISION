const path = require('path');
const PDFDocument = require(path.resolve(__dirname, '../server/node_modules/pdfkit'));
const mongoose = require(path.resolve(__dirname, '../server/node_modules/mongoose'));
const fs = require('fs');

async function run() {
  await mongoose.connect('mongodb://localhost:27017/safevision?replicaSet=rs0');
  const db = mongoose.connection.db;
  const inc = await db.collection('incidents').findOne({ evidenceImage: { $regex: '^data:image' } });
  if (inc && inc.evidenceImage) {
    const base64Data = inc.evidenceImage.split(',')[1];
    const buf = Buffer.from(base64Data, 'base64');
    console.log('Found incident with base64 evidence! Size in bytes:', buf.length);
    const doc = new PDFDocument();
    const ws = fs.createWriteStream('./scratch/test_evidence_buf.pdf');
    doc.pipe(ws);
    doc.text('Testing Base64 Evidence Embedding: ' + inc.incidentId);
    doc.image(buf, { width: 250 });
    doc.end();
    ws.on('finish', () => {
      console.log('Successfully generated test PDF with real base64 evidence image! File size:', fs.statSync('./scratch/test_evidence_buf.pdf').size);
    });
  } else {
    console.log('No base64 evidence found');
  }
  await mongoose.disconnect();
}
run();
