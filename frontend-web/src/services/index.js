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
  updateTransaction: (id, data) => apiClient.put(`/transactions/${id}`, data),
};
