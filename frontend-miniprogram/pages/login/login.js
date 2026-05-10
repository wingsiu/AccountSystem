// pages/login/login.js
const { authService } = require('../../utils/apiService');

Page({
  data: {},
  
  handleLogin(e) {
    const { email, password } = e.detail.value;
    authService.login({ email, password })
      .then(response => {
        wx.setStorageSync('authToken', response.token);
        wx.navigateTo({
          url: '/pages/index/index',
        });
      })
      .catch(error => {
        wx.showToast({
          title: '登录失败',
          icon: 'error',
        });
      });
  }
});
