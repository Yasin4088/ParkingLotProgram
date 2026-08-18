const cloudHelper = require('../../helper/cloud_helper.js');
const CustomerBiz = require('../../biz/customer_biz.js');

Page({

	data: {
		name: '',
		stats: { active: 0, claimed: 0, consumed: 0 },
		active: [],     // 月付车牌池（有效 + 使用中）
		consumed: [],   // 已使用记录（消去的车牌）
		platesText: '',
		loading: false,
		submitting: false,
	},

	onLoad: function () {
		if (!CustomerBiz.isCustomer(this)) return;
		wx.setNavigationBarTitle({ title: '月付车牌管理' });
		this.setData({ name: (CustomerBiz.getCustomerToken() || {}).name || '' });
		this._loadHome();
	},

	onShow: function () {
		if (this._loaded) this._loadHome(true);
	},

	_loadHome: async function (silent) {
		if (this.data.loading) return;
		this.setData({ loading: true });
		try {
			let data = await cloudHelper.callCloudData('customer/home', {}, silent ? { title: '', hint: false } : { title: '加载中' });
			if (!data) return;
			this.setData({
				stats: data.stats || { active: 0, claimed: 0, consumed: 0 },
				active: data.active || [],
				consumed: data.consumed || [],
			});
			this._loaded = true;
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ loading: false });
		}
	},

	bindPlatesInput: function (e) {
		this.setData({ platesText: e.detail.value });
	},

	/** 录入月付车牌（多车牌：换行/逗号/分号分隔） */
	bindAddTap: async function () {
		if (this.data.submitting) return;

		let plates = (this.data.platesText || '').trim();
		if (!plates) return wx.showToast({ title: '请输入车牌号', icon: 'none' });

		this.setData({ submitting: true });
		try {
			let res = await cloudHelper.callCloudSumbit('customer/plate_add', { plates }, { title: '录入中' });
			let data = res && res.data ? res.data : res;
			let msg = '成功录入 ' + (data.added || 0) + ' 个车牌';
			if (data.skipped > 0) msg += '，' + data.skipped + ' 个已存在被跳过';
			wx.showToast({ title: msg, icon: 'none', duration: 2500 });
			this.setData({ platesText: '' });
			this._loadHome(true);
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ submitting: false });
		}
	},

	/** 删除未使用的月付车牌 */
	bindDelTap: function (e) {
		if (this.data.submitting) return;

		let id = e.currentTarget.dataset.id;
		let plate = e.currentTarget.dataset.plate;
		let that = this;

		wx.showModal({
			title: '删除车牌',
			content: '确认删除 ' + plate + '？删除后该车牌不再享受月付免现场缴费。',
			confirmColor: '#E64340',
			success: async res => {
				if (!res.confirm) return;
				that.setData({ submitting: true });
				try {
					await cloudHelper.callCloudSumbit('customer/plate_del', { id }, { title: '删除中' });
					wx.showToast({ title: '已删除', icon: 'success' });
					that._loadHome(true);
				} catch (e) {
					console.log(e);
				} finally {
					that.setData({ submitting: false });
				}
			}
		});
	},

	/** 退出登录 */
	bindExitTap: function () {
		let that = this;
		wx.showModal({
			title: '退出登录',
			content: '确认退出当前客户账号？',
			success: res => {
				if (!res.confirm) return;
				CustomerBiz.clearCustomerToken();
				wx.reLaunch({ url: '/pages/login/login' });
			}
		});
	},

});
