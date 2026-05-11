import React, { useEffect, useMemo, useState, useCallback } from 'react';
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

const TransactionRow = ({ tx, is1600, isEditing, onEditClick, onEditCancel, onEditSave, onReorder }) => {
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
            <button onClick={() => onEditClick(tx.id)}>Edit</button>
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

    if (bfBalanceText && rows.length > 0) {
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

  const handleReorder = useCallback((draggedId, targetId) => {
    setTransactions(prevTransactions => {
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
    </div>
  );
};

export default TransactionsPage;