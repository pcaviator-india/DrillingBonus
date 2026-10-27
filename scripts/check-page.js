// Script to fix page.tsx - remove old return statement
const fs = require('fs');
const path = 'c:/Recon/DrillingBonus/src/app/(dashboard)/comparisons/page.tsx';
const content = fs.readFileSync(path, 'utf8');
const lines = content.split('\n');

// Keep lines 1-103 (index 0-102), remove 104-105 (index 103-104)
const newLines = lines.slice(0, 103);
const newContent = newLines.join('\n');

fs.writeFileSync(path, newContent, 'utf8');
console.log('Fixed! New total lines:', newLines.length);
console.log('Last 5 lines:');
newLines.slice(-5).forEach((line, i) => {
  console.log(`${newLines.length - 5 + i + 1}: ${line.substring(0, 80)}`);
});