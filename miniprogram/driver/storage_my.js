const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');
const app = getApp();

Page({
	data: {
		list: [],
		lastDone: null,
		paying: false,
		wxpayEnable: false,
		statusBar: 0,
		customBar: 0,
		navBarHeight: 0,
	},

	onLoad: async function () {
		this._initNavMetrics();
		this._checkLogin();
		this._loadWxpayEnable();
		await this.loadCurrent();
		this._loaded = true;
	},

	onShow: async function () {
		if (!this._loaded) return; // 首次加载由 onLoad 处理，避免重复请求导致闪烁
		this._checkLogin();
		this.loadCurrent(true);
	},

	_checkLogin: function () {
		let user = cacheHelper.get(constants.CACHE_TOKEN);
		if (!user || !user.id) {
			wx.redirectTo({ url: '/pages/login/login' });
		}
	},

	_loadWxpayEnable: async function () {
		try {
			let res = await cloudHelper.callCloudData('storage/options', {}, { title: '', hint: false });
			this.setData({ wxpayEnable: !!res.wxpayEnable });
		} catch (err) {
			console.log(err);
		}
	},

	async loadCurrent(silent) {
		try {
			let res = await cloudHelper.callCloudData('storage/my_current', {}, silent ? { title: '', hint: false } : {});
			this.setData({ list: res.list || [], lastDone: res.lastDone || null });
		} catch (err) {
			console.error('获取我的存柜失败', err);
			if (!silent) wx.showToast({ title: '获取失败，请重试', icon: 'none' });
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

	bindCopyCode: function (e) {
		let code = e.currentTarget.dataset.code;
		if (!code) return;
		wx.setClipboardData({
			data: code,
			success: () => wx.showToast({ title: '存柜码已复制', icon: 'success' })
		});
	},

	/** 待缴费且选择在线支付：去支付 */
	bindPayTap: async function (e) {
		if (this.data.paying) return;
		let id = e.currentTarget.dataset.id;
		if (!id) return;

		this.setData({ paying: true });
		try {
			let payRes = await cloudHelper.callCloudSumbit('storage/pay', { id }, { title: '下单中' });
			if (payRes.paid) {
				// 查单兜底：此前已支付成功，直接刷新状态
				wx.showToast({ title: '已支付，进入排队', icon: 'success' });
			} else {
				await new Promise((resolve, reject) => {
					wx.requestPayment({
						...payRes.payParams,
						success: resolve,
						fail: err => {
							if (err && err.errMsg && err.errMsg.indexOf('cancel') > -1) {
								wx.showToast({ title: '已取消支付', icon: 'none' });
								resolve();
							} else {
								reject(err);
							}
						}
					});
				});
				wx.showToast({ title: '支付成功，已进入排队', icon: 'success' });
			}
			this.loadCurrent(true);
		} catch (err) {
			console.log(err);
		} finally {
			this.setData({ paying: false });
		}
	},

	bindStoreTap: function () {
		wx.navigateTo({ url: '/driver/storage?tab=store' });
	},

	bindFetchTap: function () {
		wx.navigateTo({ url: '/driver/storage?tab=fetch' });
	},

	bindRefreshTap: function () {
		this.loadCurrent(true);
	},

	bindBackTap: function () {
		wx.redirectTo({ url: '/driver/biz_select' });
	},
});
