const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');
const setting = require('../setting/setting.js');

Page({
	data: {
		item: null,
		loading: false,
	},

	onLoad: async function () {
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

	loadCurrent: async function () {
		let item = await cloudHelper.callCloudData('queue/my_current', {}, { title: '加载中' });
		this.setData({ item });
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

	bindHomeTap: function () {
		wx.redirectTo({ url: '/driver/home' });
	},

	bindRefreshTap: function () {
		this.loadCurrent();
	},
});
