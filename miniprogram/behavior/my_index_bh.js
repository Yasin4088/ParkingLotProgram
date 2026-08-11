const cacheHelper = require('../helper/cache_helper.js');
const pageHelper = require('../helper/page_helper.js');
const cloudHelper = require('../helper/cloud_helper.js');
const timeHelper = require('../helper/time_helper.js');
const PassortBiz = require('../biz/passport_biz.js');
const setting = require('../setting/setting.js');

module.exports = Behavior({
	data: {
		myTodayList: null
	},

	methods: {
		onLoad: async function (options) {
			if (setting.IS_SUB) wx.hideHomeButton();
		},

		_loadTodayList: async function () {
			try {
				let params = {
					day: timeHelper.time('Y-M-D')
				}
				let opts = {
					title: 'bar'
				}
				await cloudHelper.callCloudSumbit('my/my_join_someday', params, opts).then(res => {
					this.setData({
						myTodayList: res.data
					});
				});
			} catch (err) {
				console.log(err)
			}
		},

		onReady: function () {},

		onShow: async function () {
			await this._loadTodayList();
			this._loadUser();
		},

		onHide: function () {},

		onUnload: function () {},

		_loadUser: async function (e) {
			let opts = { title: 'bar' }
			let user = await cloudHelper.callCloudData('passport/my_detail', {}, opts);
			if (!user) return;
			this.setData({ user })
		},

		onPullDownRefresh: async function () {
			await this._loadTodayList();
			await this._loadUser();
			wx.stopPullDownRefresh();
		},

		onReachBottom: function () {},

		onShareAppMessage: function () {},

		url: function (e) {
			pageHelper.url(e, this);
		},

		setTap: function (e, skin) {
			let itemList = ['清除缓存', '切换账号'];
			wx.showActionSheet({
				itemList,
				success: async res => {
					let idx = res.tapIndex;
					if (idx == 0) {
						cacheHelper.clear();
						pageHelper.showNoneToast('清除缓存成功');
					}
					if (idx == 1) {
						PassortBiz.clearToken();
						wx.reLaunch({
							url: '/pages/login/login',
						});
					}
				},
				fail: function (res) {}
			})
		}
	}
})
