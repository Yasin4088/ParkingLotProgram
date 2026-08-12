const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');
const setting = require('../setting/setting.js');
const app = getApp();

Page({
	data: {
		item: null,
		loading: false,
		finishing: false,
		uploadingFinishProof: false,
		finishProof: '',
		finishProofLocal: '',
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
		let item = await cloudHelper.callCloudData('queue/my_current', {}, { title: '加载中' });
		let data = { item };
		if (!item || item.QUEUE_STATUS !== 3) {
			data.finishProof = '';
			data.finishProofLocal = '';
			data.uploadingFinishProof = false;
		}
		this.setData(data);
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
					this.setData({ item: result.data });
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

	bindChooseFinishProof: function () {
		if (!this.data.item || this.data.item.QUEUE_STATUS !== 3 || this.data.finishing || this.data.uploadingFinishProof) return;

		wx.chooseMedia({
			count: 1,
			mediaType: ['image'],
			sourceType: ['camera', 'album'],
			success: async res => {
				let filePath = res.tempFiles && res.tempFiles[0] ? res.tempFiles[0].tempFilePath : '';
				if (!filePath) return;
				this.setData({ uploadingFinishProof: true });
				try {
					let cloudId = await cloudHelper.transTempPicOne(filePath, 'queue/finish-proof/', this.data.item._id, false);
					if (!cloudId) return;
					this.setData({
						finishProof: cloudId,
						finishProofLocal: filePath,
					});
					wx.showToast({ title: '凭证已上传', icon: 'success' });
				} catch (e) {
					console.log(e);
					wx.showToast({ title: '上传失败，请重试', icon: 'none' });
				} finally {
					this.setData({ uploadingFinishProof: false });
				}
			}
		});
	},

	bindFinishTap: function () {
		if (!this.data.item || this.data.finishing) return;
		if (this.data.uploadingFinishProof) return wx.showToast({ title: '凭证上传中', icon: 'none' });
		if (!this.data.finishProof) return wx.showToast({ title: '请先上传完成凭证', icon: 'none' });

		wx.showModal({
			title: '确认完成作业',
			content: '确认完成后，该排队记录将结束，并提交完成作业凭证。',
			success: async res => {
				if (!res.confirm) return;
				this.setData({ finishing: true });
				try {
					await cloudHelper.callCloudSumbit('queue/finish', {
						id: this.data.item._id,
						finishProof: this.data.finishProof,
					}, { title: '提交中' });
					wx.showToast({ title: '作业已完成', icon: 'success' });
					this.setData({
						item: null,
						finishProof: '',
						finishProofLocal: '',
					});
				} catch (e) {
					console.log(e);
				} finally {
					this.setData({ finishing: false });
				}
			}
		});
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
