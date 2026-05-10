// API service for mini program
const API_BASE_URL = 'http://localhost:8080/api/v1';

export const request = (method, url, data = null) => {
  const token = wx.getStorageSync('authToken');
  
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${url}`,
      method: method,
      data: data,
      header: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data);
        }
      },
      fail: reject
    });
  });
};

export const authService = {
  register: (data) => request('POST', '/auth/register', data),
  login: (data) => request('POST', '/auth/login', data),
};

export const accountService = {
  listAccounts: () => request('GET', '/accounts'),
  createAccount: (data) => request('POST', '/accounts', data),
};

export const transactionService = {
  listTransactions: (accountId) => request('GET', `/transactions?account_id=${accountId}`),
  createTransaction: (data) => request('POST', '/transactions', data),
};
