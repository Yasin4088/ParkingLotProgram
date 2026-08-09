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
	},

	onLoad: function (options) {
		cacheHelper.remove(constants.CACHE_TOKEN);
		cacheHelper.remove(constants.CACHE_ADMIN);
	},

	bindTabTap: function (e) {
		this.setData({
			tab: e.currentTarget.dataset.tab,
			name: '',
			pwd: '',
		});
	},

	bindNameInput: function (e) {
		this.setData({ name: e.detail.value });
	},

	bindPwdInput: function (e) {
		this.setData({ pwd: e.detail.value });
	},

	bindLoginTap: async function () {
		if (this.data.loading) return;

		let name = this.data.name.trim();
		let pwd = this.data.pwd.trim();

		if (!name) return wx.showToast({ title: '请输入用户名', icon: 'none' });
		if (pwd.length < 4) return wx.showToast({ title: '密码至少4位', icon: 'none' });

		this.setData({ loading: true });

		try {
			if (this.data.tab === 'admin') {
				// 管理员登录
				let res = await cloudHelper.callCloudSumbit('admin/login', {
					name: name,
					pwd: pwd,
				}, { title: '登录中' });

				// 缓存管理员信息
				AdminBiz.adminLogin(res.data);
				wx.redirectTo({ url: '/admin/queue' });

			} else {
				// 司机登录
				let res = await cloudHelper.callCloudSumbit('driver/login', {
					username: name,
					password: pwd,
				}, { title: '登录中' });

				// 缓存司机信息
				cacheHelper.set(constants.CACHE_TOKEN, res.data, 86400);
				wx.redirectTo({ url: '/driver/home' });
			}
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ loading: false });
		}
	},

});
