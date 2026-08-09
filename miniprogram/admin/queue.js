const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');

Page({
	data: {
		lots: [],
		lotIndex: 0,
		list: [],
		loading: false,
	},

	onLoad: function () {
		this._checkLogin();
		this.loadList();
	},

	onShow: function () {
		this.loadList();
	},

	_checkLogin: function () {
		let admin = cacheHelper.get(constants.CACHE_ADMIN);
		if (!admin || !admin.id) {
			wx.redirectTo({ url: '/pages/login/login' });
		}
	},

	loadList: async function () {
		let lot = this.data.lots[this.data.lotIndex];
		let lotId = lot ? lot.id : '';
		let data = await cloudHelper.callCloudData('admin/queue_list', { lotId }, { title: '加载中' });
		if (!data) return;

		let nextLotIndex = this.data.lotIndex;
		if (!this.data.lots.length && data.lots && data.lots.length) nextLotIndex = 0;
		this.setData({
			lots: data.lots || [],
			lotIndex: nextLotIndex,
			list: data.list || [],
		});
	},

	bindLotChange: function (e) {
		this.setData({ lotIndex: Number(e.detail.value) }, () => this.loadList());
	},

	bindCallTap: async function () {
		let lot = this.data.lots[this.data.lotIndex];
		if (!lot) return wx.showToast({ title: '请选择停车场', icon: 'none' });
		if (this.data.loading) return;

		this.setData({ loading: true });
		try {
			let res = await cloudHelper.callCloudSumbit('admin/queue_call_next', { lotId: lot.id }, { title: '叫号中' });
			wx.showModal({
				title: '叫号成功',
				content: '请 ' + (res.data.QUEUE_NO || '') + ' 号，车牌 ' + res.data.QUEUE_PLATE + ' 前往装卸区',
				showCancel: false
			});
			this.loadList();
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ loading: false });
		}
	},

	bindFinishTap: async function (e) {
		let id = e.currentTarget.dataset.id;
		try {
			await cloudHelper.callCloudSumbit('admin/queue_finish', { id }, { title: '处理中' });
			wx.showToast({ title: '已完成', icon: 'success' });
			this.loadList();
		} catch (err) {
			console.log(err);
		}
	},

	bindRefreshTap: function () {
		this.loadList();
	},

	bindDriverMgrTap: function () {
		wx.navigateTo({ url: '/pages/admin/driver/list' });
	},

	bindLogoutTap: function () {
		cacheHelper.remove(constants.CACHE_ADMIN);
		wx.redirectTo({ url: '/pages/login/login' });
	},
});
