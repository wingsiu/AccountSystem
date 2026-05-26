import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import * as XLSX from 'xlsx'; // eslint-disable-line no-unused-vars
import ExcelJS from 'exceljs';
import './transactions.css';
import { accountService, fiscalYearService, transactionService } from '../../services';

const pickField = (row, camelKey, snakeKey) => row?.[camelKey] ?? row?.[snakeKey] ?? '';

const parseNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAmount = (value) => {
  const amount = parseNumber(value);
  if (amount === 0) {
    return '-';
  }
  return amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const formatRunningBalance = (runningDebit, runningCredit, accountType) => {
  const debit = parseNumber(runningDebit);
  const credit = parseNumber(runningCredit);
  
  // Debit-normal accounts (1) balance = Debit - Credit
  // Credit-normal accounts (-1) balance = Credit - Debit
  const net = accountType === -1 ? credit - debit : debit - credit;

  const formatted = Math.abs(net).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  if (net > 0) return `+${formatted}`;
  if (net < 0) return `-${formatted}`;
  return '0.00';
};

const pickLatestFiscalYear = (years) => {
  const numericYears = years
    .map((fy) => Number(fy?.year))
    .filter((year) => Number.isFinite(year));

  if (numericYears.length === 0) {
    return 'all';
  }

  return String(Math.max(...numericYears));
};

const toAccountView = (tx, account, viewAccountId) => {
  const amount = parseNumber(tx.amount);
  const txType = parseNumber(tx.type);
  const accountType = parseNumber(pickField(account, 'accType', 'acc_type'));

  if (amount !== 0 && txType !== 0 && accountType !== 0) {
    if (viewAccountId === '1600') {
      // In the Bank's own ledger, txType = 1 means Bank Received Money (Bank Dr.)
      // txType = -1 means Bank Paid Money (Bank Cr.)
      return {
        debit: txType > 0 ? amount : 0,
        credit: txType < 0 ? amount : 0,
      };
    } else {
      // In all other (offset) ledgers, the rule is inverted because the txType 
      // was recorded from the Bank's perspective.
      // Bank Dr (txType=1) -> Offset account must be Cr
      // Bank Cr (txType=-1) -> Offset account must be Dr
      return {
        debit: txType < 0 ? amount : 0,
        credit: txType > 0 ? amount : 0,
      };
    }
  }

  return {
    debit: parseNumber(tx.drAmount ?? tx.dr_amount),
    credit: parseNumber(tx.crAmount ?? tx.cr_amount),
  };
};

const compareLedgerOrder = (left, right) => {
  const leftDate = new Date(left.date || left.txDate || left.tx_date || 0).getTime();
  const rightDate = new Date(right.date || right.txDate || right.tx_date || 0).getTime();
  if (leftDate !== rightDate) {
    return leftDate - rightDate;
  }

  // Force B/F (Balance Brought Forward) to appear first on any given date.
  // We identify B/F by its remark/description containing 'B/F' or 'Start balance'.
  const isLeftBF = String(left.Remarks || left.remarks || left.payMethodDes || left.pay_method_des || '').toLowerCase().includes('b/f') || 
                   String(left.accName || left.acc_name || left.Remarks || left.remarks || '').toLowerCase().includes('start');
  const isRightBF = String(right.Remarks || right.remarks || right.payMethodDes || right.pay_method_des || '').toLowerCase().includes('b/f') || 
                    String(right.accName || right.acc_name || right.Remarks || right.remarks || '').toLowerCase().includes('start');
  
  if (isLeftBF && !isRightBF) return -1;
  if (!isLeftBF && isRightBF) return 1;

  const leftOrder = parseNumber(left.orderValue ?? left.order ?? left.id);
  const rightOrder = parseNumber(right.orderValue ?? right.order ?? right.id);
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return parseNumber(left.id) - parseNumber(right.id);
};

// ── Excel Import Helpers ──────────────────────────────────────────────────────

const parseExcelAmount = (val) => {
  if (val == null || val === '') return null;
  if (typeof val === 'number') return val;
  const n = parseFloat(String(val).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
};

const parseBankDescription = (rawDesc) => {
  const desc = String(rawDesc || '').trim();
  let payMethodDes = '轉賬';
  let payMethod = 2;  // 0=cheque,1=cash,2=transfer,3=auto-debit,5=bounced
  let bC = 0;
  let cheque = null;
  let accName = '';
  let bankRef = null;

  if (!desc) return { payMethodDes, payMethod, bC, cheque, accName, bankRef };

  if (desc.startsWith('交換票存入')) {
    payMethodDes = '交換票';  payMethod = 0;  bC = 0;
  } else if (desc.startsWith('交換票')) {
    payMethodDes = '交換票';  payMethod = 0;  bC = 0;
    const m = desc.match(/交換票\s+(\d+)/);
    cheque = m ? m[1] : null;
  } else if (desc.startsWith('現金')) {
    payMethodDes = '現金';  payMethod = 1;  bC = 1;
    accName = desc.replace(/^現金\s*/, '');
  } else if (desc.startsWith('退票')) {
    payMethodDes = '退票';  payMethod = 5;  bC = 0;
    accName = desc.replace(/^退票\s*/, '');
  } else if (desc.startsWith('銀行費用')) {
    payMethodDes = '銀行費用';  payMethod = 3;  bC = 0;
    accName = desc.replace(/^銀行費用\s*/, '');
  } else if (/^自動轉賬|^自動扣賬/.test(desc)) {
    payMethodDes = '自動轉賬';  payMethod = 3;  bC = 0;
    accName = desc.replace(/^自動轉賬\s*|^自動扣賬\s*/, '');
  } else if (/^自動櫃員機/.test(desc)) {
    payMethodDes = '轉賬';  payMethod = 2;  bC = 0;
    accName = desc.replace(/^自動櫃員機轉賬交易?\s*|^自動櫃員機\s*/, '');
  } else if (/^轉賬交易/.test(desc)) {
    payMethodDes = '轉賬';  payMethod = 2;  bC = 0;
    const fps = desc.match(/FPS\/([^\/]+)\//);
    if (fps) {
      accName = fps[1].trim();
    } else {
      const eb = desc.match(/\d{3}-\d{3}-\d-\d{6,}-\d+\s+(.+)$/);
      accName = eb ? eb[1].trim() : desc.replace(/^轉賬交易\s*/, '').substring(0, 40);
    }
    bankRef = desc;
  } else {
    accName = desc.substring(0, 50);
  }

  return { payMethodDes, payMethod, bC, cheque, accName: accName.trim(), bankRef };
};

// Keyword-based acc_code suggestion
const PRESET_RULES = [
  { pattern: /^$/,                            isDeposit: true,  code: 4100 }, // All deposits → Revenue
  { pattern: /PRL|PAYROLL/i,                  isDeposit: false, code: 6010 }, // Salary (PRL DEBIT)
  { pattern: /MANULIFE|MPF/i,                 isDeposit: false, code: 6025 }, // MPF
  { pattern: /QUALITY ENGINEERING/i,          isDeposit: false, code: 6110 }, // Equipment
  { pattern: /H GLOBAL/i,                     isDeposit: false, code: 6300 }, // Insurance
  { pattern: /RENT/i,                         isDeposit: false, code: 6040 }, // Rent
  { pattern: /MANAGEMENT|ADMIN/i,             isDeposit: false, code: 6800 }, // Admin
];

const suggestAccCode = (accName, isDeposit) => {
  if (isDeposit) return 4100;
  const name = String(accName || '');
  for (const rule of PRESET_RULES) {
    if (!rule.isDeposit && rule.pattern.test(name)) return rule.code;
  }
  return null;
};

// ── ImportModal Component ─────────────────────────────────────────────────────

const ImportModal = ({ accounts, onClose, onImported }) => {
  const [rows, setRows] = useState([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  let _splitKeyCounter = useRef(100);

  const handleParse = () => {
    const file = fileRef.current?.files[0];
    if (!file) { alert('Please select a file.'); return; }

    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

      const parsed = [];
      for (let i = 1; i < data.length; i++) {
        const row = data[i];
        // Skip rows without a date or with null date
        if (!row[0]) continue;
        const rawDesc = String(row[2] || '').trim();
        // Skip opening balance row
        if (rawDesc === '承前結餘' || rawDesc === '') continue;

        const dateStr = String(row[0]).replace(/\//g, '-');
        const effectDateStr = row[1] ? String(row[1]).replace(/\//g, '-') : dateStr;
        const deposit = parseExcelAmount(row[3]);
        const withdrawal = parseExcelAmount(row[4]);
        const balance = parseExcelAmount(row[5]);
        const isDeposit = deposit != null && deposit > 0;

        const { payMethodDes, payMethod, bC, cheque, accName, bankRef } = parseBankDescription(rawDesc);

        parsed.push({
          _key: i,
          date: dateStr,
          effectDate: effectDateStr,
          payMethodDes,
          payMethod,
          bC,
          cheque: cheque || '',
          typeDes: isDeposit ? '入賬' : '扣賬',
          drAmount: isDeposit ? deposit : null,
          crAmount: !isDeposit ? withdrawal : null,
          amount: deposit || withdrawal,
          balance,
          accCode: suggestAccCode(accName, isDeposit),
          accName: accName || '',
          remarks: '',
          bankRef: bankRef || '',
          type: isDeposit ? 1 : -1,
          _splits: null, // null = not split
        });
      }
      setRows(parsed);
    };
    reader.readAsArrayBuffer(file);
  };

  const updateRow = useCallback((key, field, value) => {
    setRows(prev => prev.map(r => r._key === key ? { ...r, [field]: value } : r));
  }, []);

  const splitRow = useCallback((key) => {
    setRows(prev => prev.map(r => {
      if (r._key !== key) return r;
      const totalAmt = r.drAmount ?? r.crAmount ?? 0;
      return {
        ...r,
        _splits: [
          { _sk: ++_splitKeyCounter.current, accCode: r.accCode, accName: r.accName, amount: totalAmt, remarks: r.remarks },
          { _sk: ++_splitKeyCounter.current, accCode: null, accName: '', amount: 0, remarks: '' },
        ],
      };
    }));
  }, []);

  const mergeRow = useCallback((key) => {
    setRows(prev => prev.map(r => r._key === key ? { ...r, _splits: null } : r));
  }, []);

  const addSplitLine = useCallback((key) => {
    setRows(prev => prev.map(r => {
      if (r._key !== key) return r;
      return { ...r, _splits: [...r._splits, { _sk: ++_splitKeyCounter.current, accCode: null, accName: '', amount: 0, remarks: '' }] };
    }));
  }, []);

  const removeSplitLine = useCallback((key, sk) => {
    setRows(prev => prev.map(r => {
      if (r._key !== key) return r;
      const newSplits = r._splits.filter(s => s._sk !== sk);
      return newSplits.length < 2 ? { ...r, _splits: null } : { ...r, _splits: newSplits };
    }));
  }, []);

  const updateSplit = useCallback((key, sk, field, value) => {
    setRows(prev => prev.map(r => {
      if (r._key !== key) return r;
      return { ...r, _splits: r._splits.map(s => s._sk === sk ? { ...s, [field]: value } : s) };
    }));
  }, []);

  const handleImport = async () => {
    // Validate splits sum
    for (const r of rows) {
      if (r._splits) {
        const total = r.drAmount ?? r.crAmount ?? 0;
        const splitSum = r._splits.reduce((s, x) => s + parseNumber(x.amount), 0);
        if (Math.abs(splitSum - total) > 0.01) {
          alert(`Row ${r.date} split amounts (${splitSum.toFixed(2)}) do not sum to total (${total.toFixed(2)}). Please fix before importing.`);
          return;
        }
      }
    }

    const unset = rows.filter(r => r._splits
      ? r._splits.some(s => !s.accCode)
      : !r.accCode
    );
    if (unset.length > 0) {
      if (!window.confirm(`${unset.length} row(s) have split lines with no Account Code. Continue anyway?`)) return;
    }
    setImporting(true);
    try {
      const payload = [];
      for (const r of rows) {
        if (r._splits) {
          for (const s of r._splits) {
            payload.push({
              date: `${r.date}T00:00:00Z`,
              effect_date: `${r.effectDate}T00:00:00Z`,
              pay_method_des: r.payMethodDes,
              cheque: r.cheque || null,
              type_des: r.typeDes,
              dr_amount: r.drAmount != null ? parseNumber(s.amount) : null,
              cr_amount: r.crAmount != null ? parseNumber(s.amount) : null,
              amount: parseNumber(s.amount),
              acc_name: s.accName || null,
              Remarks: s.remarks || null,
              balance: r.balance,
              bank_ref: r.bankRef || null,
              acc_code: s.accCode ? Number(s.accCode) : null,
              pay_method: r.payMethod,
              type: r.type,
            });
          }
        } else {
          payload.push({
            date: `${r.date}T00:00:00Z`,
            effect_date: `${r.effectDate}T00:00:00Z`,
            pay_method_des: r.payMethodDes,
            cheque: r.cheque || null,
            type_des: r.typeDes,
            dr_amount: r.drAmount,
            cr_amount: r.crAmount,
            amount: r.amount,
            acc_name: r.accName || null,
            Remarks: r.remarks || null,
            balance: r.balance,
            bank_ref: r.bankRef || null,
            acc_code: r.accCode ? Number(r.accCode) : null,
            pay_method: r.payMethod,
            type: r.type,
          });
        }
      }
      await transactionService.bulkCreateTransactions(payload);
      alert(`Successfully imported ${payload.length} transactions!`);
      onImported();
      onClose();
    } catch (err) {
      alert(err?.response?.data?.reason || err?.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const fmtAmt = (v) => v != null ? v.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '';

  // Compute running balance map keyed by _key
  // Infer opening balance: balance_of_first_row minus that row's net movement
  const runningBalMap = (() => {
    const map = new Map();
    if (rows.length === 0) return map;
    let rb = (rows[0].balance ?? 0) - (rows[0].drAmount ?? 0) + (rows[0].crAmount ?? 0);
    for (const r of rows) {
      rb = rb + (r.drAmount ?? 0) - (r.crAmount ?? 0);
      map.set(r._key, rb);
    }
    return map;
  })();

  return (
    <div className="import-overlay">
      <div className="import-modal">
        <div className="import-modal-header">
          <h2>Import from Excel (Bank Statement)</h2>
          <button className="import-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="import-file-row">
          <input type="file" accept=".xlsx,.xls" ref={fileRef} />
          <button className="import-parse-btn" onClick={handleParse}>Parse</button>
        </div>

        {rows.length > 0 && (
          <>
            <p className="import-info">
              {rows.length} rows parsed.&nbsp;
              <span className="import-warn-count">
                {rows.filter(r => r._splits ? r._splits.some(s => !s.accCode) : !r.accCode).length} row(s) need Account Code assignment.
              </span>
            </p>

            <div className="import-table-wrap">
              <table className="import-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Method</th>
                    <th>Cheque</th>
                    <th>Debit</th>
                    <th>Credit</th>
                    <th>Balance</th>
                    <th>Running Bal</th>
                    <th>Acc Code *</th>
                    <th>Acc Name</th>
                    <th>Remarks</th>
                    <th>Split</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => {
                    if (r._splits) {
                      const total = r.drAmount ?? r.crAmount ?? 0;
                      const splitSum = r._splits.reduce((s, x) => s + parseNumber(x.amount), 0);
                      const sumOk = Math.abs(splitSum - total) <= 0.01;
                      return (
                        <React.Fragment key={r._key}>
                          <tr style={{ background: '#e8f0ff' }}>
                            <td className="import-td-date">{r.date}</td>
                            <td>{r.payMethodDes}</td>
                            <td>{r.cheque}</td>
                            <td className="import-td-num">{r.drAmount ? fmtAmt(r.drAmount) : ''}</td>
                            <td className="import-td-num">{r.crAmount ? fmtAmt(r.crAmount) : ''}</td>
                            <td className="import-td-num">{fmtAmt(r.balance)}</td>
                            {(() => {
                              const rb = runningBalMap.get(r._key);
                              const stmtBal = r.balance;
                              const mismatch = rb != null && stmtBal != null && Math.abs(rb - stmtBal) > 0.01;
                              return <td className="import-td-num" style={{ color: mismatch ? '#c00' : '#1a7a1a', fontWeight: mismatch ? 'bold' : undefined }}>{rb != null ? fmtAmt(rb) : ''}{mismatch && ' ⚠'}</td>;
                            })()}
                            <td colSpan="3" style={{ color: sumOk ? '#1a7a1a' : '#c00', fontSize: '0.85em' }}>
                              Split ({r._splits.length} lines) — allocated {fmtAmt(splitSum)} / {fmtAmt(total)} {!sumOk && '⚠ mismatch'}
                            </td>
                            <td>
                              <button style={{ fontSize: '0.8em' }} onClick={() => addSplitLine(r._key)}>+ Line</button>
                              <button style={{ fontSize: '0.8em', marginLeft: 4 }} onClick={() => mergeRow(r._key)}>Merge</button>
                            </td>
                          </tr>
                          {r._splits.map((s, si) => {
                            // running bal for this split line = running bal after prior rows + sum of splits up to and including this one
                            const prevRowRb = (() => {
                              // running balance BEFORE this row (i.e. after the row just before it)
                              const keys = rows.map(x => x._key);
                              const idx = keys.indexOf(r._key);
                              if (idx <= 0) {
                                return (rows[0].balance ?? 0) - (rows[0].drAmount ?? 0) + (rows[0].crAmount ?? 0);
                              }
                              return runningBalMap.get(keys[idx - 1]) ?? 0;
                            })();
                            const isDeposit = (r.drAmount ?? 0) > 0;
                            const splitSoFar = r._splits.slice(0, si + 1).reduce((acc, x) => acc + parseNumber(x.amount), 0);
                            const splitRb = isDeposit ? prevRowRb + splitSoFar : prevRowRb - splitSoFar;
                            const isLast = si === r._splits.length - 1;
                            const stmtBal = r.balance;
                            const mismatch = isLast && stmtBal != null && Math.abs(splitRb - stmtBal) > 0.01;
                            return (
                            <tr key={s._sk} style={{ background: '#f5f8ff' }}>
                              <td colSpan="6" style={{ paddingLeft: 24, color: '#555', fontSize: '0.85em' }}>
                                ↳ Split line {si + 1}
                              </td>
                              <td className="import-td-num" style={{ fontSize: '0.85em', color: mismatch ? '#c00' : '#888', fontWeight: mismatch ? 'bold' : undefined }}>
                                {fmtAmt(splitRb)}{mismatch && ' ⚠'}
                              </td>
                              <td>
                                <select
                                  value={s.accCode || ''}
                                  onChange={e => updateSplit(r._key, s._sk, 'accCode', e.target.value ? Number(e.target.value) : null)}
                                  className={!s.accCode ? 'import-select-warn' : 'import-select'}
                                >
                                  <option value="">-- Select --</option>
                                  {accounts.map(acc => (
                                    <option key={acc.id} value={acc.id}>
                                      {acc.id} - {acc.accName || acc.acc_name || ''}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td>
                                <input
                                  className="import-input"
                                  type="text"
                                  value={s.accName}
                                  onChange={e => updateSplit(r._key, s._sk, 'accName', e.target.value)}
                                />
                              </td>
                              <td>
                                <input
                                  className="import-input"
                                  type="text"
                                  value={s.amount}
                                  style={{ width: 80 }}
                                  onChange={e => updateSplit(r._key, s._sk, 'amount', parseFloat(String(e.target.value).replace(/,/g, '')) || 0)}
                                />
                                <input
                                  className="import-input"
                                  type="text"
                                  value={s.remarks}
                                  placeholder="remarks"
                                  style={{ width: 80, marginLeft: 4 }}
                                  onChange={e => updateSplit(r._key, s._sk, 'remarks', e.target.value)}
                                />
                              </td>
                              <td>
                                <button style={{ fontSize: '0.8em', color: '#c00' }} onClick={() => removeSplitLine(r._key, s._sk)}>✕</button>
                              </td>
                            </tr>
                            );
                          })}
                        </React.Fragment>
                      );
                    }

                    return (
                      <tr key={r._key} className={!r.accCode ? 'import-row-missing' : ''}>
                        <td className="import-td-date">{r.date}</td>
                        <td>{r.payMethodDes}</td>
                        <td>{r.cheque}</td>
                        <td className="import-td-num">{r.drAmount ? fmtAmt(r.drAmount) : ''}</td>
                        <td className="import-td-num">{r.crAmount ? fmtAmt(r.crAmount) : ''}</td>
                        <td className="import-td-num">{fmtAmt(r.balance)}</td>
                        {(() => {
                          const rb = runningBalMap.get(r._key);
                          const stmtBal = r.balance;
                          const mismatch = rb != null && stmtBal != null && Math.abs(rb - stmtBal) > 0.01;
                          return <td className="import-td-num" style={{ color: mismatch ? '#c00' : undefined, fontWeight: mismatch ? 'bold' : undefined }}>{rb != null ? fmtAmt(rb) : ''}{mismatch && ' ⚠'}</td>;
                        })()}
                        <td>
                          <select
                            value={r.accCode || ''}
                            onChange={e => updateRow(r._key, 'accCode', e.target.value ? Number(e.target.value) : null)}
                            className={!r.accCode ? 'import-select-warn' : 'import-select'}
                          >
                            <option value="">-- Select --</option>
                            {accounts.map(acc => (
                              <option key={acc.id} value={acc.id}>
                                {acc.id} - {acc.accName || acc.acc_name || ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            className="import-input"
                            type="text"
                            value={r.accName}
                            onChange={e => updateRow(r._key, 'accName', e.target.value)}
                          />
                        </td>
                        <td>
                          <input
                            className="import-input"
                            type="text"
                            value={r.remarks}
                            placeholder="optional"
                            onChange={e => updateRow(r._key, 'remarks', e.target.value)}
                          />
                        </td>
                        <td>
                          <button style={{ fontSize: '0.8em' }} onClick={() => splitRow(r._key)}>Split</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="import-footer">
              <button
                className="import-submit-btn"
                onClick={handleImport}
                disabled={importing}
              >
                {importing ? 'Importing…' : `Import ${rows.reduce((n, r) => n + (r._splits ? r._splits.length : 1), 0)} Transactions`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

// ── DepreciationModal Component ───────────────────────────────────────────────

const DepreciationModal = ({ accounts, fiscalYears, onClose, onSaved }) => {
  const [assetCost, setAssetCost] = useState('');
  const [rate, setRate] = useState('20');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [deprExpAcc, setDeprExpAcc] = useState('');   // Depreciation Expense acc_code
  const [accumDeprAcc, setAccumDeprAcc] = useState(''); // Accumulated Depreciation acc_code
  const [assetAcc, setAssetAcc] = useState('');         // The asset acc_code (for display / remarks)
  const [saving, setSaving] = useState(false);

  // Sort fiscal years ascending by endDate
  const sortedFY = [...fiscalYears]
    .filter(fy => fy.endDate || fy.end_date)
    .sort((a, b) => new Date(a.endDate || a.end_date) - new Date(b.endDate || b.end_date));

  const computePreview = () => {
    const cost = parseFloat(String(assetCost).replace(/,/g, ''));
    const r = parseFloat(rate) / 100;
    if (!cost || !r || !purchaseDate) return [];

    const purchaseTime = new Date(purchaseDate).getTime();

    // Find fiscal years that END after the purchase date
    const eligibleFY = sortedFY.filter(fy => {
      const endDate = new Date(fy.endDate || fy.end_date);
      return endDate.getTime() > purchaseTime;
    });

    const annualDepr = parseFloat((cost * r).toFixed(2));
    const maxYears = Math.round(1 / r);

    return eligibleFY.slice(0, maxYears).map((fy, i) => {
      const endDateStr = (fy.endDate || fy.end_date).slice(0, 10);
      return {
        year: fy.year,
        date: endDateStr,
        amount: annualDepr,
      };
    });
  };

  const entries = computePreview();
  const totalDepr = entries.reduce((s, e) => s + e.amount, 0);

  const handleSave = async () => {
    if (entries.length === 0) { alert('No entries to create. Check inputs.'); return; }
    if (!deprExpAcc) { alert('Please select the Depreciation Expense account.'); return; }
    if (!accumDeprAcc) { alert('Please select the Accumulated Depreciation account.'); return; }

    setSaving(true);
    try {
      const payload = entries.flatMap(e => [
        // Dr Depreciation Expense
        {
          date: `${e.date}T00:00:00Z`,
          effect_date: `${e.date}T00:00:00Z`,
          pay_method_des: '折舊',
          type_des: '折舊',
          dr_amount: e.amount,
          cr_amount: null,
          amount: e.amount,
          acc_name: accounts.find(a => String(a.id) === String(accumDeprAcc))?.accName
            || accounts.find(a => String(a.id) === String(accumDeprAcc))?.acc_name
            || 'Accumulated Depreciation',
          Remarks: `Depreciation ${e.year}${assetAcc ? ` - Acc ${assetAcc}` : ''}`,
          acc_code: Number(deprExpAcc),
          type: -1,
        },
        // Cr Accumulated Depreciation
        {
          date: `${e.date}T00:00:00Z`,
          effect_date: `${e.date}T00:00:00Z`,
          pay_method_des: '折舊',
          type_des: '折舊',
          dr_amount: null,
          cr_amount: e.amount,
          amount: e.amount,
          acc_name: accounts.find(a => String(a.id) === String(deprExpAcc))?.accName
            || accounts.find(a => String(a.id) === String(deprExpAcc))?.acc_name
            || 'Depreciation Expense',
          Remarks: `Depreciation ${e.year}${assetAcc ? ` - Acc ${assetAcc}` : ''}`,
          acc_code: Number(accumDeprAcc),
          type: -1,
        },
      ]);
      await transactionService.bulkCreateTransactions(payload);
      alert(`Created ${entries.length * 2} depreciation entries (${entries.length} years).`);
      onSaved();
      onClose();
    } catch (err) {
      alert(err?.response?.data?.reason || err?.message || 'Failed to create depreciation entries');
    } finally {
      setSaving(false);
    }
  };

  const fmtAmt = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 });

  return (
    <div className="import-overlay">
      <div className="import-modal" style={{ maxWidth: 680 }}>
        <div className="import-modal-header">
          <h2>Add Depreciation Entries</h2>
          <button className="import-close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '12px 16px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 20px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.9em' }}>
            Asset Account (optional, for reference)
            <select value={assetAcc} onChange={e => setAssetAcc(e.target.value)} className="import-select">
              <option value="">-- Select --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.id} - {a.accName || a.acc_name}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.9em' }}>
            Asset Cost
            <input
              type="text"
              value={assetCost}
              onChange={e => setAssetCost(e.target.value)}
              placeholder="e.g. 10000"
              style={{ padding: '4px 8px', fontSize: '0.9em' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.9em' }}>
            Depreciation Rate (% per year)
            <input
              type="text"
              value={rate}
              onChange={e => setRate(e.target.value)}
              placeholder="e.g. 20"
              style={{ padding: '4px 8px', fontSize: '0.9em' }}
            />
            {rate && <span style={{ fontSize: '0.8em', color: '#666' }}>= {Math.round(1 / (parseFloat(rate) / 100))} years</span>}
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.9em' }}>
            Purchase Date
            <input
              type="date"
              value={purchaseDate}
              onChange={e => setPurchaseDate(e.target.value)}
              style={{ padding: '4px 8px', fontSize: '0.9em' }}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.9em' }}>
            Depreciation Expense Account <span style={{ color: '#c00' }}>*</span>
            <select value={deprExpAcc} onChange={e => setDeprExpAcc(e.target.value)} className={!deprExpAcc ? 'import-select-warn' : 'import-select'}>
              <option value="">-- Select --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.id} - {a.accName || a.acc_name}</option>
              ))}
            </select>
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.9em' }}>
            Accumulated Depreciation Account <span style={{ color: '#c00' }}>*</span>
            <select value={accumDeprAcc} onChange={e => setAccumDeprAcc(e.target.value)} className={!accumDeprAcc ? 'import-select-warn' : 'import-select'}>
              <option value="">-- Select --</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>{a.id} - {a.accName || a.acc_name}</option>
              ))}
            </select>
          </label>
        </div>

        {entries.length > 0 && (
          <div style={{ padding: '0 16px 12px' }}>
            <p style={{ fontSize: '0.85em', color: '#555', marginBottom: 6 }}>
              Preview — {entries.length} fiscal year(s), total depreciation: <strong>{fmtAmt(totalDepr)}</strong>
            </p>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88em' }}>
              <thead>
                <tr style={{ background: '#eee' }}>
                  <th style={{ padding: '4px 8px', textAlign: 'left' }}>FY</th>
                  <th style={{ padding: '4px 8px', textAlign: 'left' }}>Period End Date</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Dr Depr Expense</th>
                  <th style={{ padding: '4px 8px', textAlign: 'right' }}>Cr Accum Depr</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '4px 8px' }}>{e.year}</td>
                    <td style={{ padding: '4px 8px' }}>{e.date}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmtAmt(e.amount)}</td>
                    <td style={{ padding: '4px 8px', textAlign: 'right' }}>{fmtAmt(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entries.length === 0 && assetCost && rate && purchaseDate && (
          <p style={{ padding: '0 16px 12px', color: '#c00', fontSize: '0.88em' }}>
            No eligible fiscal year end dates found after the purchase date. Check that fiscal years are configured.
          </p>
        )}

        <div className="import-footer" style={{ marginTop: 8 }}>
          <button onClick={onClose} style={{ marginRight: 8 }}>Cancel</button>
          <button
            className="import-submit-btn"
            onClick={handleSave}
            disabled={saving || entries.length === 0 || !deprExpAcc || !accumDeprAcc}
          >
            {saving ? 'Saving…' : `Create ${entries.length * 2} Entries (${entries.length} years × 2)`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── SplitModal Component ─────────────────────────────────────────────────────

const SplitModal = ({ tx, accounts, onClose, onSave }) => {
  const originalAmount = parseNumber(tx.amount ?? tx.drAmount ?? tx.dr_amount ?? tx.crAmount ?? tx.cr_amount);
  const isDeposit = parseNumber(tx.type ?? 0) > 0;

  const [splits, setSplits] = useState([
    { _sk: 1, accCode: tx.accCode ?? tx.acc_code ?? null, accName: tx.accName ?? tx.acc_name ?? '', amount: originalAmount, remarks: tx.remarks ?? tx.Remarks ?? '' },
    { _sk: 2, accCode: null, accName: '', amount: 0, remarks: '' },
  ]);
  const [saving, setSaving] = useState(false);
  let _skCounter = useRef(10);

  const splitSum = splits.reduce((s, x) => s + parseNumber(x.amount), 0);
  const remaining = originalAmount - splitSum;
  const sumOk = Math.abs(remaining) <= 0.01;

  const updateSplit = (sk, field, value) => {
    setSplits(prev => prev.map(s => s._sk === sk ? { ...s, [field]: value } : s));
  };

  const addLine = () => {
    setSplits(prev => [...prev, { _sk: ++_skCounter.current, accCode: null, accName: '', amount: parseNumber(remaining.toFixed(2)), remarks: '' }]);
  };

  const removeLine = (sk) => {
    setSplits(prev => {
      const next = prev.filter(s => s._sk !== sk);
      return next.length < 1 ? prev : next;
    });
  };

  const handleSave = async () => {
    if (!sumOk) {
      alert(`Split amounts (${splitSum.toFixed(2)}) must equal the original amount (${originalAmount.toFixed(2)}).`);
      return;
    }
    setSaving(true);
    try {
      await onSave(splits);
    } finally {
      setSaving(false);
    }
  };

  const fmtAmt = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 });

  return (
    <div className="import-overlay">
      <div className="import-modal" style={{ maxWidth: 700 }}>
        <div className="import-modal-header">
          <h2>Split Transaction #{tx.id}</h2>
          <button className="import-close-btn" onClick={onClose}>×</button>
        </div>

        <div style={{ padding: '8px 16px', background: '#f5f5f5', marginBottom: 12, fontSize: '0.9em' }}>
          <strong>Date:</strong> {tx.date ? String(tx.date).slice(0, 10) : '-'} &nbsp;
          <strong>Amount:</strong> {fmtAmt(originalAmount)} &nbsp;
          <strong>Pay Method:</strong> {tx.payMethodDes ?? tx.pay_method_des ?? '-'} &nbsp;
          <strong>Acc Name:</strong> {tx.accName ?? tx.acc_name ?? '-'}
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9em' }}>
          <thead>
            <tr style={{ background: '#eee' }}>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Acc Code *</th>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Acc Name</th>
              <th style={{ padding: '4px 8px', textAlign: 'right' }}>Amount *</th>
              <th style={{ padding: '4px 8px', textAlign: 'left' }}>Remarks</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {splits.map((s, i) => (
              <tr key={s._sk} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '4px 8px' }}>
                  <select
                    value={s.accCode || ''}
                    onChange={e => updateSplit(s._sk, 'accCode', e.target.value ? Number(e.target.value) : null)}
                    className={!s.accCode ? 'import-select-warn' : 'import-select'}
                  >
                    <option value="">-- Select --</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>
                        {acc.id} - {acc.accName || acc.acc_name || ''}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input
                    className="import-input"
                    type="text"
                    value={s.accName}
                    onChange={e => updateSplit(s._sk, 'accName', e.target.value)}
                  />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input
                    type="number"
                    value={s.amount}
                    style={{ width: 90, textAlign: 'right' }}
                    onChange={e => updateSplit(s._sk, 'amount', parseFloat(e.target.value) || 0)}
                  />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <input
                    className="import-input"
                    type="text"
                    value={s.remarks}
                    placeholder="optional"
                    onChange={e => updateSplit(s._sk, 'remarks', e.target.value)}
                  />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  {splits.length > 1 && (
                    <button style={{ color: '#c00', fontSize: '0.85em' }} onClick={() => removeLine(s._sk)}>✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan="2" style={{ padding: '6px 8px' }}>
                <button onClick={addLine} style={{ fontSize: '0.85em' }}>+ Add Line</button>
              </td>
              <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 'bold', color: sumOk ? '#1a7a1a' : '#c00' }}>
                {fmtAmt(splitSum)} / {fmtAmt(originalAmount)}
                {!sumOk && <span style={{ marginLeft: 6 }}>⚠ {remaining > 0 ? `${fmtAmt(remaining)} unallocated` : `over by ${fmtAmt(-remaining)}`}</span>}
              </td>
              <td colSpan="2"></td>
            </tr>
          </tfoot>
        </table>

        <div className="import-footer" style={{ marginTop: 12 }}>
          <button onClick={onClose} style={{ marginRight: 8 }}>Cancel</button>
          <button
            className="import-submit-btn"
            onClick={handleSave}
            disabled={saving || !sumOk}
          >
            {saving ? 'Saving…' : `Split into ${splits.length} Transactions`}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const TransactionRow = ({ tx, is1600, isEditing, onEditClick, onEditCancel, onEditSave, onReorder, onSplitClick }) => {
  const hasStmtBal = tx.balance !== null && tx.balance !== undefined && tx.balance !== '';
  
  // Check for balance mismatch ignoring small floating point differences
  const balanceMismatch = is1600 && hasStmtBal && !tx.isBfTx && tx.runningBalanceRaw != null 
    ? Math.abs(parseNumber(tx.balance) - tx.runningBalanceRaw) > 0.01 
    : false;

  const handleDragStart = (e) => {
    e.dataTransfer.setData('text/plain', tx.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault(); // Necessary to allow dropping
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (draggedId && draggedId !== String(tx.id)) {
      onReorder(Number(draggedId), tx.id);
    }
  };

  return (
    <tr 
      style={{ backgroundColor: balanceMismatch ? '#ffd2d2' : undefined }} 
      title={balanceMismatch ? 'Warning: Running balance does not match Statement balance!' : ''}
      draggable={is1600 && !isEditing}
      onDragStart={is1600 && !isEditing ? handleDragStart : undefined}
      onDragOver={is1600 && !isEditing ? handleDragOver : undefined}
      onDrop={is1600 && !isEditing ? handleDrop : undefined}
    >
      <td>{tx.id}</td>
      <td>
        {isEditing ? (
          <input 
            id={`edit-date-${tx.id}`}
            type="date"
            defaultValue={tx.date ? String(tx.date).slice(0, 10) : ''}
            style={{ width: '130px' }}
          />
        ) : (
          tx.date ? String(tx.date).slice(0, 10) : '-'
        )}
      </td>
      <td>{tx.displayAccountName}</td>
      <td>{tx.contraAccountName}</td>
      <td>
        {isEditing ? (
          <input 
            id={`edit-remarks-${tx.id}`}
            type="text" 
            defaultValue={tx.remarks ?? tx.Remarks ?? tx.typeDes ?? tx.type_des ?? ''} 
            style={{ width: '100%', boxSizing: 'border-box' }}
          />
        ) : (
          tx.remarks ?? tx.Remarks ?? tx.typeDes ?? tx.type_des ?? '-'
        )}
      </td>
      <td>{formatAmount(tx.normalizedDebit)}</td>
      <td>{formatAmount(tx.normalizedCredit)}</td>
      <td>{tx.runningBalanceText ?? '-'}</td>
      <td>
        {isEditing ? (
          <input 
            id={`edit-balance-${tx.id}`}
            type="text" 
            defaultValue={tx.balance ?? ''} 
            style={{ width: '100px' }}
          />
        ) : (
          formatAmount(tx.balance)
        )}
        {balanceMismatch && !isEditing && (
          <span style={{ color: 'red', fontWeight: 'bold', marginLeft: '5px' }}>!</span>
        )}
      </td>
      <td>{tx.refNo ?? tx.ref_no ?? '-'}</td>
      <td>
        {!tx.isBfTx && (
          isEditing ? (
            <div>
              <button onClick={() => onEditSave(tx.id)}>Save</button>
              <button onClick={onEditCancel}>Cancel</button>
              <button onClick={() => {
                const balInput = document.getElementById(`edit-balance-${tx.id}`);
                if (balInput && tx.runningBalanceRaw != null) {
                  balInput.value = Number(tx.runningBalanceRaw).toFixed(2);
                }
              }}>Copy Bal</button>
            </div>
          ) : (
            <div>
              <button onClick={() => onEditClick(tx.id)}>Edit</button>
              <button onClick={() => onSplitClick(tx.id)} style={{ marginLeft: 4 }}>Split</button>
            </div>
          )
        )}
      </td>
    </tr>
  );
};

const areEqual = (prevProps, nextProps) => {
  return (
    prevProps.isEditing === nextProps.isEditing &&
    prevProps.is1600 === nextProps.is1600 &&
    prevProps.tx === nextProps.tx // Will be identical object reference from useMemo unless recomputed
  );
};

const TransactionRowMemo = React.memo(TransactionRow, areEqual);

const TransactionsPage = () => {
  const [transactions, setTransactions] = useState([]);
  const [filters, setFilters] = useState({ accountId: '1600', fiscalYear: 'all', month: '' });
  const [sorter, setSorter] = useState('dateAsc');
  const [accounts, setAccounts] = useState([]);
  const [fiscalYears, setFiscalYears] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const [editingTxId, setEditingTxId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [splitTxId, setSplitTxId] = useState(null);
  const [showDepreciation, setShowDepreciation] = useState(false);

  const accountMap = useMemo(() => {
    const entries = accounts.map((account) => [String(account.id), account]);
    return new Map(entries);
  }, [accounts]);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await transactionService.listTransactions({
        accountId: filters.accountId ? Number(filters.accountId) : undefined,
        fiscalYear: filters.fiscalYear !== 'all' ? Number(filters.fiscalYear) : undefined,
      });
      setTransactions(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      setTransactions([]);
      setError(error?.response?.data?.reason || error?.message || 'Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [filters.accountId, filters.fiscalYear]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    const loadFilterSources = async () => {
      try {
        const [accountResponse, fiscalYearResponse] = await Promise.all([
          accountService.listAccounts(),
          fiscalYearService.listFiscalYears(),
        ]);
        const accountRows = Array.isArray(accountResponse.data) ? accountResponse.data : [];
        const fiscalYearRows = Array.isArray(fiscalYearResponse.data) ? fiscalYearResponse.data : [];
        const latestFiscalYear = pickLatestFiscalYear(fiscalYearRows);

        setAccounts(accountRows);
        setFiscalYears(fiscalYearRows);
        setFilters((prev) => {
          if (prev.fiscalYear && prev.fiscalYear !== 'all') {
            return prev;
          }
          return { ...prev, fiscalYear: latestFiscalYear };
        });
      } catch (error) {
        setAccounts([]);
        setFiscalYears([]);
      }
    };

    loadFilterSources();
  }, []);

  const processedTransactions = useMemo(() => {
    const normalizedRows = transactions.map((tx) => {
      const account = accountMap.get(String(tx.accCode ?? tx.acc_code ?? ''));
      const accountView = toAccountView(tx, account, filters.accountId);
      
      const isBfTx = String(tx.Remarks || tx.remarks || tx.payMethodDes || tx.pay_method_des || '').toLowerCase().includes('b/f') || 
                     String(tx.accName || tx.acc_name || tx.Remarks || tx.remarks || '').toLowerCase().includes('start');
      
      return {
        ...tx,
        normalizedDebit: accountView.debit,
        normalizedCredit: accountView.credit,
        normalizedNet: accountView.debit - accountView.credit,
        accountType: parseNumber(pickField(account, 'accType', 'acc_type')),
        accountId: tx.accCode ?? tx.acc_code ?? '',
        displayAccountName: pickField(account, 'accName', 'acc_name') || tx.accName || tx.acc_name || '-',
        isBfTx, // Tag it for easier filtering/display if needed
        contraAccountName: accountMap.get(String(tx.linkAcc ?? tx.link_acc ?? ''))
          ? `${tx.linkAcc ?? tx.link_acc} - ${pickField(accountMap.get(String(tx.linkAcc ?? tx.link_acc ?? '')), 'accName', 'acc_name')}`
          : (tx.linkAcc ?? tx.link_acc ?? '-'),
      };
    });

    const hasSingleAccountFocus = Boolean(filters.accountId);
    const ledgerRows = [...normalizedRows].sort(compareLedgerOrder);
    let runningDebit = 0;
    let runningCredit = 0;

    const rowsWithRunningBalance = ledgerRows.map((tx) => {
      let runningBalanceText = null;
      let runningBalanceRaw = null;
      
      if (hasSingleAccountFocus) {
        runningDebit += parseNumber(tx.normalizedDebit);
        runningCredit += parseNumber(tx.normalizedCredit);
        
        let viewAccType = tx.accountType;
        if (filters.accountId === '1600') {
           viewAccType = 1; // 1600 is Asset, normal balance is Debit
        }
        
        runningBalanceRaw = viewAccType === -1 ? runningCredit - runningDebit : runningDebit - runningCredit;
        runningBalanceText = formatRunningBalance(runningDebit, runningCredit, viewAccType);
      }

      return {
        ...tx,
        runningBalanceText,
        runningBalanceRaw,
      };
    });

    let rows = [...rowsWithRunningBalance];
    
    // Check if we need to show a dynamically calculated B/F row for single account view
    let bfBalanceText = null;
    let bfDate = null;
    let bfBalanceRaw = null;
    
    // Apply fiscal year filter in frontend if an account is selected 
    // (since backend returns all history up to endDate for correct B/F calculation)
    if (filters.accountId && filters.fiscalYear !== 'all') {
      const selectedYear = fiscalYears.find(fy => String(fy.year) === filters.fiscalYear);
      if (selectedYear) {
        const beginDate = new Date(selectedYear.beginDate || selectedYear.begin_date).getTime();
        const endDate = new Date(selectedYear.endDate || selectedYear.end_date).getTime();
        
        // Find the last running balance before the begin date
        const priorRows = rows.filter(tx => {
          const rawDate = tx.date || tx.txDate || tx.tx_date;
          if (!rawDate) return false;
          return new Date(rawDate).getTime() < beginDate;
        });
        if (priorRows.length > 0) {
           const lastPrior = priorRows[priorRows.length - 1];
           bfBalanceText = lastPrior.runningBalanceText;
           bfBalanceRaw = lastPrior.runningBalanceRaw;
           bfDate = selectedYear.beginDate || selectedYear.begin_date;
        }
        
        rows = rows.filter(tx => {
          const rawDate = tx.date || tx.txDate || tx.tx_date;
          if (!rawDate) return false;
          const txTime = new Date(rawDate).getTime();
          return txTime >= beginDate && txTime <= endDate;
        });
      }
    }
    
    // Apply month filter
    if (filters.month) {
      if (!bfBalanceText) { // If B/F wasn't calculated by fiscal year, calculate it by month
        const targetMonth = Number(filters.month);
        const priorRows = rows.filter(tx => {
          const rawDate = tx.date || tx.txDate || tx.tx_date;
          if (!rawDate) return false;
          const txMonth = new Date(rawDate).getMonth() + 1;
          const txYear = new Date(rawDate).getFullYear();
          // Assuming fiscal year is the primary filter, we just need anything before targetMonth in same year
          return txMonth < targetMonth;
        });
        if (priorRows.length > 0) {
           const lastPrior = priorRows[priorRows.length - 1];
           bfBalanceText = lastPrior.runningBalanceText;
           bfBalanceRaw = lastPrior.runningBalanceRaw;
           const sampleRawDate = lastPrior.date || lastPrior.txDate;
           // Roughly the start of that month
           bfDate = sampleRawDate; 
        }
      }

      rows = rows.filter(tx => {
        const rawDate = tx.date || tx.txDate || tx.tx_date;
        if (!rawDate) return false;
        const month = new Date(rawDate).getMonth() + 1;
        return month === Number(filters.month);
      });
    }

    const selectedAccObj = accountMap.get(String(filters.accountId));
    const needsBF = selectedAccObj ? (selectedAccObj.bC ?? selectedAccObj.b_c) === 1 : false;

    // For non-B/F (income/expense) accounts, re-compute running balance from 0 within the filtered rows
    if (!needsBF && filters.accountId && filters.fiscalYear !== 'all') {
      let rDr = 0, rCr = 0;
      const viewAccType = selectedAccObj ? parseNumber(pickField(selectedAccObj, 'accType', 'acc_type')) : 1;
      rows = rows.map(tx => {
        rDr += parseNumber(tx.normalizedDebit);
        rCr += parseNumber(tx.normalizedCredit);
        const raw = viewAccType === -1 ? rCr - rDr : rDr - rCr;
        return {
          ...tx,
          runningBalanceRaw: raw,
          runningBalanceText: formatRunningBalance(rDr, rCr, viewAccType),
        };
      });
    }

    if (needsBF && bfBalanceText && rows.length > 0) {
      const bfDisplayRow = {
        id: 'bf-dynamic',
        date: bfDate,
        txDate: bfDate,
        tx_date: bfDate,
        description: 'B/F Balance (Computed dynamically from prior records)',
        Remarks: 'B/F',
        remarks: 'b/f',
        normalizedDebit: 0,
        normalizedCredit: 0,
        normalizedNet: 0,
        runningBalanceText: bfBalanceText,
        runningBalanceRaw: bfBalanceRaw,
        isBfTx: true
      };
      
      // We will inject it after sort, so let's mark it
      rows.push(bfDisplayRow);
    }

    rows.sort((a, b) => {
      const isBankView = filters.accountId === '1600';
      if (sorter === 'dateAsc' || sorter === 'dateDesc') {
        return sorter === 'dateAsc' ? compareLedgerOrder(a, b) : compareLedgerOrder(b, a);
      }
      const aAmount = parseNumber(a.normalizedNet);
      const bAmount = parseNumber(b.normalizedNet);
      return sorter === 'amountAsc' ? aAmount - bAmount : bAmount - aAmount;
    });
    return rows;
  }, [transactions, filters.accountId, filters.month, filters.fiscalYear, sorter, accountMap, fiscalYears]);

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
  };

  const handleSorterChange = (e) => {
    setSorter(e.target.value);
  };

  const handleEditClick = useCallback((txId) => {
    setEditingTxId(txId);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingTxId(null);
  }, []);

  const handleEditSave = useCallback(async (id) => {
    try {
      const remarksVal = document.getElementById(`edit-remarks-${id}`)?.value || '';
      const balanceVal = document.getElementById(`edit-balance-${id}`)?.value || '';
      const dateVal = document.getElementById(`edit-date-${id}`)?.value || '';
      
      const formattedDate = dateVal ? `${dateVal}T00:00:00Z` : undefined;

      await transactionService.updateTransaction(id, {
        date: formattedDate,
        effectDate: formattedDate,
        remarks: remarksVal,
        balance: balanceVal ? parseNumber(balanceVal) : null
      });
      // updating local state to avoid refetching immediately
      setTransactions((prev) => prev.map(tx => tx.id === id ? { 
        ...tx,
        date: formattedDate !== undefined ? formattedDate : tx.date,
        effectDate: formattedDate !== undefined ? formattedDate : tx.effectDate,
        remarks: remarksVal, 
        Remarks: remarksVal,
        balance: balanceVal ? parseNumber(balanceVal) : null 
      } : tx));
      setEditingTxId(null);
    } catch (err) {
      alert(err?.response?.data?.reason || err?.message || 'Failed to update transaction');
    }
  }, []);

  const handleReorder = useCallback((draggedId, targetId) => {    setTransactions(prevTransactions => {
      const txSource = prevTransactions.find(t => t.id === draggedId);
      const txTarget = prevTransactions.find(t => t.id === targetId);
      if (!txSource || !txTarget) return prevTransactions;

      if ((txSource.date || txSource.txDate || txSource.tx_date) !== (txTarget.date || txTarget.txDate || txTarget.tx_date)) {
        alert('Can only reorder transactions within the same date.');
        return prevTransactions;
      }

      const sameDateDate = txSource.date || txSource.txDate || txSource.tx_date;
      const sameDateTxs = prevTransactions.filter(t => (t.date || t.txDate || t.tx_date) === sameDateDate);
      sameDateTxs.sort((a, b) => compareLedgerOrder(a, b)); // Note: passing default comparison

      const sameDateTxsWithoutSource = sameDateTxs.filter(t => t.id !== draggedId);
      const targetIdx = sameDateTxsWithoutSource.findIndex(t => t.id === targetId);
      
      sameDateTxsWithoutSource.splice(targetIdx, 0, txSource);

      const updates = sameDateTxsWithoutSource.map((t, i) => {
        const newOrder = i + 1;
        return { ...t, orderValue: newOrder, order: newOrder };
      });

      // Background sync
      Promise.all(updates.map(u => 
        transactionService.updateTransaction(u.id, { orderValue: u.orderValue })
      )).catch(e => {
        console.error("Order sync error", e);
      });

      return prevTransactions.map(pt => {
        const match = updates.find(ut => ut.id === pt.id);
        if (match) return match;
        return pt;
      });
    });
  }, []);

  const handleSplitClick = useCallback((txId) => {
    setSplitTxId(txId);
  }, []);

  const handleSplitSave = useCallback(async (splits) => {
    const originalTx = transactions.find(t => t.id === splitTxId);
    if (!originalTx) return;

    const isDeposit = parseNumber(originalTx.type ?? 0) > 0;
    const dateStr = originalTx.date ? String(originalTx.date).slice(0, 10) : null;

    const payload = splits.map(s => ({
      date: dateStr ? `${dateStr}T00:00:00Z` : null,
      effect_date: originalTx.effectDate ? String(originalTx.effectDate).slice(0, 10) + 'T00:00:00Z' : (dateStr ? `${dateStr}T00:00:00Z` : null),
      pay_method_des: originalTx.payMethodDes ?? originalTx.pay_method_des ?? null,
      cheque: originalTx.cheque ?? null,
      type_des: originalTx.typeDes ?? originalTx.type_des ?? null,
      dr_amount: isDeposit ? parseNumber(s.amount) : null,
      cr_amount: !isDeposit ? parseNumber(s.amount) : null,
      amount: parseNumber(s.amount),
      acc_name: s.accName || null,
      Remarks: s.remarks || null,
      balance: null,
      bank_ref: originalTx.bankRef ?? originalTx.bank_ref ?? null,
      acc_code: s.accCode ? Number(s.accCode) : null,
      pay_method: originalTx.payMethod ?? originalTx.pay_method ?? null,
      type: originalTx.type ?? null,
      link_acc: originalTx.linkAcc ?? originalTx.link_acc ?? null,
    }));

    try {
      await transactionService.deleteTransaction(splitTxId);
      await transactionService.bulkCreateTransactions(payload);
      setSplitTxId(null);
      await fetchTransactions();
    } catch (err) {
      alert(err?.response?.data?.reason || err?.message || 'Split failed');
    }
  }, [splitTxId, transactions, fetchTransactions]);

  const [exportingLedger, setExportingLedger] = useState(false);

  const handleExportLedger = useCallback(async () => {
    if (!filters.accountId) {
      alert('Please select an account first.');
      return;
    }
    setExportingLedger(true);
    try {
      const acc = accountMap.get(String(filters.accountId));
      const accName = acc ? (acc.accName ?? acc.acc_name ?? filters.accountId) : filters.accountId;
      const fyLabel = filters.fiscalYear === 'all' ? 'AllYears' : filters.fiscalYear;
      const fy = fiscalYears.find(y => String(y.year) === filters.fiscalYear);
      const endDateLabel = fy
        ? new Date(fy.endDate || fy.end_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' }).toUpperCase()
        : fyLabel;
      const filename = `Ledger_${filters.accountId}_${accName.replace(/[/\\?*[\]:]/g, '-').slice(0, 20)}_${fyLabel}.xlsx`;

      const bfRow = processedTransactions.find(tx => tx.isBfTx);
      const rows  = processedTransactions.filter(tx => !tx.isBfTx);

      const wb2 = new ExcelJS.Workbook();
      const ws = wb2.addWorksheet(String(filters.accountId).slice(0, 31));
      ws.columns = [{ width: 10 }, { width: 13 }, { width: 32 }, { width: 22 }, { width: 16 }, { width: 16 }, { width: 16 }];

      // Header block
      [
        'ARK EDUCATION LIMITED',
        `LEDGER: ${filters.accountId} ${accName}`,
        `FOR THE YEAR ENDED ${endDateLabel}`,
      ].forEach(txt => {
        const r = ws.addRow([txt]);
        r.getCell(1).font = { name: 'Times New Roman', bold: true, size: 12 };
        r.getCell(1).alignment = { horizontal: 'center' };
        ws.mergeCells(`A${r.number}:G${r.number}`);
      });
      ws.addRow([]); ws.addRow([]);

      // Column header
      const hdr = ws.addRow(['ID', 'Date', 'Remarks', 'Ref No', 'Dr (HK$)', 'Cr (HK$)', 'Balance (HK$)']);
      hdr.eachCell((cell, c) => {
        cell.font = { name: 'Times New Roman', bold: true, size: 11 };
        cell.alignment = { horizontal: c <= 4 ? 'left' : 'right' };
        cell.border = { bottom: { style: 'thin' } };
      });

      const addLRow = (values, opts = {}) => {
        const r = ws.addRow(values);
        r.eachCell({ includeEmpty: true }, (cell, c) => {
          cell.font = { name: 'Times New Roman', size: 11, bold: !!opts.bold, italic: !!opts.italic };
          if (c >= 5 && cell.value !== null && cell.value !== undefined) {
            cell.alignment = { horizontal: 'right' };
            cell.numFmt = '#,##0.00';
            if (opts.bold) cell.border = { top: { style: 'thin' }, bottom: { style: 'double' } };
          }
        });
      };

      if (bfRow) {
        addLRow([null, bfRow.date ? String(bfRow.date).slice(0, 10) : '', 'Balance b/f', null, null, null,
          bfRow.runningBalanceRaw !== null ? Math.round(bfRow.runningBalanceRaw * 100) / 100 : null], { italic: true });
      }

      let totalDr = 0, totalCr = 0;
      rows.forEach(tx => {
        const dateStr = tx.date ? String(tx.date).slice(0, 10) : '';
        const remarks = tx.Remarks ?? tx.remarks ?? tx.typeDes ?? tx.type_des ?? '';
        const refNo   = tx.refNo ?? tx.ref_no ?? '';
        const dr = parseNumber(tx.normalizedDebit);
        const cr = parseNumber(tx.normalizedCredit);
        totalDr += dr; totalCr += cr;
        addLRow([
          tx.id ?? null, dateStr, remarks || '', refNo || '',
          dr > 0 ? Math.round(dr * 100) / 100 : null,
          cr > 0 ? Math.round(cr * 100) / 100 : null,
          tx.runningBalanceRaw !== null && tx.runningBalanceRaw !== undefined
            ? Math.round(tx.runningBalanceRaw * 100) / 100 : null,
        ]);
      });

      const lastRow = rows[rows.length - 1];
      const closingBal = lastRow?.runningBalanceRaw ?? 0;
      addLRow([null, '', 'Total / Closing Balance', '',
        Math.round(totalDr * 100) / 100 || null,
        Math.round(totalCr * 100) / 100 || null,
        Math.round(closingBal * 100) / 100], { bold: true });

      const buffer = await wb2.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExportingLedger(false);
    }
  }, [filters.accountId, filters.fiscalYear, processedTransactions, accountMap, fiscalYears]);

  return (
    <div className="transactions-page">
      <h1>Transactions</h1>

      <div className="filters">
        <select name="accountId" onChange={handleFilterChange} value={filters.accountId}>
          <option value="">All Accounts</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.id} - {pickField(account, 'accName', 'acc_name') || '-'}
            </option>
          ))}
        </select>

        <select name="fiscalYear" onChange={handleFilterChange} value={filters.fiscalYear}>
          <option value="all">All Fiscal Years</option>
          {fiscalYears.map((fy) => (
            <option key={fy.id || fy.year} value={String(fy.year)}>{fy.year}</option>
          ))}
        </select>

        <select name="month" onChange={handleFilterChange} value={filters.month}>
          <option value="">All Months</option>
          {Array.from({ length: 12 }, (_, i) => (
            <option key={i + 1} value={i + 1}>{`Month ${i + 1}`}</option>
          ))}
        </select>

        <select name="sorter" onChange={handleSorterChange} value={sorter}>
          <option value="dateDesc">Date: Newest first</option>
          <option value="dateAsc">Date: Oldest first</option>
          <option value="amountDesc">Amount: High to low</option>
          <option value="amountAsc">Amount: Low to high</option>
        </select>

        <button className="import-excel-btn" onClick={() => setShowImport(true)}>
          ↑ Import Excel
        </button>
        <button className="import-excel-btn" onClick={() => setShowDepreciation(true)} style={{ marginLeft: 8 }}>
          ∑ Depreciation
        </button>
        <button className="import-excel-btn" onClick={handleExportLedger} style={{ marginLeft: 8 }} disabled={exportingLedger} title="Export current ledger view to Excel">
          {exportingLedger ? 'Exporting...' : '↓ Export Ledger'}
        </button>
      </div>

      <div className="status-note">
        <span>Total: {processedTransactions.length}</span>
        <span>Fiscal Year: {filters.fiscalYear === 'all' ? 'All Years' : filters.fiscalYear}</span>
        <span>View: ledger mode</span>
        <span>{filters.accountId ? 'Running balance is calculated live' : 'Select one account to calculate running balance'}</span>
        {error && <span className="error-text inline-error">{error}</span>}
      </div>

      <table className="transactions-table">
        <thead>
          <tr>
            <th>ID</th>
            <th>Date</th>
            <th>Account</th>
            <th>Contra</th>
            <th>Description</th>
            <th>Debit</th>
            <th>Credit</th>
            <th>Running Bal</th>
            <th>Stmt Bal</th>
            <th>Ref</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {processedTransactions.map((tx) => (
            <TransactionRowMemo 
              key={tx.id} 
              tx={tx} 
              is1600={filters.accountId === '1600'} 
              isEditing={editingTxId === tx.id} 
              onEditClick={handleEditClick} 
              onEditCancel={handleEditCancel} 
              onEditSave={handleEditSave} 
              onReorder={handleReorder}
              onSplitClick={handleSplitClick}
            />
          ))}
          {!loading && processedTransactions.length === 0 && (
            <tr><td colSpan="11">No transaction data</td></tr>
          )}
          {loading && (
            <tr><td colSpan="11">Loading transactions...</td></tr>
          )}
        </tbody>
      </table>
      <button 
        onClick={fetchTransactions}
        className="floating-refresh-btn"
        title="Refresh View"
      >
        ↻
      </button>

      {showImport && (
        <ImportModal
          accounts={accounts}
          onClose={() => setShowImport(false)}
          onImported={fetchTransactions}
        />
      )}

      {splitTxId && (
        <SplitModal
          tx={transactions.find(t => t.id === splitTxId) || {}}
          accounts={accounts}
          onClose={() => setSplitTxId(null)}
          onSave={handleSplitSave}
        />
      )}

      {showDepreciation && (
        <DepreciationModal
          accounts={accounts}
          fiscalYears={fiscalYears}
          onClose={() => setShowDepreciation(false)}
          onSaved={fetchTransactions}
        />
      )}
    </div>
  );
};

export default TransactionsPage;