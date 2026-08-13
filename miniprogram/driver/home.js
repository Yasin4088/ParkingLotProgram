const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');
const app = getApp();

Page({
	data: {
		plate: '',
		phone: '',
		proof: '',
		proofLocal: '',
		submitting: false,
		statusBar: 0,
		customBar: 0,
		navBarHeight: 0,
	},

	onLoad: async function () {
		this._initNavMetrics();
		this._checkLogin();
		if (!await this._checkRegistration()) return;
		this._prefill();
		this._loaded = true;
	},

	onShow: async function () {
		if (!this._loaded) return; // 首次加载由 onLoad 处理，避免重复请求导致闪烁
		this._checkLogin();
		this._prefill();
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

	/** 预填注册时登记的车牌与手机号（可修改） */
	_prefill: async function () {
		try {
			let driverInfo = await cloudHelper.callCloudData('driver/getInfo', {}, { title: '', hint: false });
			if (!driverInfo) return;
			let data = {};
			if (!this.data.plate && driverInfo.USER_LICENSE_PLATE) {
				data.plate = driverInfo.USER_LICENSE_PLATE.toUpperCase();
			}
			if (!this.data.phone && driverInfo.USER_MOBILE) {
				data.phone = driverInfo.USER_MOBILE;
			}
			if (Object.keys(data).length) this.setData(data);
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

	bindPlateInput: function (e) {
		this.setData({ plate: e.detail.value.toUpperCase() });
	},

	bindPhoneInput: function (e) {
		this.setData({ phone: e.detail.value });
	},

	bindChooseProof: function () {
		wx.chooseMedia({
			count: 1,
			mediaType: ['image'],
			sourceType: ['camera', 'album'],
			success: async res => {
				let filePath = res.tempFiles[0].tempFilePath;
				let cloudId = await cloudHelper.transTempPicOne(filePath, 'queue/proof/', '');
				if (!cloudId) return;
				this.setData({
					proof: cloudId,
					proofLocal: filePath,
				});
			}
		});
	},

	bindSubmitTap: async function () {
		if (this.data.submitting) return;

		let plate = (this.data.plate || '').trim().toUpperCase();
		if (!plate || plate.length < 3) return wx.showToast({ title: '请输入车牌号', icon: 'none' });
		if (!/^1\d{10}$/.test(this.data.phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' });

		this.setData({ submitting: true });
		try {
			await cloudHelper.callCloudSumbit('queue/create', {
				plate,
				phone: this.data.phone,
				proof: this.data.proof,
			}, { title: '认领中' });

			wx.showToast({ title: '认领成功', icon: 'success' });
			setTimeout(() => {
				wx.redirectTo({ url: '/driver/queue' });
			}, 700);
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ submitting: false });
		}
	},

	bindQueueTap: function () {
		wx.navigateTo({ url: '/driver/queue' });
	},

	bindProfileTap: function () {
		wx.navigateTo({ url: '/pages/driver/register/register?mode=edit' });
	},

	bindLogoutTap: function () {
		cacheHelper.remove(constants.CACHE_TOKEN);
		wx.redirectTo({ url: '/pages/login/login' });
	},
});
