// pages/index/index.js
Page({
  data: {},
  
  onLoad() {
    console.log('Index page loaded');
  },
  
  navigateToAccounts() {
    wx.navigateTo({
      url: '/pages/accounts/accounts',
    });
  },
  
  navigateToTransactions() {
    wx.navigateTo({
      url: '/pages/transactions/transactions',
    });
  }
});
