import apiClient from './apiClient';

export const authService = {
  register: (data) => apiClient.post('/auth/register', data),
  login: (data) => apiClient.post('/auth/login', data),
};

export const userService = {
  getProfile: (id) => apiClient.get(`/users/${id}`),
  updateProfile: (id, data) => apiClient.put(`/users/${id}`, data),
};

export const accountService = {
  listAccounts: () => apiClient.get('/accounts'),
  createAccount: (data) => apiClient.post('/accounts', data),
  getAccount: (id) => apiClient.get(`/accounts/${id}`),
};

export const transactionService = {
  listTransactions: (accountId) => apiClient.get('/transactions', { params: { account_id: accountId } }),
  createTransaction: (data) => apiClient.post('/transactions', data),
};
