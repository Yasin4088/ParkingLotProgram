const AdminBiz = require('../../../biz/admin_biz.js');
const pageHelper = require('../../../helper/page_helper.js');
const cloudHelper = require('../../../helper/cloud_helper.js');
const bizHelper = require('../../../biz/biz_helper.js');

Page({

	data: {
		isLoad: false,
		id: null,

		username: '',
		password: '',
		phone: '',

		status: 1,
		statusDesc: '正常',
		addTime: '',
		loginTime: '',
		loginCnt: 0,

		statusIndex: 1,
		statusItems: ['待审核', '正常', '已禁用'],
		statusValues: [0, 1, 9],

		submitting: false,
	},

	onLoad: async function (options) {
		if (!AdminBiz.isAdmin(this)) return;

		pageHelper.getOptions(this, options);

		let id = this.data.id;
		if (id) {
			wx.setNavigationBarTitle({ title: '编辑叉车司机' });
			await this._loadDetail(id);
		}
		this.setData({ isLoad: true });
	},

	_loadDetail: async function (id) {
		try {
			let user = await cloudHelper.callCloudData('admin/user_detail', { id }, { title: 'bar' });
			if (user) {
				let statusIndex = this.data.statusValues.indexOf(user.USER_STATUS);
				if (statusIndex < 0) statusIndex = 1;

				this.setData({
					username: user.USER_NAME || '',
					phone: user.USER_MOBILE || '',
					status: user.USER_STATUS,
					statusDesc: user.USER_STATUS_DESC || this.data.statusItems[statusIndex],
					statusIndex: statusIndex,
					addTime: user.USER_ADD_TIME || '',
					loginTime: user.USER_LOGIN_TIME || '',
					loginCnt: user.USER_LOGIN_CNT || 0,
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

	bindStatusChange: function (e) {
		let index = Number(e.detail.value);
		this.setData({
			statusIndex: index,
			status: this.data.statusValues[index],
			statusDesc: this.data.statusItems[index],
		});
	},

	bindSubmitTap: async function () {
		if (this.data.submitting) return;

		let username = this.data.username.trim();
		let password = this.data.password.trim();
		let phone = this.data.phone.trim();
		let id = this.data.id;
		let status = this.data.status;

		if (!username || username.length < 2) return wx.showToast({ title: '用户名至少2位', icon: 'none' });

		if (!id && (!password || password.length < 4)) {
			return wx.showToast({ title: '密码至少4位', icon: 'none' });
		}

		this.setData({ submitting: true });
		try {
			if (id) {
				await cloudHelper.callCloudSumbit('admin/user_edit', {
					id: id,
					username: username,
					password: password,
					phone: phone,
					status: status,
				}, { title: '保存中' });
				wx.showToast({ title: '修改成功', icon: 'success', duration: 1500 });
			} else {
				await cloudHelper.callCloudSumbit('admin/user_insert', {
					username: username,
					password: password,
					phone: phone,
					role: 'forklift',
				}, { title: '保存中' });
				wx.showToast({ title: '添加成功', icon: 'success', duration: 1500 });
			}

			bizHelper.removeCacheList('admin-forklift');

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
