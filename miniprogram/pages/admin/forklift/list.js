const AdminBiz = require('../../../biz/admin_biz.js');
const cloudHelper = require('../../../helper/cloud_helper.js');
const pageHelper = require('../../../helper/page_helper.js');
const bizHelper = require('../../../biz/biz_helper.js');

Page({

	data: {
		forkliftParams: { role: 'forklift' },
	},

	onLoad: function (options) {
		if (!AdminBiz.isAdmin(this)) return;
		wx.setNavigationBarColor({
			backgroundColor: '#009F72',
			frontColor: '#ffffff',
		});
	},

	onShow: function () {
		let cmpt = this.selectComponent('#forkliftList');
		if (cmpt) {
			cmpt.reload();
		} else {
			setTimeout(() => {
				let retryCmpt = this.selectComponent('#forkliftList');
				if (retryCmpt) retryCmpt.reload();
			}, 300);
		}
	},

	bindDelTap: async function (e) {
		if (!AdminBiz.isAdmin(this)) return;

		let id = pageHelper.dataset(e, 'id');
		let callback = async () => {
			try {
				await cloudHelper.callCloudSumbit('admin/user_del', { id }, { title: '删除中' });
				wx.showToast({ title: '删除成功', icon: 'success' });
				bizHelper.removeCacheList('admin-forklift');
				let cmpt = this.selectComponent('#forkliftList');
				if (cmpt) cmpt.reload();
			} catch (err) {
				console.log(err);
			}
		};
		pageHelper.showConfirm('确认删除该叉车司机？', callback);
	},

	bindCommListCmpt: function (e) {
		pageHelper.commListListener(this, e);
	},

	bindEditTap: function (e) {
		let id = pageHelper.dataset(e, 'id');
		wx.navigateTo({ url: '/pages/admin/forklift/edit?id=' + id });
	},

	bindAddTap: function () {
		wx.navigateTo({ url: '/pages/admin/forklift/edit' });
	},

});
