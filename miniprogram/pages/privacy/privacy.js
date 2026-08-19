Page({
	data: {},
	onLoad: function () {},
	bindBackTap: function () {
		wx.navigateBack({
			delta: 1,
			fail: () => wx.reLaunch({ url: '/pages/login/login' })
		});
	}
});
