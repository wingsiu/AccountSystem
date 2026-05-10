// pages/accounts/accounts.js
const { accountService } = require('../../utils/apiService');

Page({
  data: {
    accounts: [],
  },
  
  onLoad() {
    this.loadAccounts();
  },
  
  loadAccounts() {
    accountService.listAccounts()
      .then(accounts => {
        this.setData({ accounts });
      })
      .catch(error => {
        wx.showToast({
          title: '加载失败',
          icon: 'error',
        });
      });
  },
  
  addAccount() {
    wx.showToast({
      title: '功能开发中',
      icon: 'success',
    });
  }
});
