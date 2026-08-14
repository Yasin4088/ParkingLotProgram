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

		// 工作身份：叉车→叉车工作台，吊柜→吊柜工作台（两界面不互通）
		role: 'forklift',
		roleDesc: '叉车司机',
		roleIndex: 0,
		roleItems: ['叉车司机', '吊柜司机'],
		roleValues: ['forklift', 'crane'],

		status: 1,
		statusDesc: '正常',
		addTime: '',
		loginTime: '',
		loginCnt: 0,
		wxBound: false,

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
			wx.setNavigationBarTitle({ title: '编辑叉车/吊柜司机' });
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

				let roleIndex = this.data.roleValues.indexOf(user.USER_ROLE);
				if (roleIndex < 0) roleIndex = 0;

				this.setData({
					username: user.USER_NAME || '',
					phone: user.USER_MOBILE || '',
					role: this.data.roleValues[roleIndex],
					roleDesc: this.data.roleItems[roleIndex],
					roleIndex: roleIndex,
					status: user.USER_STATUS,
					statusDesc: user.USER_STATUS_DESC || this.data.statusItems[statusIndex],
					statusIndex: statusIndex,
					addTime: user.USER_ADD_TIME || '',
					loginTime: user.USER_LOGIN_TIME || '',
					loginCnt: user.USER_LOGIN_CNT || 0,
					wxBound: !!user.USER_WX_OPENID,
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

	bindRoleChange: function (e) {
		let index = Number(e.detail.value);
		this.setData({
			roleIndex: index,
			role: this.data.roleValues[index],
			roleDesc: this.data.roleItems[index],
		});
	},

	/** 清除微信绑定：换设备登录用（先登先绑，清空后该账号可在新设备重新登录绑定） */
	bindClearWxTap: function () {
		if (this.data.submitting || !this.data.wxBound) return;

		wx.showModal({
			title: '清除微信绑定',
			content: '清除后该账号可在任意微信重新登录并绑定新设备，原设备将无法继续操作。确定清除吗？',
			confirmText: '清除',
			confirmColor: '#E64340',
			success: async r => {
				if (!r.confirm) return;
				this.setData({ submitting: true });
				try {
					await cloudHelper.callCloudSumbit('admin/user_edit', {
						id: this.data.id,
						username: this.data.username.trim(),
						password: '',
						phone: this.data.phone.trim(),
						status: this.data.status,
						role: this.data.role,
						wxClear: 1,
					}, { title: '处理中' });
					this.setData({ wxBound: false });
					wx.showToast({ title: '已清除绑定', icon: 'success', duration: 1500 });
				} catch (e) {
					console.log(e);
				} finally {
					this.setData({ submitting: false });
				}
			}
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
					role: this.data.role,
				}, { title: '保存中' });
				wx.showToast({ title: '修改成功', icon: 'success', duration: 1500 });
			} else {
				await cloudHelper.callCloudSumbit('admin/user_insert', {
					username: username,
					password: password,
					phone: phone,
					role: this.data.role,
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
