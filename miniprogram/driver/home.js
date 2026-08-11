const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');

Page({
	data: {
		actions: [],
		actionIndex: 0,
		plate: '',
		phone: '',
		cargoName: '',
		proof: '',
		proofLocal: '',
		submitting: false,
	},

	onLoad: async function () {
		this._checkLogin();
		if (!await this._checkRegistration()) return;
		this._loadOptions();
	},

	onShow: async function () {
		this._checkLogin();
		if (!await this._checkRegistration()) return;
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

	_loadOptions: async function () {
		let data = await cloudHelper.callCloudData('queue/options', {}, { title: '加载中' });
		if (!data) return;
		this.setData({
			actions: data.actions || [],
		});
	},

	bindActionChange: function (e) {
		this.setData({ actionIndex: Number(e.detail.value) });
	},

	bindPlateInput: function (e) {
		this.setData({ plate: e.detail.value.toUpperCase() });
	},

	bindPhoneInput: function (e) {
		this.setData({ phone: e.detail.value });
	},

	bindCargoNameInput: function (e) {
		this.setData({ cargoName: e.detail.value });
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
		let action = this.data.actions[this.data.actionIndex];

		if (!action) return wx.showToast({ title: '请选择装货或卸货', icon: 'none' });
		if (!this.data.plate || this.data.plate.length < 3) return wx.showToast({ title: '请输入车牌号', icon: 'none' });
		if (!/^1\d{10}$/.test(this.data.phone)) return wx.showToast({ title: '请输入正确手机号', icon: 'none' });
		this.setData({ submitting: true });
		try {
			await cloudHelper.callCloudSumbit('queue/create', {
				action: action.id,
				plate: this.data.plate,
				phone: this.data.phone,
				proof: this.data.proof,
				cargoName: this.data.cargoName.trim(),
			}, { title: '预约中' });

			wx.showToast({ title: '预约成功', icon: 'success' });
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
