const AdminBiz = require('../../../biz/admin_biz.js');
const cloudHelper = require('../../../helper/cloud_helper.js');
const pageHelper = require('../../../helper/page_helper.js');

Page({

	data: {},

	onLoad: function (options) {
		if (!AdminBiz.isAdmin(this)) return;
		wx.setNavigationBarColor({
			backgroundColor: '#009F72',
			frontColor: '#ffffff',
		});
	},

	onShow: function () {
		// 刷新列表
		let cmpt = this.selectComponent('#driverList');
		if (cmpt) cmpt.reload();
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

	bindEditTap: function (e) {
		let id = pageHelper.dataset(e, 'id');
		wx.navigateTo({ url: '/pages/admin/driver/edit?id=' + id });
	},

	bindAddTap: function () {
		wx.navigateTo({ url: '/pages/admin/driver/edit' });
	},

});
