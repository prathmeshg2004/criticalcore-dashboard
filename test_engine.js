const Engine = require('./js/engine.js');
const fs = require('fs');

const candidates = JSON.parse(fs.readFileSync('./data/candidates.json'));
const accounts = JSON.parse(fs.readFileSync('./data/accounts.json'));
const categories = JSON.parse(fs.readFileSync('./data/categories.json'));
const assumptions = JSON.parse(fs.readFileSync('./data/assumptions.json'));

const candMap = {};
candidates.forEach(c => candMap[c.company_id] = c);
const accMap = {};
accounts.forEach(a => accMap[a.account_id] = a);

const emptyPort = Engine.calculatePortfolioState([], candMap, categories, assumptions.cumminsAccessibleAccounts, accMap, assumptions);

const metrics = candidates.map(c => Engine.calculateCandidateMetrics(c, emptyPort, assumptions.cumminsAccessibleAccounts, accMap, assumptions));
const sorted = Engine.sortCandidates(metrics);

console.log("Top 10 candidates on empty portfolio:");
sorted.slice(0, 10).forEach((m, idx) => {
  console.log((idx+1) + ". " + m.candidateName + " | IncPts: " + m.incrementalWalletPoints.toFixed(1) + " | OverlapRatio: " + (m.capabilityOverlapRatio*100).toFixed(0) + "% | Faded: " + m.isFaded + " | Warning: " + m.needsWarning + " | Cheque: ₹" + m.stakeCheque51.toFixed(1) + " cr");
});

console.log("\nNow select Voltech, re-sort remaining:");
const portWithVoltech = Engine.calculatePortfolioState(['voltech'], candMap, categories, assumptions.cumminsAccessibleAccounts, accMap, assumptions);
const metricsAfterVoltech = candidates.filter(c => c.company_id !== 'voltech').map(c => Engine.calculateCandidateMetrics(c, portWithVoltech, assumptions.cumminsAccessibleAccounts, accMap, assumptions));
const sortedAfterVoltech = Engine.sortCandidates(metricsAfterVoltech);
sortedAfterVoltech.slice(0, 8).forEach((m, idx) => {
  console.log((idx+1) + ". " + m.candidateName + " | IncPts: " + m.incrementalWalletPoints.toFixed(1) + " | OverlapRatio: " + (m.capabilityOverlapRatio*100).toFixed(0) + "% | Faded: " + m.isFaded + " | Warning: " + m.needsWarning + " | AcctOverlapMW: " + m.accountOverlapMW);
});
