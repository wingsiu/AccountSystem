import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api/v1';
const AUTH_TOKEN_KEY = 'authToken';

const getAuthToken = () => localStorage.getItem(AUTH_TOKEN_KEY) || localStorage.getItem('token');

export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
};

export const clearAuthToken = () => {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem('token');
};

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add JWT token to requests
apiClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      clearAuthToken();
    }
    return Promise.reject(error);
  }
);

// Transactions API
export const fetchTransactions = (filters) => {
  const params = { ...filters };
  if (filters.sorter) {
    params.sort = filters.sorter;
  }
  return apiClient.get('/transactions', { params });
};

export const editTransaction = (id, data) => {
  return apiClient.put(`/transactions/${id}`, data);
};

export const importTransactions = (file) => {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post('/transactions/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

export const createTransaction = (data) => {
  return apiClient.post('/transactions', data);
};

// Account API
export const accountService = {
  getAccounts: () => apiClient.get('/accounts'),
};

export default apiClient;
