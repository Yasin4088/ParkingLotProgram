const ForkliftBiz = require('../../biz/forklift_biz.js');
const cloudHelper = require('../../helper/cloud_helper.js');
const app = getApp();

Page({
	data: {
		isLoad: false,
		task: null,
		loading: false,
		statusBar: 0,
		customBar: 0,
		navBarHeight: 0,
	},

	onLoad: function () {
		this._initNavMetrics();
		if (!ForkliftBiz.isForklift(this)) return;
		this.setData({ isLoad: true });
		this._loadTask();
	},

	onShow: function () {
		if (ForkliftBiz.getForkliftToken()) {
			this._loadTask();
		}
	},

	_loadTask: async function () {
		try {
			let task = await cloudHelper.callCloudData('forklift/my_task', {}, { title: '' });
			this.setData({ task });
		} catch (e) {
			console.log(e);
		}
	},

	_initNavMetrics: function () {
		let statusBar = app.globalData.statusBar || 0;
		let customBar = app.globalData.customBar || 0;

		if (!statusBar || !customBar) {
			let systemInfo = wx.getSystemInfoSync();
			let capsule = wx.getMenuButtonBoundingClientRect();
			statusBar = systemInfo.statusBarHeight || 0;
			customBar = capsule ? capsule.bottom + capsule.top - statusBar : statusBar + 50;
		}

		this.setData({
			statusBar,
			customBar,
			navBarHeight: customBar - statusBar,
		});
	},

	bindCompleteTap: async function () {
		if (!this.data.task || this.data.loading) return;

		wx.showModal({
			title: '确认完成',
			content: '确定已完成装卸任务？',
			success: async res => {
				if (!res.confirm) return;
				this.setData({ loading: true });
				try {
					await cloudHelper.callCloudSumbit('forklift/complete', {
						id: this.data.task._id,
					}, { title: '提交中' });
					wx.showToast({ title: '任务已完成', icon: 'success' });
					this.setData({ task: null });
				} catch (e) {
					console.log(e);
				} finally {
					this.setData({ loading: false });
				}
			}
		});
	},

	bindRefreshTap: function () {
		this._loadTask();
	},

	bindLogoutTap: function () {
		ForkliftBiz.clearForkliftToken();
		wx.redirectTo({ url: '/pages/login/login' });
	},
});
