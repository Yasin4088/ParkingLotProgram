const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');
const app = getApp();

Page({
	data: {
		hasActiveQueue: false,
		statusBar: 0,
		customBar: 0,
		navBarHeight: 0,
	},

	onLoad: async function () {
		this._initNavMetrics();
		this._checkLogin();
		if (!await this._checkRegistration()) return;
		this._loaded = true;
	},

	onShow: async function () {
		if (!this._loaded) return; // 首次加载由 onLoad 处理，避免重复请求导致闪烁
		this._checkLogin();
		this._refreshActiveQueue();
	},

	_checkLogin: function () {
		let user = cacheHelper.get(constants.CACHE_TOKEN);
		if (!user || !user.id) {
			wx.redirectTo({ url: '/pages/login/login' });
		}
	},

	_checkRegistration: async function () {
		try {
			let driverInfo = await cloudHelper.callCloudData('driver/getInfo', {}, { title: '', hint: false });
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

	/** 装卸货卡片「进行中」角标：静默走 driver/wxLogin 取最新 hasActiveQueue（同时刷新缓存） */
	_refreshActiveQueue: async function () {
		try {
			let res = await cloudHelper.callCloudData('driver/wxLogin', {}, { title: '', hint: false });
			if (!res || !res.id) return;
			cacheHelper.set(constants.CACHE_TOKEN, res, 86400);
			this.setData({ hasActiveQueue: !!res.hasActiveQueue });
		} catch (err) {
			console.log(err);
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

	bindLoadTap: function () {
		wx.redirectTo({ url: '/driver/home' });
	},

	bindStoreTap: function () {
		wx.redirectTo({ url: '/driver/storage?tab=store' });
	},

	bindFetchTap: function () {
		wx.redirectTo({ url: '/driver/storage?tab=fetch' });
	},

	bindProfileTap: function () {
		wx.navigateTo({ url: '/pages/driver/register/register?mode=edit' });
	},

	bindLogoutTap: function () {
		cacheHelper.remove(constants.CACHE_TOKEN);
		wx.redirectTo({ url: '/pages/login/login' });
	},
});
