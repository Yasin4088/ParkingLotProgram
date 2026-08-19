const pageHelper = require('../../../../helper/page_helper.js'); // 保留引用（模板兼容）

Page({

	data: {},

	onLoad: function (options) {
		// 自动跳转到新的统一登录页
		wx.redirectTo({
			url: '/pages/login/login',
		});
	},

	bindBackTap: function (e) {
		wx.navigateBack({
			delta: 1,
			fail: () => wx.reLaunch({ url: '/pages/login/login' })
		});
	},

	bindLoginTap: async function (e) {
		wx.redirectTo({
			url: '/pages/login/login',
		});
	}

})
