import apiClient from './apiClient';

export const authService = {
  register: (data) => apiClient.post('/auth/register', data),
  login: (data) => apiClient.post('/auth/login', data),
};

export const userService = {
  getProfile: (id) => apiClient.get(`/users/${id}`),
  updateProfile: (id, data) => apiClient.put(`/users/${id}`, data),
};

export const fiscalYearService = {
  listFiscalYears: () => apiClient.get('/fiscal-years'),
};

export const accountService = {
  listAccounts: () => apiClient.get('/accounts'),
  createAccount: (data) => apiClient.post('/accounts', data),
  updateAccount: (id, data) => apiClient.put(`/accounts/${id}`, data),
  getAccount: (id) => apiClient.get(`/accounts/${id}`),
};

export const transactionService = {
  listTransactions: ({ accountId, fiscalYear } = {}) => apiClient.get('/transactions', {
    params: {
      account_id: accountId,
      fiscal_year: fiscalYear,
    },
  }),
  createTransaction: (data) => apiClient.post('/transactions', data),
  bulkCreateTransactions: (rows) => apiClient.post('/transactions/bulk', rows),
  updateTransaction: (id, data) => apiClient.put(`/transactions/${id}`, data),
  deleteTransaction: (id) => apiClient.delete(`/transactions/${id}`),
};

export const incomeService = {
  listIncomeEntries: (params) => apiClient.get('/income-entries', { params }),
  getAllCandidates: (params) => apiClient.get('/income-entries/all-candidates', { params }),
  getCandidates: (entryId) => apiClient.get(`/income-entries/${entryId}/candidates`),
  linkEntry: (entryId, transactionId) =>
    apiClient.post(`/income-entries/${entryId}/link`, { transaction_id: transactionId }),
  unlinkEntry: (entryId, transactionId) =>
    apiClient.delete(`/income-entries/${entryId}/link/${transactionId}`),
  updateEntry: (entryId, data) => apiClient.put(`/income-entries/${entryId}`, data),
};

export const reportService = {
  getTrialBalance: (fiscalYearId) => apiClient.get('/reports/trial-balance', {
    params: { fiscal_year: fiscalYearId }
  }),
  getIncomeStatement: (fiscalYearId) => apiClient.get('/reports/income-statement', {
    params: { fiscal_year: fiscalYearId }
  }),
  getFinancialPosition: (fiscalYearId) => apiClient.get('/reports/financial-position', {
    params: { fiscal_year: fiscalYearId }
  }),
  getPPESchedule: (fiscalYearId) => apiClient.get('/reports/ppe-schedule', {
    params: { fiscal_year: fiscalYearId }
  }),
};
