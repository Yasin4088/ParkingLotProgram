const AdminBiz = require('../../../../biz/admin_biz.js');
const pageHelper = require('../../../../helper/page_helper.js');
const cloudHelper = require('../../../../helper/cloud_helper.js');

Page({

	/**
	 * 页面的初始数据
	 */
	data: {
		stats: { total: 0, waiting: 0, executing: 0, topay: 0 },
	},

	/**
	 * 生命周期函数--监听页面加载
	 */
	onLoad: async function (options) {
		if (!AdminBiz.isAdmin(this)) return;

		let admin = AdminBiz.getAdminToken();
		this.setData({
			isLoad: true,
			admin
		});
	},

	/**
	 * 生命周期函数--监听页面显示
	 */
	onShow: function () {
		this._loadStats();
	},

	/**
	 * 页面相关事件处理函数--监听用户下拉动作
	 */
	onPullDownRefresh: async function () {
		await this._loadStats();
		wx.stopPullDownRefresh();
	},

	/** 实时队列统计（由看板列表前端计数） */
	_loadStats: async function () {
		try {
			let data = await cloudHelper.callCloudData('admin/queue_list', {}, { title: '' });
			if (!data) return;
			let stats = { total: 0, waiting: 0, executing: 0, topay: 0 };
			(data.list || []).forEach(item => {
				stats.total++;
				if (item.QUEUE_STATUS === 2) stats.waiting++;
				if (item.QUEUE_STATUS === 4) stats.executing++;
				if (item.QUEUE_STATUS === 6) stats.topay++;
			});
			this.setData({ stats });
		} catch (err) {
			console.log(err);
		}
	},

	/** 统计磁贴 → 回到叫号看板 */
	bindStatsTap: function (e) {
		let pages = getCurrentPages();
		if (pages.length > 1) {
			wx.navigateBack();
		} else {
			wx.navigateTo({ url: '/admin/queue' });
		}
	},

	url: function (e) {
		pageHelper.url(e, this);
	},

	bindExitTap: function (e) {

		let callback = function () {
			AdminBiz.clearAdminToken();
			wx.reLaunch({
				url: '/pages/login/login',
			});
		}
		pageHelper.showConfirm('您确认退出?', callback);
	},

	bindSettingTap: function (e) {
		let itemList = ['清除数据缓存'];
		wx.showActionSheet({
			itemList,
			success: async res => {
				switch (res.tapIndex) {
					case 0: { //清除缓存
						await this._clearCache();
						break;
					}
				}
			},
			fail: function (res) {}
		})
	},

	_clearCache: async function () {
		try {
			let opts = {
				title: '数据缓存清除中'
			}
			await cloudHelper.callCloudSumbit('admin/clear_cache', {}, opts).then(res => {
				pageHelper.showSuccToast('清除成功');
			});
		} catch (err) {
			console.error(err);
		}
	}

})
