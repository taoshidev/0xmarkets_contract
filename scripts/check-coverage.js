/*
 Simple LCOV coverage gate for solidity-coverage output.
 Checks overall line coverage >= 80%
 and per-file coverage for DepositHandler.sol and WithdrawalHandler.sol >= 85%.
*/
const fs = require('fs');
const path = require('path');

const LCOV = path.join(process.cwd(), 'coverage', 'lcov.info');

function parseLcov(lcovText) {
  const files = [];
  let current = null;
  for (const raw of lcovText.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('SF:')) {
      if (current) files.push(current);
      current = { file: line.slice(3), lf: 0, lh: 0 };
    } else if (line.startsWith('LF:')) {
      if (current) current.lf = parseInt(line.slice(3), 10) || 0;
    } else if (line.startsWith('LH:')) {
      if (current) current.lh = parseInt(line.slice(3), 10) || 0;
    } else if (line === 'end_of_record') {
      if (current) {
        files.push(current);
        current = null;
      }
    }
  }
  if (current) files.push(current);
  return files;
}

function pct(hit, found) {
  if (!found) return 0;
  return (hit / found) * 100;
}

function fail(msg) {
  console.error(`Coverage gate failed: ${msg}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(LCOV)) {
    fail(`lcov file not found at ${LCOV}`);
  }
  const text = fs.readFileSync(LCOV, 'utf8');
  const files = parseLcov(text);
  if (!files.length) fail('no files parsed from lcov');

  const totals = files.reduce((acc, f) => {
    acc.lf += f.lf;
    acc.lh += f.lh;
    return acc;
  }, { lf: 0, lh: 0 });
  const overall = pct(totals.lh, totals.lf);

  const need = [
    'contracts/deposit/DepositHandler.sol',
    'contracts/withdrawal/WithdrawalHandler.sol',
  ];

  const detail = new Map();
  for (const n of need) detail.set(n, { lf: 0, lh: 0 });

  for (const f of files) {
    for (const n of need) {
      // Match by suffix to play nice with absolute paths
      if (f.file.endsWith(n)) {
        const d = detail.get(n);
        d.lf += f.lf;
        d.lh += f.lh;
      }
    }
  }

  const overallThreshold = 80.0;
  const handlerThreshold = 85.0;

  if (overall < overallThreshold) {
    fail(`overall lines ${overall.toFixed(2)}% < ${overallThreshold}%`);
  }

  for (const [name, d] of detail.entries()) {
    if (d.lf === 0) {
      fail(`${name} not found in coverage (0 lines found)`);
    }
    const p = pct(d.lh, d.lf);
    if (p < handlerThreshold) {
      fail(`${name} lines ${p.toFixed(2)}% < ${handlerThreshold}%`);
    }
  }

  console.log('Coverage gate passed.');
}

main();

