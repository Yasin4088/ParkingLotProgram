const cloudHelper = require('../../helper/cloud_helper.js');
const cacheHelper = require('../../helper/cache_helper.js');
const constants = require('../../biz/constants.js');
const AdminBiz = require('../../biz/admin_biz.js');
const setting = require('../../setting/setting.js');

Page({

	data: {
		tab: 'driver',
		name: '',
		pwd: '',
		loading: false,
		needSetup: false,   // 系统是否需要初始化
	},

	onLoad: function (options) {
		cacheHelper.remove(constants.CACHE_TOKEN);
		cacheHelper.remove(constants.CACHE_ADMIN);
	},

	onShow: function () {
		// 每次显示时检查管理员tab是否需要初始化
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
		}
	},

	_checkSetup: async function () {
		try {
			let res = await cloudHelper.callCloudData('admin/check_setup', {}, { title: 'bar' });
			this.setData({ needSetup: res && res.needSetup });
		} catch (e) {
			// 检查失败，默认当作已初始化
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

	// 系统初始化（首次部署，创建超级管理员）
	bindSetupTap: async function () {
		if (this.data.loading) return;

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

		let name = this.data.name.trim();
		let pwd = this.data.pwd.trim();

		if (!name) return wx.showToast({ title: '请输入用户名', icon: 'none' });
		if (pwd.length < 4) return wx.showToast({ title: '密码至少4位', icon: 'none' });

		this.setData({ loading: true });

		// 管理员登录
		try {
			let res = await cloudHelper.callCloudSumbit('admin/login', {
				name: name,
				pwd: pwd,
			}, { title: '登录中' });

			// 缓存管理员信息
			AdminBiz.adminLogin(res.data);
			wx.redirectTo({ url: '/admin/queue' });

		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ loading: false });
		}
	},

	bindWxLoginTap: async function () {
		if (this.data.loading) return;
		this.setData({ loading: true });

		try {
			let res = await cloudHelper.callCloudSumbit('driver/wxLogin', {}, { title: '登录中' });

			// 始终缓存 token（新用户也有 token）
			cacheHelper.set(constants.CACHE_TOKEN, res.data, 86400);

			if (res.data.registered) {
				// 已注册 → 跳转首页
				wx.redirectTo({ url: '/driver/home' });
			} else {
				// 未注册 → 跳转注册页
				wx.redirectTo({ url: '/pages/driver/register/register' });
			}
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ loading: false });
		}
	},

});