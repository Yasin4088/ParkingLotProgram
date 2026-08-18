const AdminBiz = require('../../../biz/admin_biz.js');
const cloudHelper = require('../../../helper/cloud_helper.js');
const pageHelper = require('../../../helper/page_helper.js');
const bizHelper = require('../../../biz/biz_helper.js');

Page({

	data: {
		// 客户账号列表（复用用户列表接口，按角色 customer 过滤）
		customerParams: { role: 'customer' },
	},

	onLoad: function (options) {
		if (!AdminBiz.isAdmin(this)) return;
		if (!AdminBiz.isSuperAdmin()) {
			wx.showToast({ title: '仅超级管理员可管理客户账号', icon: 'none' });
			setTimeout(() => wx.navigateBack(), 1200);
			return;
		}
		wx.setNavigationBarColor({
			backgroundColor: '#3B82E6',
			frontColor: '#ffffff',
		});
	},

	onShow: function () {
		let cmpt = this.selectComponent('#customerList');
		if (cmpt) {
			cmpt.reload();
		} else {
			setTimeout(() => {
				let retryCmpt = this.selectComponent('#customerList');
				if (retryCmpt) retryCmpt.reload();
			}, 300);
		}
	},

	bindDelTap: async function (e) {
		if (!AdminBiz.isAdmin(this) || !AdminBiz.isSuperAdmin()) return;

		let id = pageHelper.dataset(e, 'id');
		let callback = async () => {
			try {
				await cloudHelper.callCloudSumbit('admin/customer_del', { id }, { title: '删除中' });
				wx.showToast({ title: '删除成功', icon: 'success' });
				bizHelper.removeCacheList('admin-customer');
				let cmpt = this.selectComponent('#customerList');
				if (cmpt) cmpt.reload();
			} catch (err) {
				console.log(err);
			}
		};
		pageHelper.showConfirm('确认删除该客户账号？其未使用的月付车牌将一并清理。', callback);
	},

	bindCommListCmpt: function (e) {
		pageHelper.commListListener(this, e);
	},

	bindEditTap: function (e) {
		let id = pageHelper.dataset(e, 'id');
		wx.navigateTo({ url: '/pages/admin/customer/edit?id=' + id });
	},

	bindAddTap: function () {
		wx.navigateTo({ url: '/pages/admin/customer/edit' });
	},

});
