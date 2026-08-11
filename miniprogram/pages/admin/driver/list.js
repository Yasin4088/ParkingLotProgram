const AdminBiz = require('../../../biz/admin_biz.js');
const cloudHelper = require('../../../helper/cloud_helper.js');
const pageHelper = require('../../../helper/page_helper.js');
const bizHelper = require('../../../biz/biz_helper.js');

Page({

	data: {
		search: '',
	},

	onLoad: function (options) {
		if (!AdminBiz.isAdmin(this)) return;
		wx.setNavigationBarColor({
			backgroundColor: '#3B82E6',
			frontColor: '#ffffff',
		});
	},

	onShow: function () {
		// 刷新列表 - 先尝试组件 reload，若组件未就绪则延迟重试
		let cmpt = this.selectComponent('#driverList');
		if (cmpt) {
			cmpt.reload();
		} else {
			// 组件尚未挂载，稍后重试
			setTimeout(() => {
				let retryCmpt = this.selectComponent('#driverList');
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
				// 清除缓存后刷新
				bizHelper.removeCacheList('admin-driver');
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
