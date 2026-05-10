// pages/transactions/transactions.js
const { transactionService } = require('../../utils/apiService');

Page({
  data: {
    transactions: [],
  },
  
  onLoad() {
    // TODO: Get accountId from previous page
    // this.loadTransactions(accountId);
  },
  
  loadTransactions(accountId) {
    transactionService.listTransactions(accountId)
      .then(transactions => {
        this.setData({ transactions });
      })
      .catch(error => {
        wx.showToast({
          title: '加载失败',
          icon: 'error',
        });
      });
  }
});
