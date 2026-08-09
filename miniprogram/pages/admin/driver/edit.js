const AdminBiz = require('../../../biz/admin_biz.js');
const pageHelper = require('../../../helper/page_helper.js');
const cloudHelper = require('../../../helper/cloud_helper.js');

Page({

	data: {
		isLoad: false,
		id: null,
		username: '',
		password: '',
		phone: '',
		submitting: false,
	},

	onLoad: async function (options) {
		if (!AdminBiz.isAdmin(this)) return;

		pageHelper.getOptions(this, options);

		let id = this.data.id;
		if (id) {
			// 编辑模式
			wx.setNavigationBarTitle({ title: '编辑司机' });
			await this._loadDetail(id);
		}
		this.setData({ isLoad: true });
	},

	_loadDetail: async function (id) {
		try {
			let user = await cloudHelper.callCloudData('admin/user_detail', { id }, { title: 'bar' });
			if (user) {
				this.setData({
					username: user.USER_NAME || '',
					phone: user.USER_MOBILE || '',
				});
			}
		} catch (e) {
			console.log(e);
		}
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

	bindSubmitTap: async function () {
		if (this.data.submitting) return;

		let username = this.data.username.trim();
		let password = this.data.password.trim();
		let phone = this.data.phone.trim();
		let id = this.data.id;

		if (!username || username.length < 2) return wx.showToast({ title: '用户名至少2位', icon: 'none' });

		if (!id && (!password || password.length < 4)) {
			return wx.showToast({ title: '密码至少4位', icon: 'none' });
		}

		this.setData({ submitting: true });
		try {
			if (id) {
				// 编辑模式
				await cloudHelper.callCloudSumbit('admin/user_edit', {
					id: id,
					username: username,
					password: password,
					phone: phone,
				}, { title: '保存中' });
				wx.showToast({ title: '修改成功', icon: 'success', duration: 1500 });
			} else {
				// 添加模式
				await cloudHelper.callCloudSumbit('admin/user_insert', {
					username: username,
					password: password,
					phone: phone,
				}, { title: '保存中' });
				wx.showToast({ title: '添加成功', icon: 'success', duration: 1500 });
			}

			setTimeout(() => {
				wx.navigateBack();
			}, 1500);
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ submitting: false });
		}
	},

});
