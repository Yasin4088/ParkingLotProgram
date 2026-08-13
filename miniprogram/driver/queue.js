const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');
const setting = require('../setting/setting.js');
const app = getApp();

Page({
	data: {
		item: null,
		lastDone: null,
		loading: false,
		paying: false,
		statusBar: 0,
		customBar: 0,
		navBarHeight: 0,
	},

	onLoad: async function () {
		this._initNavMetrics();
		this._checkLogin();
		if (!await this._checkRegistration()) return;
		this.loadCurrent();
	},

	onShow: async function () {
		this._checkLogin();
		if (!await this._checkRegistration()) return;
		this.loadCurrent();
	},

	_checkLogin: function () {
		let user = cacheHelper.get(constants.CACHE_TOKEN);
		if (!user || !user.id) {
			wx.redirectTo({ url: '/pages/login/login' });
		}
	},

	_checkRegistration: async function () {
		try {
			let driverInfo = await cloudHelper.callCloudData('driver/getInfo', {}, { title: '' });
			if (!driverInfo || !driverInfo.USER_IDCARD) {
				wx.redirectTo({ url: '/pages/driver/register/register' });
				return false;
			}
			return true;
		} catch (err) {
			console.error('检查注册状态失败', err);
			return false;
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

	loadCurrent: async function () {
		let data = await cloudHelper.callCloudData('queue/my_current', {}, { title: '加载中' });
		this.setData({
			item: (data && data.item) || null,
			lastDone: (data && data.lastDone) || null,
		});
	},

	bindCheckinTap: function () {
		if (!this.data.item) return;
		this.setData({ loading: true });
		wx.getLocation({
			type: 'gcj02',
			success: async res => {
				try {
					let result = await cloudHelper.callCloudSumbit('queue/checkin', {
						id: this.data.item._id,
						lat: res.latitude,
						lng: res.longitude,
					}, { title: '签到中' });
					if (result && result.data) {
						this.setData({
							item: result.data.item || null,
							lastDone: result.data.lastDone || null,
						});
					}
					wx.showToast({ title: '签到成功', icon: 'success' });
				} catch (e) {
					console.log(e);
				}
			},
			fail: () => {
				wx.showToast({ title: '请授权定位后签到', icon: 'none' });
			},
			complete: () => {
				this.setData({ loading: false });
			}
		});
	},

	bindSubscribeTap: async function () {
		if (!this.data.item) return;
		try {
			let tmplIds = [setting.QUEUE_CALL_TEMPLATE_ID, setting.QUEUE_CANCEL_TEMPLATE_ID].filter(id => !!id);
			if (tmplIds.length) {
				await wx.requestSubscribeMessage({
					tmplIds
				});
			}
			await cloudHelper.callCloudSumbit('queue/subscribe', { id: this.data.item._id }, { title: '订阅中' });
			wx.showToast({ title: '已订阅', icon: 'success' });
			this.loadCurrent();
		} catch (e) {
			console.log(e);
		}
	},

	bindConfirmTap: async function () {
		if (!this.data.item) return;
		wx.showModal({
			title: '确认收到',
			content: '确认后叉车司机将前往装卸，确定收到叫号通知？',
			success: async res => {
				if (!res.confirm) return;
				try {
					let result = await cloudHelper.callCloudSumbit('queue/confirm', {
						id: this.data.item._id,
					}, { title: '确认中' });
					this.setData({ item: result.data });
					wx.showToast({ title: '已确认', icon: 'success' });
				} catch (e) {
					console.log(e);
				}
			}
		});
	},

	bindPayTap: function () {
		if (this.data.paying) return;
		wx.showToast({ title: '支付功能即将开通，请联系管理员', icon: 'none' });
	},

	bindHomeTap: function () {
		wx.redirectTo({ url: '/driver/home' });
	},

	bindRefreshTap: function () {
		this.loadCurrent();
	},

	bindLogoutTap: function () {
		cacheHelper.remove(constants.CACHE_TOKEN);
		wx.redirectTo({ url: '/pages/login/login' });
	},
});
