const cloudHelper = require('../../helper/cloud_helper.js');
const cacheHelper = require('../../helper/cache_helper.js');
const constants = require('../../biz/constants.js');
const AdminBiz = require('../../biz/admin_biz.js');
const ForkliftBiz = require('../../biz/forklift_biz.js');
const CustomerBiz = require('../../biz/customer_biz.js');
const setting = require('../../setting/setting.js');

Page({

	data: {
		tab: 'driver',
		name: '',
		pwd: '',
		loading: false,
		needSetup: false,   // 系统是否需要初始化
		agreeChecked: false, // 用户协议与隐私政策是否勾选（默认不勾选，勾选后才能登录）
	},

	onLoad: function (options) {
		cacheHelper.remove(constants.CACHE_TOKEN);
		cacheHelper.remove(constants.CACHE_ADMIN);
		cacheHelper.remove(constants.CACHE_FORKLIFT);
		cacheHelper.remove(constants.CACHE_CUSTOMER);
	},

	onShow: function () {
		if (this.data.tab === 'admin') {
			this._checkSetup();
		}
	},

	bindTabTap: function (e) {
		let tab = e.currentTarget.dataset.tab;
		this.setData({
			tab: tab,
			name: '',
			pwd: '',
		});

		if (tab === 'admin') {
			this._checkSetup();
		}	},

	_checkSetup: async function () {
		try {
			let res = await cloudHelper.callCloudData('admin/check_setup', {}, { title: 'bar' });
			this.setData({ needSetup: res && res.needSetup });
		} catch (e) {
			this.setData({ needSetup: false });
		}
	},

	bindNameInput: function (e) {
		this.setData({ name: e.detail.value });
	},

	bindPwdInput: function (e) {
		this.setData({ pwd: e.detail.value });
	},

	bindConfirmPwdInput: function (e) {
		this.setData({ confirmPwd: e.detail.value });
	},

	/** 用户协议勾选（默认不勾选，须用户手动同意；checkbox-group 返回勾选项数组） */
	bindAgreeChange: function (e) {
		let val = e.detail && e.detail.value;
		this.setData({ agreeChecked: Array.isArray(val) ? val.length > 0 : !!val });
	},

	/** 登录前置校验：未勾选协议禁止登录 */
	_guardAgree: function () {
		if (!this.data.agreeChecked) {
			wx.showToast({ title: '请先阅读并勾选同意用户协议与隐私政策', icon: 'none' });
			return false;
		}
		return true;
	},

	/** 查看用户协议与隐私政策 */
	bindPrivacyTap: function () {
		wx.navigateTo({ url: '/pages/privacy/privacy' });
	},

	// 系统初始化（首次部署，创建超级管理员）
	bindSetupTap: async function () {
		if (this.data.loading) return;
		if (!this._guardAgree()) return;

		let name = this.data.name.trim();
		let pwd = this.data.pwd.trim();
		let confirmPwd = this.data.confirmPwd;

		if (!name || name.length < 2) return wx.showToast({ title: '管理员名至少2位', icon: 'none' });
		if (!pwd || pwd.length < 4) return wx.showToast({ title: '密码至少4位', icon: 'none' });
		if (pwd !== confirmPwd) return wx.showToast({ title: '两次密码不一致', icon: 'none' });

		this.setData({ loading: true });

		try {
			await cloudHelper.callCloudSumbit('admin/setup', {
				name: name,
				pwd: pwd,
			}, { title: '初始化中' });

			wx.showToast({ title: '初始化成功，请登录', icon: 'success', duration: 2000 });
			this.setData({ needSetup: false, name: '', pwd: '', confirmPwd: '' });

		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ loading: false });
		}
	},

	// 管理员登录
	bindLoginTap: async function () {
		if (this.data.loading) return;
		if (!this._guardAgree()) return;

		let name = this.data.name.trim();
		let pwd = this.data.pwd.trim();

		if (!name) return wx.showToast({ title: '请输入用户名', icon: 'none' });
		if (pwd.length < 4) return wx.showToast({ title: '密码至少4位', icon: 'none' });

		this.setData({ loading: true });

		try {
			let res = await cloudHelper.callCloudSumbit('admin/login', {
				name: name,
				pwd: pwd,
			}, { title: '登录中' });

			AdminBiz.adminLogin(res.data);
			wx.navigateTo({ url: '/admin/queue' });

		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ loading: false });
		}
	},

	// 叉车司机登录
	bindForkliftLoginTap: async function () {
		if (this.data.loading) return;
		if (!this._guardAgree()) return;

		let name = this.data.name.trim();
		let pwd = this.data.pwd.trim();

		if (!name) return wx.showToast({ title: '请输入用户名', icon: 'none' });
		if (pwd.length < 4) return wx.showToast({ title: '密码至少4位', icon: 'none' });

		this.setData({ loading: true });

		try {
			let res = await cloudHelper.callCloudSumbit('forklift/login', {
				username: name,
				password: pwd,
			}, { title: '登录中' });

			ForkliftBiz.forkliftLogin(res.data);
			// 按账号身份直达对应工作台：叉车→叉车工作台，吊柜→吊柜工作台（两界面不互通）
			let target = res.data.role === 'crane' ? '/pages/storage_forklift/home' : '/pages/forklift/home';
			wx.redirectTo({ url: target });

		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ loading: false });
		}
	},

	// 司机微信登录
	bindWxLoginTap: async function () {
		if (this.data.loading) return;
		if (!this._guardAgree()) return;
		this.setData({ loading: true });

		try {
			let res = await cloudHelper.callCloudSumbit('driver/wxLogin', {}, { title: '登录中' });

			cacheHelper.set(constants.CACHE_TOKEN, res.data, 86400);

			if (res.data.registered) {
				// 登录后第一页为业务选择页（装卸货/存柜/取柜）；进行中任务以角标提示
				wx.redirectTo({ url: '/driver/biz_select' });
			} else {
				wx.redirectTo({ url: '/pages/driver/register/register' });
			}
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ loading: false });
		}
	},

	// 客户登录（月付/月结车牌录入）
	bindCustomerLoginTap: async function () {
		if (this.data.loading) return;
		if (!this._guardAgree()) return;

		let name = this.data.name.trim();
		let pwd = this.data.pwd.trim();

		if (!name) return wx.showToast({ title: '请输入用户名', icon: 'none' });
		if (pwd.length < 4) return wx.showToast({ title: '密码至少4位', icon: 'none' });

		this.setData({ loading: true });

		try {
			let res = await cloudHelper.callCloudSumbit('customer/login', {
				username: name,
				password: pwd,
			}, { title: '登录中' });

			CustomerBiz.customerLogin(res.data);
			wx.redirectTo({ url: '/pages/customer/home' });

		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ loading: false });
		}
	},

});
