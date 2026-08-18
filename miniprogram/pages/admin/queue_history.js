const AdminBiz = require('../../biz/admin_biz.js');
const cloudHelper = require('../../helper/cloud_helper.js');
const fileHelper = require('../../helper/file_helper.js');

Page({
	data: {
		tabs: [{ label: '装卸货', value: 0 }, { label: '存取柜', value: 1 }],
		tab: 0,
		months: [],
		monthIndex: 0,
		yearMonth: '',
		list: [],
		total: 0,
		loading: false,
		exporting: false,
		showDetail: false,
		selectedItem: null,
	},

	onLoad: function () {
		if (!AdminBiz.isAdmin(this)) return;
		// 历史/月报仅超级管理员可查看
		if (!AdminBiz.isSuperAdmin()) {
			wx.showToast({ title: '仅超级管理员可查看历史', icon: 'none' });
			setTimeout(() => wx.navigateBack(), 1200);
			return;
		}
		wx.setNavigationBarColor({
			backgroundColor: '#3B82E6',
			frontColor: '#ffffff',
		});

		let months = this._buildMonths();
		this.setData({
			months,
			yearMonth: months[0].value,
		});
		this.loadList();
	},

	onShow: function () {
		if (!AdminBiz.isSuperAdmin()) return;
		if (AdminBiz.getAdminToken()) this.loadList();
	},

	/** 生成最近 12 个月选项（默认当月） */
	_buildMonths: function () {
		let months = [];
		let now = new Date();
		for (let i = 0; i < 12; i++) {
			let d = new Date(now.getFullYear(), now.getMonth() - i, 1);
			let y = d.getFullYear();
			let m = String(d.getMonth() + 1).padStart(2, '0');
			months.push({ label: y + '年' + m + '月', value: y + '-' + m });
		}
		return months;
	},

	/** Tab 切换：0=装卸货历史, 1=存取柜历史（挚力取柜记录） */
	bindTabChange: function (e) {
		let tab = Number(e.currentTarget.dataset.tab);
		if (tab === this.data.tab) return;
		this.setData({
			tab,
			list: [],
			total: 0,
			showDetail: false,
			selectedItem: null,
		});
		this.loadList();
	},

	loadList: async function () {
		if (!this.data.yearMonth) return;
		this.setData({ loading: true });
		try {
			let route = this.data.tab === 1 ? 'admin/storage_history_list' : 'admin/queue_history_list';
			let data = await cloudHelper.callCloudData(route, {
				yearMonth: this.data.yearMonth,
			}, { title: '加载中' });
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

	bindMonthChange: function (e) {
		let index = Number(e.detail.value);
		let month = this.data.months[index];
		if (!month) return;
		this.setData({
			monthIndex: index,
			yearMonth: month.value,
		});
		this.loadList();
	},

	bindExportTap: async function () {
		if (this.data.exporting || !this.data.yearMonth) return;

		this.setData({ exporting: true });
		try {
			let isStorage = this.data.tab === 1;
			await cloudHelper.callCloudSumbit(isStorage ? 'admin/report_storage_month' : 'admin/report_month', {
				yearMonth: this.data.yearMonth,
			}, { title: '生成报表中' });

			let urlData = await cloudHelper.callCloudData(isStorage ? 'admin/report_storage_url' : 'admin/report_url', {
				yearMonth: this.data.yearMonth,
			}, { title: '' });
			if (!urlData || !urlData.url) {
				wx.showToast({ title: '报表生成失败，请重试', icon: 'none' });
				return;
			}
			fileHelper.openDoc(isStorage ? '存取柜月报' : '装卸月报', urlData.url, '.xlsx');
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ exporting: false });
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
		let fileID = e.currentTarget.dataset.url;
		if (!fileID) return;
		cloudHelper.previewCloudImage(fileID);
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
					let route = this.data.tab === 1 ? 'admin/storage_history_clear' : 'admin/queue_history_clear';
					await cloudHelper.callCloudSumbit(route, { id }, { title: '清理中' });
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
			content: '将清理该类别全部历史记录，此操作不可恢复，确认继续？',
			success: async res => {
				if (!res.confirm) return;
				try {
					let route = this.data.tab === 1 ? 'admin/storage_history_clear_all' : 'admin/queue_history_clear_all';
					await cloudHelper.callCloudSumbit(route, {}, { title: '清理中' });
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
