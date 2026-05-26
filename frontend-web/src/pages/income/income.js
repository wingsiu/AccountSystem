import React, { useEffect, useState, useCallback, useMemo } from 'react';
import './income.css';
import { incomeService, fiscalYearService } from '../../services';

const PAY_METHOD = { 0: '支票', 1: '現金', 2: '轉帳' };

const formatAmt = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return '-';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const getFYDates = (year) => {
  if (year === 'all') return {};
  const y = Number(year);
  return { from: `${y}-04-01`, to: `${y + 1}-03-31 23:59:59` };
};

export default function IncomePage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(false);
  const [candidatesLoading, setCandidatesLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('all'); // all | linked | unlinked
  const [search, setSearch] = useState('');
  const [fiscalYears, setFiscalYears] = useState([]);
  const [selectedYear, setSelectedYear] = useState('all');
  // Edit modal
  const [editEntry, setEditEntry] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editSaving, setEditSaving] = useState(false);

  // candidateMap: { [entryId]: { list, selected } }
  const [candidateMap, setCandidateMap] = useState({});
  const [linkingId, setLinkingId] = useState(null);

  const loadAllCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const res = await incomeService.getAllCandidates();
      // res.data is { "entryId": [candidates] }
      const data = res.data || {};
      setCandidateMap((prev) => {
        const next = { ...prev };
        for (const [id, list] of Object.entries(data)) {
          // Only set if not already manually opened/set for this entry
          if (!next[id] || !next[id].manuallyLoaded) {
            next[id] = { list, selected: '' };
          }
        }
        return next;
      });
    } catch (err) {
      // Non-fatal — user can still load per-entry
      console.warn('Bulk candidates failed:', err?.message);
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  const loadEntries = useCallback(async (year) => {
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const params = getFYDates(year ?? selectedYear);
      const res = await incomeService.listIncomeEntries(Object.keys(params).length ? params : undefined);
      setEntries(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      setError(err?.response?.data?.reason || err?.message || 'Failed to load income entries');
    } finally {
      setLoading(false);
    }
  }, [selectedYear]);

  // On mount: load fiscal years + entries + candidates
  useEffect(() => {
    fiscalYearService.listFiscalYears().then((res) => {
      const years = Array.isArray(res.data) ? res.data : [];
      setFiscalYears(years);
      const nums = years.map((y) => Number(y?.year)).filter(Number.isFinite);
      const latest = nums.length ? String(Math.max(...nums)) : 'all';
      setSelectedYear(latest);
      loadEntries(latest).then(() => loadAllCandidates());
    }).catch(() => {
      loadEntries('all').then(() => loadAllCandidates());
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Per-entry manual reload (for linked entries wanting to add more)
  const loadCandidatesForEntry = async (entryId) => {
    setCandidateMap((prev) => ({
      ...prev,
      [entryId]: { loading: true, list: [], selected: '', manuallyLoaded: true },
    }));
    try {
      const res = await incomeService.getCandidates(entryId);
      setCandidateMap((prev) => ({
        ...prev,
        [entryId]: { loading: false, list: Array.isArray(res.data) ? res.data : [], selected: '', manuallyLoaded: true },
      }));
    } catch (err) {
      setCandidateMap((prev) => ({
        ...prev,
        [entryId]: { loading: false, list: [], selected: '', error: err?.message || 'Error', manuallyLoaded: true },
      }));
    }
  };

  const handleLink = async (entryId) => {
    const sel = candidateMap[entryId]?.selected;
    if (!sel) return;
    setLinkingId(entryId);
    setError('');
    try {
      await incomeService.linkEntry(entryId, Number(sel));
      setNotice(`Entry ${entryId} linked to transaction ${sel}.`);
      // Remove this entry from candidateMap (it's now linked, bulk reload will skip it)
      setCandidateMap((prev) => {
        const next = { ...prev };
        delete next[entryId];
        return next;
      });
      await loadEntries();
      // Refresh bulk candidates to remove newly-linked tx from other entries
      await loadAllCandidates();
    } catch (err) {
      setError(err?.response?.data?.reason || err?.message || 'Link failed');
    } finally {
      setLinkingId(null);
    }
  };

  const handleYearChange = (year) => {
    setSelectedYear(year);
    setCandidateMap({});
    loadEntries(year).then(() => loadAllCandidates());
  };

  const openEdit = (entry) => {
    setEditEntry(entry);
    setEditForm({
      date: entry.date ? entry.date.substring(0, 10) : '',
      amount: entry.amount,
      pay_method: entry.pay_method,
      Remarks: entry.Remarks || entry.remarks || '',
      ref_no: entry.ref_no || '',
    });
  };

  const handleSaveEdit = async () => {
    if (!editEntry) return;
    setEditSaving(true);
    setError('');
    try {
      await incomeService.updateEntry(editEntry.id, {
        date: editForm.date,
        amount: Number(editForm.amount),
        pay_method: Number(editForm.pay_method),
        Remarks: editForm.Remarks,
        ref_no: editForm.ref_no,
      });
      setNotice(`Entry ${editEntry.id} updated.`);
      setEditEntry(null);
      await loadEntries();
    } catch (err) {
      setError(err?.response?.data?.reason || err?.message || 'Save failed');
    } finally {
      setEditSaving(false);
    }
  };

  const handleUnlink = async (entryId, txId) => {
    setLinkingId(entryId);
    setError('');
    try {
      await incomeService.unlinkEntry(entryId, txId);
      setNotice(`Unlinked transaction ${txId} from entry ${entryId}.`);
      await loadEntries();
      await loadAllCandidates();
    } catch (err) {
      setError(err?.response?.data?.reason || err?.message || 'Unlink failed');
    } finally {
      setLinkingId(null);
    }
  };

  const filtered = useMemo(() => {
    let list = entries;
    if (filter === 'linked') list = list.filter((e) => {
      const linkedSum = (e.linked_txs || []).reduce((s, tx) => s + (Number(tx.net) || 0), 0);
      return e.linked_txs?.length > 0 && Math.round((linkedSum - Number(e.amount)) * 100) / 100 === 0;
    });
    if (filter === 'unlinked') list = list.filter((e) => {
      if (!e.linked_txs?.length) return true;
      const linkedSum = (e.linked_txs || []).reduce((s, tx) => s + (Number(tx.net) || 0), 0);
      return Math.round((linkedSum - Number(e.amount)) * 100) / 100 !== 0;
    });
    if (search.trim()) {
      const kw = search.trim().toLowerCase();
      list = list.filter((e) =>
        String(e.id).includes(kw) ||
        String(e.date).includes(kw) ||
        String(e.amount).includes(kw) ||
        (e.linked_txs || []).some(
          (tx) => String(tx.student_name || '').toLowerCase().includes(kw)
        )
      );
    }
    return list;
  }, [entries, filter, search]);

  const linkedCount = entries.filter((e) => {
    if (!e.linked_txs?.length) return false;
    const linkedSum = (e.linked_txs || []).reduce((s, tx) => s + (Number(tx.net) || 0), 0);
    return Math.round((linkedSum - Number(e.amount)) * 100) / 100 === 0;
  }).length;
  const mismatchCount = entries.filter((e) => {
    if (!e.linked_txs?.length) return false;
    const linkedSum = (e.linked_txs || []).reduce((s, tx) => s + (Number(tx.net) || 0), 0);
    return Math.round((linkedSum - Number(e.amount)) * 100) / 100 !== 0;
  }).length;
  const unlinkedCount = entries.length - linkedCount - mismatchCount;

  return (
    <section className="card income-workspace">
      <div className="workspace-head">
        <div>
          <h2>Income Entries (acc=4100)</h2>
          <p>收入分錄 — 查看連結的學生交易，或手動選擇未連結分錄的對應交易</p>
        </div>
        <div className="workspace-tools">
          <input
            className="search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search date / amount / student"
          />
          <select className="filter-select" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="linked">Linked only</option>
            <option value="unlinked">Unlinked only</option>
          </select>
          <select
            className="filter-select"
            value={selectedYear}
            onChange={(e) => handleYearChange(e.target.value)}
          >
            <option value="all">All Years</option>
            {[...fiscalYears]
              .sort((a, b) => Number(b.year) - Number(a.year))
              .map((fy) => (
                <option key={fy.year} value={String(fy.year)}>
                  FY{fy.year} (Apr {fy.year} – Mar {Number(fy.year) + 1})
                </option>
              ))}
          </select>
          <button className="refresh-btn" onClick={() => loadEntries().then(() => loadAllCandidates())} disabled={loading || candidatesLoading}>
            {loading ? 'Loading...' : candidatesLoading ? 'Loading candidates...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="status-note">
        <span>Total: {entries.length}</span>
        <span>Linked: {linkedCount}</span>
        <span style={{ color: mismatchCount > 0 ? '#721c24' : undefined }}>Mismatch: {mismatchCount}</span>
        <span style={{ color: unlinkedCount > 0 ? '#856404' : undefined }}>Unlinked: {unlinkedCount}</span>
        {notice && <span className="success-text">{notice}</span>}
        {error && <span className="error-text">{error}</span>}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Date</th>
              <th>Amount</th>
              <th>Pay Method</th>
              <th>Remarks</th>
              <th>Ref No</th>
              <th>Status</th>
              <th>Linked Transactions</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan="8" style={{ textAlign: 'center' }}>Loading...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan="9" style={{ textAlign: 'center' }}>No entries found</td></tr>
            )}
            {filtered.map((entry) => {
              const linked = entry.linked_txs || [];
              const isLinked = linked.length > 0;
              const linkedSum = linked.reduce((s, tx) => s + (Number(tx.net) || 0), 0);
              const diff = Math.round((linkedSum - Number(entry.amount)) * 100) / 100;
              const sumMatches = isLinked && diff === 0;
              const sumMismatch = isLinked && diff !== 0;
              const cState = candidateMap[entry.id];
              const isLinking = linkingId === entry.id;

              return (
                <tr key={entry.id} className={!isLinked ? 'candidate-row' : ''}>
                  <td>{entry.id}</td>
                  <td>{entry.date}</td>
                  <td style={{ textAlign: 'right' }}>{formatAmt(entry.amount)}</td>
                  <td>{PAY_METHOD[entry.pay_method] ?? entry.pay_method}</td>
                  <td>{entry.Remarks || entry.remarks || '-'}</td>
                  <td>{entry.ref_no || '-'}</td>
                  <td>
                    {sumMatches && <span className="linked-badge">✓ {linked.length}</span>}
                    {sumMismatch && (
                      <span className="mismatch-badge" title={`Sum: ${formatAmt(linkedSum)}, Entry: ${formatAmt(entry.amount)}, Diff: ${formatAmt(diff)}`}>
                        ⚠ {linked.length} | Δ{formatAmt(diff)}
                      </span>
                    )}
                    {!isLinked && <span className="unlinked-badge">⚠ Unlinked</span>}
                  </td>
                  <td>
                    {/* Always show linked chips */}
                    {linked.length > 0 && (
                      <div style={{ marginBottom: '0.4rem' }}>
                        {linked.map((tx) => (
                          <span className="tx-chip" key={tx.transaction_id}>
                            <span>#{tx.transaction_id}</span>
                            {tx.student_name && <span>{tx.student_name}</span>}
                            {tx.net != null && <span>${formatAmt(tx.net)}</span>}
                            <button
                              className="unlink-btn"
                              title="Unlink"
                              disabled={isLinking}
                              onClick={() => handleUnlink(entry.id, tx.transaction_id)}
                            >✕</button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Add more / candidate panel — hide when sum matches */}
                    {!sumMatches && (
                    <div className="candidate-panel">
                      {cState?.loading ? (
                        <span>Loading...</span>
                      ) : cState?.error ? (
                        <span className="error-text">{cState.error}</span>
                      ) : cState && cState.list.length === 0 ? (
                        isLinked
                          ? null  // already linked correctly, no candidates needed
                          : candidatesLoading
                            ? <span style={{ fontSize: '0.78rem', color: '#888' }}>Loading candidates...</span>
                            : <span className="no-match-badge">No candidates</span>
                      ) : cState && cState.list.length > 0 ? (
                        <>
                          <select
                            value={cState.selected}
                            onChange={(e) =>
                              setCandidateMap((prev) => ({
                                ...prev,
                                [entry.id]: { ...prev[entry.id], selected: e.target.value },
                              }))
                            }
                          >
                            <option value="">— select transaction —</option>
                            {cState.list.map((tx) => (
                              <option key={tx.transaction_id} value={tx.transaction_id}>
                                #{tx.transaction_id} | {tx.student_name || '?'} | ${formatAmt(tx.net)} | {tx.bank_date}
                                {tx.cheque ? ` | chq:${tx.cheque}` : ''}
                              </option>
                            ))}
                          </select>
                          <div style={{ display: 'flex', gap: '0.4rem' }}>
                            <button
                              className="link-btn"
                              disabled={!cState.selected || isLinking}
                              onClick={() => handleLink(entry.id)}
                            >
                              {isLinking ? 'Linking...' : 'Link'}
                            </button>
                            {isLinked && (
                              <button
                                className="load-candidates-btn"
                                onClick={() => setCandidateMap((prev) => {
                                  const next = { ...prev };
                                  delete next[entry.id];
                                  return next;
                                })}
                              >✕</button>
                            )}
                          </div>
                        </>
                      ) : (
                        // Not yet loaded (only happens for linked entries before user clicks + Add)
                        isLinked
                          ? <button
                              className="load-candidates-btn"
                              onClick={() => loadCandidatesForEntry(entry.id)}
                            >+ Add transaction</button>
                          : candidatesLoading
                            ? <span style={{ fontSize: '0.78rem', color: '#888' }}>Loading candidates...</span>
                            : <span className="no-match-badge">No candidates</span>
                      )}
                    </div>
                    )}
                  </td>
                  <td>
                    <button className="edit-btn" onClick={() => openEdit(entry)}>Edit</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Edit Modal */}
      {editEntry && (
        <div className="modal-overlay" onClick={() => setEditEntry(null)}>
          <div className="edit-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Edit Entry #{editEntry.id}</h3>
            <div className="edit-form">
              <label>Date</label>
              <input
                type="date"
                value={editForm.date}
                onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value }))}
              />
              <label>Amount</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={editForm.amount}
                onChange={(e) => setEditForm((f) => ({ ...f, amount: e.target.value }))}
              />
              <label>Pay Method</label>
              <select
                value={editForm.pay_method}
                onChange={(e) => setEditForm((f) => ({ ...f, pay_method: e.target.value }))}
              >
                <option value={0}>支票</option>
                <option value={1}>現金</option>
                <option value={2}>轉帳</option>
              </select>
              <label>Remarks</label>
              <input
                type="text"
                value={editForm.Remarks}
                onChange={(e) => setEditForm((f) => ({ ...f, Remarks: e.target.value }))}
              />
              <label>Ref No</label>
              <input
                type="text"
                value={editForm.ref_no}
                onChange={(e) => setEditForm((f) => ({ ...f, ref_no: e.target.value }))}
              />
            </div>
            <div className="edit-modal-actions">
              <button className="link-btn" onClick={handleSaveEdit} disabled={editSaving}>
                {editSaving ? 'Saving...' : 'Save'}
              </button>
              <button className="load-candidates-btn" onClick={() => setEditEntry(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
