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
		subscribing: false,
		statusBar: 0,
		customBar: 0,
		navBarHeight: 0,
	},

	onLoad: async function () {
		this._initNavMetrics();
		this._checkLogin();
		if (!await this._checkRegistration()) return;
		this.loadCurrent();
		this._loaded = true;
	},

	onShow: async function () {
		if (!this._loaded) return; // 首次加载由 onLoad 处理，避免重复请求导致闪烁
		this._checkLogin();
		this.loadCurrent(true); // 返回页面时静默刷新
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

	loadCurrent: async function (silent) {
		let options = silent ? { title: '', hint: false } : { title: '加载中' };
		let data = await cloudHelper.callCloudData('queue/my_current', {}, options);
		this.setData({
			item: (data && data.item) || null,
			lastDone: (data && data.lastDone) || null,
		});
	},

	bindCheckinTap: function () {
		if (!this.data.item) return;
		this.setData({ loading: true });

		// 隐私授权前置（基础库 2.32.3+）：未同意隐私政策时先弹系统隐私窗，同意后再定位
		if (wx.requirePrivacyAuthorize) {
			wx.requirePrivacyAuthorize({
				success: () => this._doCheckin(),
				fail: () => {
					this.setData({ loading: false });
					wx.showToast({ title: '需同意隐私政策才能定位签到', icon: 'none' });
				}
			});
		} else {
			this._doCheckin();
		}
	},

	/** 定位并签到（隐私授权通过后执行） */
	_doCheckin: function () {
		if (!this.data.item) {
			this.setData({ loading: false });
			return;
		}
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
					wx.showToast({ title: (e && e.msg) || '签到失败，请重试', icon: 'none' });
				}
			},
			fail: err => {
				console.error('getLocation失败', err);
				wx.showToast({ title: '定位失败：' + (err && err.errMsg ? err.errMsg : '请授权定位'), icon: 'none' });
			},
			complete: () => {
				this.setData({ loading: false });
			}
		});
	},

	bindSubscribeTap: async function () {
		if (this.data.subscribing || !this.data.item) return; // 防重复点击（requestSubscribeMessage 上一次未结束会报 last call has not ended）
		this.setData({ subscribing: true });
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
		} finally {
			this.setData({ subscribing: false });
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

	/** 在线支付装卸货费用：queue/pay 下单 + wx.requestPayment（查单兜底发现已支付时不再拉起支付） */
	bindPayTap: async function () {
		if (this.data.paying) return;
		if (!this.data.item || this.data.item.QUEUE_STATUS !== 6) return;
		let id = this.data.item._id;

		this.setData({ paying: true });
		try {
			let payRes = await cloudHelper.callCloudSumbit('queue/pay', { id }, { title: '下单中' });
			if (payRes.data.paid) {
				// 查单兜底：此前已支付成功，直接刷新状态
				wx.showToast({ title: '已支付，任务完成', icon: 'success' });
			} else {
				await new Promise((resolve, reject) => {
					wx.requestPayment({
						...payRes.data.payParams,
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
				wx.showToast({ title: '支付成功，任务完成', icon: 'success' });
			}
			this.loadCurrent();
		} catch (err) {
			console.log(err);
			wx.showToast({ title: (err && err.msg) || '支付失败，请重试', icon: 'none' });
		} finally {
			this.setData({ paying: false });
		}
	},

	bindHomeTap: function () {
		wx.redirectTo({ url: '/driver/biz_select' });
	},

	bindRefreshTap: function () {
		this.loadCurrent();
	},

	bindLogoutTap: function () {
		cacheHelper.remove(constants.CACHE_TOKEN);
		wx.redirectTo({ url: '/pages/login/login' });
	},
});
