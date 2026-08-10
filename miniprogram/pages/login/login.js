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
