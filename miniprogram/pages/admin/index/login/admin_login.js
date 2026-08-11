const pageHelper = require('../../../../helper/page_helper.js');

Page({

	data: {},

	onLoad: function (options) {
		// 自动跳转到新的统一登录页
		wx.redirectTo({
			url: '/pages/login/login',
		});
	},

	bindBackTap: function (e) {
		wx.reLaunch({
			url: pageHelper.fmtURLByPID('/projects/A00/my/index/my_index'),
		});
	},

	bindLoginTap: async function (e) {
		wx.redirectTo({
			url: '/pages/login/login',
		});
	}

})
