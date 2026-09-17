require('dotenv').config();
const pdfParse = require('pdf-parse');
const fs = require('fs');
pdfParse(fs.readFileSync('/home/simplyrms/d_drive_mount/Openclaw work/HBL Data/Malaika- Fraud case.pdf'))
  .then(d => console.log(d.text.substring(0, 2000)))
  .catch(console.error);
