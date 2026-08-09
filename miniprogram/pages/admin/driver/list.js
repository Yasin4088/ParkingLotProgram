const AdminBiz = require('../../../biz/admin_biz.js');
const cloudHelper = require('../../../helper/cloud_helper.js');
const pageHelper = require('../../../helper/page_helper.js');

Page({

	data: {
		username: '',
		password: '',
		phone: '',
		submitting: false,
	},

	onLoad: function (options) {
		if (!AdminBiz.isAdmin(this)) return;
	},

	onShow: function () {
		// 刷新列表
		let cmpt = this.selectComponent('#driverList');
		if (cmpt) cmpt.reload();
	},

	bindUsernameInput: function (e) {
		this.setData({ username: e.detail.value });
	},

	bindPasswordInput: function (e) {
		this.setData({ password: e.detail.value });
	},

	bindPhoneInput: function (e) {
		this.setData({ phone: e.detail.value });
	},

	bindAddTap: async function () {
		if (this.data.submitting) return;

		let username = this.data.username.trim();
		let password = this.data.password.trim();
		let phone = this.data.phone.trim();

		if (!username || username.length < 2) return wx.showToast({ title: '用户名至少2位', icon: 'none' });
		if (!password || password.length < 4) return wx.showToast({ title: '密码至少4位', icon: 'none' });

		this.setData({ submitting: true });
		try {
			await cloudHelper.callCloudSumbit('admin/user_insert', {
				username: username,
				password: password,
				phone: phone,
			}, { title: '保存中' });

			wx.showToast({ title: '添加成功', icon: 'success' });

			// 清空表单
			this.setData({ username: '', password: '', phone: '' });

			// 刷新列表
			let cmpt = this.selectComponent('#driverList');
			if (cmpt) cmpt.reload();
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ submitting: false });
		}
	},

	bindDelTap: async function (e) {
		if (!AdminBiz.isAdmin(this)) return;

		let id = pageHelper.dataset(e, 'id');
		let callback = async () => {
			try {
				await cloudHelper.callCloudSumbit('admin/user_del', { id }, { title: '删除中' });
				wx.showToast({ title: '删除成功', icon: 'success' });
				let cmpt = this.selectComponent('#driverList');
				if (cmpt) cmpt.reload();
			} catch (err) {
				console.log(err);
			}
		};
		pageHelper.showConfirm('确认删除该司机？', callback);
	},

	bindCommListCmpt: function (e) {
		pageHelper.commListListener(this, e);
	},

	bindBackTap: function () {
		wx.navigateBack();
	},
});
