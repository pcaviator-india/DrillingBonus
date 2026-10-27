const ExcelJS = require('exceljs');
const workbook = new ExcelJS.Workbook();
workbook.readFile('c:\\Recon\\DrillingBonus\\ManualAdjustmentFile\\Final Calculation Bonus sep 2026.xlsm').then(async wb => {
  const ws = wb.worksheets[0];
  console.log('=== Checking rows with differences ===');
  let diffCount = 0, zeroDiffCount = 0;
  const cargos = new Set();
  ws.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      const c7 = row.getCell(7).value;
      const c8 = row.getCell(8).value;
      const c9 = row.getCell(9).value;
      const c10 = row.getCell(10).value;
      const c6 = row.getCell(6).value;
      const diffVal = row.getCell(11).value;
      cargos.add(String(c6).trim());
      if (c7 !== c8 || (typeof c9 === 'number' && typeof c10 === 'number' && c9 !== c10)) {
        diffCount++;
        if (diffCount <= 10) {
          console.log('R' + rowNumber + ': Cargo=' + c6 + ' | WDays=' + c7 + ' PDays=' + c8 + ' | WBonus=' + c9 + ' PBonus=' + c10 + ' | Diff=' + String(diffVal ?? '').substring(0, 60));
        }
      } else {
        zeroDiffCount++;
      }
    }
  });
  console.log('Total rows with day/bonus differences: ' + diffCount);
  console.log('Total rows with zero diff (matching): ' + zeroDiffCount);
  console.log('Unique cargos: ' + [...cargos].sort().join(', '));
  console.log('Total rows: ' + (ws.rowCount - 1));
});
