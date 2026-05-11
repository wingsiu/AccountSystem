import React, { useEffect, useMemo, useState } from 'react';
import './App.css';
import { authService, accountService, transactionService } from './services';
import { clearAuthToken, setAuthToken } from './services/apiClient';
import TransactionsPage from './pages/transactions/transactions';

const MENU_ITEMS = [
  { key: 'transactions', title: 'Transactions (View, Edit, Input, Import)', subtitle: '交易查看、編輯、輸入、導入' },
  { key: 'reports', title: 'Reports', subtitle: '報表' },
  { key: 'accounts', title: 'View / Edit Accounts', subtitle: '帳戶查看與編輯' },
];

const pickField = (row, camelKey, snakeKey) => row?.[camelKey] ?? row?.[snakeKey] ?? '';

const parseNullableInt = (value) => {
  if (value === '' || value === null || value === undefined) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

function App() {
  const [form, setForm] = useState({ username: '', password: '' });
  const [auth, setAuth] = useState(() => {
    const token = localStorage.getItem('authToken') || localStorage.getItem('token');
    const username = localStorage.getItem('demoUsername') || '';
    const role = localStorage.getItem('demoRole') || '';
    return { token, username, role };
  });
  const [accounts, setAccounts] = useState([]);
  const [authLoading, setAuthLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [activeMenu, setActiveMenu] = useState('accounts');
  const [query, setQuery] = useState('');
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [accountTransactions, setAccountTransactions] = useState([]);
  const [txLoading, setTxLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editingForm, setEditingForm] = useState({ accName: '', accType: '', opposite: '', itemChi: '', bC: '' });
  const [savingId, setSavingId] = useState(null);

  const isLoggedIn = Boolean(auth.token);

  const filteredAccounts = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return accounts;
    }
    return accounts.filter((row) => {
      const id = String(row.id ?? '');
      const accName = String(pickField(row, 'accName', 'acc_name') || '').toLowerCase();
      const itemChi = String(pickField(row, 'itemChi', 'item_chi') || '').toLowerCase();
      return id.includes(keyword) || accName.includes(keyword) || itemChi.includes(keyword);
    });
  }, [accounts, query]);

  const loadAccountTransactions = async (accountId) => {
    if (!accountId) {
      setAccountTransactions([]);
      return;
    }
    setTxLoading(true);
    try {
      const txRes = await transactionService.listTransactions({ accountId });
      setAccountTransactions(Array.isArray(txRes.data) ? txRes.data : []);
    } catch (err) {
      const message = err?.response?.data?.reason || err?.message || 'Failed to load account transactions';
      setError(message);
      setAccountTransactions([]);
    } finally {
      setTxLoading(false);
    }
  };

  const loadAccounts = async () => {
    setDataLoading(true);
    setError('');
    setNotice('');
    try {
      const accountRes = await accountService.listAccounts();
      setAccounts(Array.isArray(accountRes.data) ? accountRes.data : []);
    } catch (err) {
      const message = err?.response?.data?.reason || err?.message || 'Failed to load accounts';
      setError(message);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      loadAccounts();
    }
  }, [isLoggedIn]);

  const onLogin = async (e) => {
    e.preventDefault();
    setAuthLoading(true);
    setError('');
    setNotice('');
    try {
      const response = await authService.login({
        username: form.username,
        password: form.password,
      });
      const payload = response.data || {};
      if (!payload.token) {
        throw new Error('Login succeeded but token is missing');
      }
      setAuthToken(payload.token);
      localStorage.setItem('demoUsername', payload.username || form.username);
      localStorage.setItem('demoRole', payload.role || 'unknown');
      setAuth({
        token: payload.token,
        username: payload.username || form.username,
        role: payload.role || 'unknown',
      });
      setForm((prev) => ({ ...prev, password: '' }));
      setNotice('Signed in successfully.');
    } catch (err) {
      const message = err?.response?.data?.reason || err?.message || 'Login failed';
      setError(message);
    } finally {
      setAuthLoading(false);
    }
  };

  const onLogout = () => {
    clearAuthToken();
    localStorage.removeItem('demoUsername');
    localStorage.removeItem('demoRole');
    setAuth({ token: '', username: '', role: '' });
    setAccounts([]);
    setError('');
    setNotice('');
    setForm({ username: '', password: '' });
    setQuery('');
    setEditingId(null);
    setActiveMenu('accounts');
    setSelectedAccount(null);
    setAccountTransactions([]);
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setEditingForm({
      accName: pickField(row, 'accName', 'acc_name') || '',
      itemChi: pickField(row, 'itemChi', 'item_chi') || '',
      accType: String(pickField(row, 'accType', 'acc_type') ?? ''),
      opposite: String(pickField(row, 'opposite', 'opposite') ?? ''),
      bC: String(pickField(row, 'bC', 'b_c') ?? ''),
    });
    setNotice('');
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingForm({ accName: '', accType: '', opposite: '', itemChi: '', bC: '' });
  };

  const saveEdit = async (id) => {
    setSavingId(id);
    setError('');
    setNotice('');
    try {
      const payload = {
        acc_name: editingForm.accName,
        item_chi: editingForm.itemChi,
        acc_type: parseNullableInt(editingForm.accType),
        opposite: parseNullableInt(editingForm.opposite),
        b_c: parseNullableInt(editingForm.bC),
      };

      await accountService.updateAccount(id, payload);

      setAccounts((prev) => prev.map((row) => {
        if (row.id !== id) {
          return row;
        }
        return {
          ...row,
          accName: editingForm.accName,
          itemChi: editingForm.itemChi,
          accType: parseNullableInt(editingForm.accType),
          opposite: parseNullableInt(editingForm.opposite),
          bC: parseNullableInt(editingForm.bC),
        };
      }));

      setNotice(`Account ${id} updated.`);
      if (selectedAccount?.id === id) {
        loadAccountTransactions(id);
      }
      cancelEdit();
    } catch (err) {
      const message = err?.response?.data?.reason || err?.message || 'Failed to update account';
      setError(message);
    } finally {
      setSavingId(null);
    }
  };

  const openAccountTransactions = (row) => {
    setSelectedAccount(row);
    loadAccountTransactions(row.id);
  };

  const renderAccountsModule = () => (
    <section className="card accounts-workspace">
      <div className="workspace-head">
        <div>
          <h2>Edit / View Accounts</h2>
          <p>Search, inspect, and edit account master data.</p>
        </div>
        <div className="workspace-tools">
          <input
            className="search-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID / Account Name / Item"
          />
          <button className="refresh-btn" onClick={loadAccounts} disabled={dataLoading}>
            {dataLoading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div className="status-note">
        <span>Total: {filteredAccounts.length}</span>
        {notice && <span className="success-text">{notice}</span>}
        {error && <span className="error-text inline-error">{error}</span>}
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Account Name</th>
              <th>Item (Chinese)</th>
              <th>Type</th>
              <th>Opposite</th>
              <th>B/C</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredAccounts.map((row) => {
              const isEditing = editingId === row.id;
              return (
                <tr
                  key={row.id}
                  className={!isEditing ? 'clickable-row' : ''}
                  onClick={!isEditing ? () => openAccountTransactions(row) : undefined}
                >
                  <td>{row.id}</td>
                  <td>
                    {isEditing ? (
                      <input value={editingForm.accName} onChange={(e) => setEditingForm((prev) => ({ ...prev, accName: e.target.value }))} />
                    ) : (
                      pickField(row, 'accName', 'acc_name') || '-'
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input value={editingForm.itemChi} onChange={(e) => setEditingForm((prev) => ({ ...prev, itemChi: e.target.value }))} />
                    ) : (
                      pickField(row, 'itemChi', 'item_chi') || '-'
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input value={editingForm.accType} onChange={(e) => setEditingForm((prev) => ({ ...prev, accType: e.target.value }))} />
                    ) : (
                      pickField(row, 'accType', 'acc_type') ?? '-'
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input value={editingForm.opposite} onChange={(e) => setEditingForm((prev) => ({ ...prev, opposite: e.target.value }))} />
                    ) : (
                      pickField(row, 'opposite', 'opposite') ?? '-'
                    )}
                  </td>
                  <td>
                    {isEditing ? (
                      <input value={editingForm.bC} onChange={(e) => setEditingForm((prev) => ({ ...prev, bC: e.target.value }))} />
                    ) : (
                      pickField(row, 'bC', 'b_c') ?? '-'
                    )}
                  </td>
                  <td className="action-cell">
                    {isEditing ? (
                      <>
                        <button className="row-btn" onClick={() => saveEdit(row.id)} disabled={savingId === row.id}>
                          {savingId === row.id ? 'Saving...' : 'Save'}
                        </button>
                        <button className="row-btn secondary" onClick={cancelEdit} disabled={savingId === row.id}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button
                          className="row-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            openAccountTransactions(row);
                          }}
                        >
                          View Tx
                        </button>
                        <button
                          className="row-btn secondary"
                          onClick={(e) => {
                            e.stopPropagation();
                            startEdit(row);
                          }}
                        >
                          Edit
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredAccounts.length === 0 && (
              <tr><td colSpan="7">No account data</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card tx-panel">
        <h3>
          {selectedAccount
            ? `Transactions for Account ${selectedAccount.id} - ${pickField(selectedAccount, 'accName', 'acc_name') || '-'}`
            : 'Transactions for selected account'}
        </h3>
        {selectedAccount ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Date</th>
                  <th>Ref No</th>
                  <th>Debit</th>
                  <th>Credit</th>
                  <th>Balance</th>
                </tr>
              </thead>
              <tbody>
                {accountTransactions.map((tx) => (
                  <tr key={tx.id}>
                    <td>{tx.id}</td>
                    <td>{tx.date ? String(tx.date).slice(0, 10) : '-'}</td>
                    <td>{tx.refNo || tx.ref_no || '-'}</td>
                    <td>{tx.drAmount ?? tx.dr_amount ?? '-'}</td>
                    <td>{tx.crAmount ?? tx.cr_amount ?? '-'}</td>
                    <td>{tx.balance ?? '-'}</td>
                  </tr>
                ))}
                {!txLoading && accountTransactions.length === 0 && (
                  <tr><td colSpan="6">No transaction data for this account</td></tr>
                )}
                {txLoading && (
                  <tr><td colSpan="6">Loading transactions...</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="hint-text">Click "View Tx" on an account row to open account transactions.</p>
        )}
      </div>
    </section>
  );

  const renderComingSoon = (title, subtitle) => (
    <section className="card coming-soon">
      <h2>{title}</h2>
      <p>{subtitle}</p>
      <p>This module shell is ready. Next step is implementing the full workflow and APIs.</p>
    </section>
  );

  return (
    <div className="demo-shell">
      <header className="demo-header">
        <div className="brand-block">
          <span className="brand-kicker">ALPHA FINANCE SUITE</span>
          <h1>Alpha Account System</h1>
          <p>Login with existing user to view live accounts and transaction data.</p>
        </div>
        <div className="header-actions">
          {isLoggedIn && (
            <div className="session-mini">
              <div className="session-row"><span>User</span><strong>{auth.username}</strong></div>
              <div className="session-row"><span>Role</span><strong>{auth.role}</strong></div>
              <div className="session-row"><span>Session</span><strong>Active</strong></div>
            </div>
          )}
          {isLoggedIn && (
            <button className="ghost-btn" onClick={onLogout}>Logout</button>
          )}
        </div>
      </header>

      {!isLoggedIn ? (
        <section className="card login-card">
          <h2>Sign In</h2>
          <form onSubmit={onLogin} className="login-form">
            <label>
              Username
              <input
                value={form.username}
                onChange={(e) => setForm((prev) => ({ ...prev, username: e.target.value }))}
                placeholder="e.g. alpha"
                required
              />
            </label>
            <label>
              Password
              <input
                value={form.password}
                onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
                placeholder="Your password"
                type="password"
                required
              />
            </label>
            <button type="submit" disabled={authLoading}>
              {authLoading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
          {error && <p className="error-text">{error}</p>}
        </section>
      ) : (
        <main className="demo-main">
          <section className="card top-canvas">
            <h2>Menu / 功能</h2>
            <div className="menu-grid">
              {MENU_ITEMS.map((item) => (
                <button
                  key={item.key}
                  className={`menu-btn ${activeMenu === item.key ? 'active' : ''}`}
                  onClick={() => setActiveMenu(item.key)}
                >
                  <strong>{item.title}</strong>
                  <span>{item.subtitle}</span>
                </button>
              ))}
            </div>
          </section>

          {activeMenu === 'accounts' && renderAccountsModule()}
          {activeMenu === 'transactions' && <TransactionsPage />}
          {activeMenu === 'reports' && renderComingSoon('Generate Report', 'Report templates and export pipeline will be built next.')}
        </main>
      )}
    </div>
  );
}

export default App;
