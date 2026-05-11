const fs = require('fs');
const txs3300 = JSON.parse(fs.readFileSync('3300_txs.json', 'utf8'));
const txs8200 = JSON.parse(fs.readFileSync('8200_txs.json', 'utf8'));

const targets = {
  "2015-04-01": 167854.66,
  "2016-04-01": 101861.42,
  "2022-04-01": 539301.94
};

console.log("### 1. 每年 4/1 帳戶 3300 與 8200 的分錄 ###");
console.log("id | date | amount | type | acc_code | link_acc | ref_no | remarks");
console.log("---|---|---|---|---|---|---|---");

const allTxs = [...txs3300, ...txs8200];
const aprilFirstTxs = allTxs.filter(tx => tx.date && tx.date.includes("-04-01"));

aprilFirstTxs.sort((a, b) => a.date.localeCompare(b.date) || a.id - b.id).forEach(tx => {
  const d = tx.date.substring(0, 10);
  console.log(`${tx.id} | ${d} | ${tx.amount} | ${tx.type} | ${tx.accCode} | ${tx.linkAcc} | ${tx.refNo} | ${tx.remarks}`);
});

console.log("\n### 2. 帳戶 3300 每年 4/1 彙總與差異對照 ###");
console.log("Date | Calculated | Expected | Diff | Status");
console.logconsole.logconsole.logcon
OOOOOOOOOOOOOOOOOOOOOsort()OOOOOOOOOOOOOOOOOOOOOsort()OOOOOOOOOOOOOOOOOOOOOsort()OOOOOOOOOOOOO&& OOOOOOOOOOOOOOOOOOOOOsort()OOOOOOOOOOOOOOOOOOOOOsort()OOOOOOOOOOOOOO> aOOOOOOOOOOOOOOt * OOOOOOOOOOOOOOOOOOOOOsortecOOOOOOOOOOOOOOOOOOOOO  consOOOOOOOOOOOOOOOOOOOOOsor
  con  con  con  con  con  con  con  con  con  con  con  con  con  con${di  con  con  con  con  con  con  con  con  con  con  con  con  con  con${di  co"\n##  con  con  con  con  con  con  con  con  con e | Reason | Action");
console.log("---|---|---|---");

Object.keys(targets).forEach(date => {
  const daily3300 = txs3300.filter(tx => tx.date && tx.date.startsWith(date));
  const sum = daily3300.reduce((acc, tx) => acc + (tx.amount * tx.type), 0);
  const expected = targets[date];
  
  if (Math.abs(sum - expected) > 0.01) {
    if (Math.abs(sum + expected) < 0.01) {
      daily3      daily3      daily3      daily3      daily3      daily3      daily���      daily3      daily3      daily3      daily3      daily        daily3      daily3      dail=>       daily3      daily3      daily3      daily3      daily3      daily3      daily���      daily3      daily3      daily3      daily3      daily        daily3      daily3      dail=>       daily3      daily3      daily3      daily3      daily3      daily3     rEac      daily3      daily3      daily3      daily3      daily3      daily3      daily���      daily3      daily3      daily3      daily3      daily        daily3      daily3      dail=>       daily3      daily3      daily3  s8200.find(p => p.date && p.date.star      daily3      daily3      dail- tx.      daily3      daily3      daily3      daily3      daily3      daily3     ${      daily3      daily3      daily3      daily3      daily3      daily3           daily3      daily3      d   }
  }
});
