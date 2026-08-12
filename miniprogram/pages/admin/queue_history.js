const AdminBiz = require('../../biz/admin_biz.js');
const cloudHelper = require('../../helper/cloud_helper.js');

Page({
	data: {
		list: [],
		total: 0,
		loading: false,
		showDetail: false,
		selectedItem: null,
	},

	onLoad: function () {
		if (!AdminBiz.isAdmin(this)) return;
		wx.setNavigationBarColor({
			backgroundColor: '#3B82E6',
			frontColor: '#ffffff',
		});
		this.loadList();
	},

	onShow: function () {
		if (AdminBiz.getAdminToken()) this.loadList();
	},

	loadList: async function () {
		this.setData({ loading: true });
		try {
			let data = await cloudHelper.callCloudData('admin/queue_history_list', {}, { title: '加载中' });
			this.setData({
				list: data && data.list ? data.list : [],
				total: data && data.total ? data.total : 0,
			});
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ loading: false });
		}
	},

	bindItemTap: function (e) {
		let id = e.currentTarget.dataset.id;
		let item = this.data.list.find(v => v._id === id);
		if (!item) return;
		this.setData({
			showDetail: true,
			selectedItem: item,
		});
	},

	bindCloseDetailTap: function () {
		this.setData({
			showDetail: false,
			selectedItem: null,
		});
	},

	bindNoop: function () {},

	bindPreviewTap: function (e) {
		let url = e.currentTarget.dataset.url;
		if (!url) return;
		wx.previewImage({
			urls: [url],
			current: url,
		});
	},

	bindClearTap: function (e) {
		let id = e.currentTarget.dataset.id;
		if (!id) return;

		wx.showModal({
			title: '清理历史记录',
			content: '清理后该历史记录将从后台移除，确认继续？',
			success: async res => {
				if (!res.confirm) return;
				try {
					await cloudHelper.callCloudSumbit('admin/queue_history_clear', { id }, { title: '清理中' });
					wx.showToast({ title: '已清理', icon: 'success' });
					this.bindCloseDetailTap();
					this.loadList();
				} catch (e) {
					console.log(e);
				}
			}
		});
	},

	bindClearAllTap: function () {
		if (!this.data.total) return wx.showToast({ title: '暂无历史记录', icon: 'none' });

		wx.showModal({
			title: '清空历史记录',
			content: '将清理全部已完成/已取消历史记录，此操作不可恢复，确认继续？',
			success: async res => {
				if (!res.confirm) return;
				try {
					await cloudHelper.callCloudSumbit('admin/queue_history_clear_all', {}, { title: '清理中' });
					wx.showToast({ title: '已清空', icon: 'success' });
					this.bindCloseDetailTap();
					this.loadList();
				} catch (e) {
					console.log(e);
				}
			}
		});
	},

	bindRefreshTap: function () {
		this.loadList();
	},
});
