// API service for mini program
const API_BASE_URL = 'http://localhost:8080/api/v1';
const AUTH_TOKEN_KEY = 'authToken';

const getAuthToken = () => wx.getStorageSync(AUTH_TOKEN_KEY) || wx.getStorageSync('token');

const clearAuthToken = () => {
  wx.removeStorageSync(AUTH_TOKEN_KEY);
  wx.removeStorageSync('token');
};

export const request = (method, url, data = null, options = {}) => {
  const { withAuth = true } = options;
  const token = withAuth ? getAuthToken() : null;
  
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
        } else if (res.statusCode === 401) {
          clearAuthToken();
          reject(res.data);
        } else {
          reject(res.data);
        }
      },
      fail: reject
    });
  });
};

export const authService = {
  register: (data) => request('POST', '/auth/register', data, { withAuth: false }),
  login: (data) => request('POST', '/auth/login', data, { withAuth: false }),
};

export const accountService = {
  listAccounts: () => request('GET', '/accounts'),
  createAccount: (data) => request('POST', '/accounts', data),
};

export const transactionService = {
  listTransactions: (accountId) => request('GET', `/transactions?account_id=${accountId}`),
  createTransaction: (data) => request('POST', '/transactions', data),
};
