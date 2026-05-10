// pages/profile/profile.js
Page({
  data: {
    userInfo: {},
  },
  
  onLoad() {
    this.loadUserInfo();
  },
  
  loadUserInfo() {
    const userInfo = wx.getStorageSync('userInfo') || {};
    this.setData({ userInfo });
  },
  
  logout() {
    wx.removeStorageSync('authToken');
    wx.removeStorageSync('userInfo');
    wx.navigateTo({
      url: '/pages/login/login',
    });
  }
});
