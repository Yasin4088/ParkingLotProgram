const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');

Page({
	data: {
		actions: [
			{ id: 'load', name: '装货' },
			{ id: 'unload', name: '卸货' },
		],
		list: [],
		loading: false,
		submitting: false,

		// 详情弹窗
		showDetail: false,
		editMode: false,
		selectedItem: null,
		editForm: {
			plate: '',
			phone: '',
			action: '',
			cargoName: '',
		},
		actionEditIndex: 0,
		cancelReason: '',

		// 叫号弹窗
		showCallModal: false,
		callTarget: null,
		forkliftList: [],
		forkliftIndex: 0,
		callLoading: false,
	},

	onLoad: function () {
		this._checkLogin();
		this.loadList();
	},

	onShow: function () {
		if (wx.hideHomeButton) wx.hideHomeButton();
		this.loadList();
	},

	_checkLogin: function () {
		let admin = cacheHelper.get(constants.CACHE_ADMIN);
		if (!admin || !admin.id) {
			wx.redirectTo({ url: '/pages/login/login' });
		}
	},

	loadList: async function () {
		let data = await cloudHelper.callCloudData('admin/queue_list', {}, { title: '加载中' });
		if (!data) return;
		this.setData({
			list: data.list || [],
		});
	},

	// ========== 叫号 ==========

	bindCallTap: async function (e) {
		let id = e.currentTarget.dataset.id;
		let item = this.data.list.find(v => v._id === id);
		if (!item) return;

		// 加载叉车司机列表
		try {
			let forkliftList = await cloudHelper.callCloudData('admin/forklift_list', {}, { title: '' });
			if (!forkliftList || !forkliftList.length) {
				wx.showToast({ title: '暂无可用叉车司机，请先添加', icon: 'none' });
				return;
			}
			this.setData({
				showCallModal: true,
				callTarget: item,
				forkliftList: forkliftList,
				forkliftIndex: 0,
			});
		} catch (err) {
			console.log(err);
		}
	},

	bindForkliftChange: function (e) {
		this.setData({ forkliftIndex: Number(e.detail.value) });
	},

	bindCloseCallModal: function () {
		this.setData({ showCallModal: false, callTarget: null });
	},

	bindConfirmCall: async function () {
		if (this.data.callLoading) return;
		let target = this.data.callTarget;
		let forklift = this.data.forkliftList[this.data.forkliftIndex];
		if (!target || !forklift) return;

		this.setData({ callLoading: true });
		try {
			let res = await cloudHelper.callCloudSumbit('admin/queue_call_next', {
				id: target._id,
				forkliftId: forklift._id,
			}, { title: '叫号中' });

			let data = res && res.data ? res.data : res;
			wx.showModal({
				title: '叫号成功',
				content: '请 ' + (data.QUEUE_NO || '') + ' 号，车牌 ' + data.QUEUE_PLATE + ' 前往装卸区\n叉车司机：' + forklift.USER_NAME,
				showCancel: false,
			});

			this.setData({ showCallModal: false, callTarget: null });
			this.loadList();
		} catch (err) {
			console.log(err);
		} finally {
			this.setData({ callLoading: false });
		}
	},

	// ========== 完成 ==========

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

	// ========== 详情弹窗 ==========

	bindItemTap: async function (e) {
		let id = e.currentTarget.dataset.id;
		await this._loadDetail(id);
	},

	_loadDetail: async function (id) {
		if (!id) return;
		try {
			let item = await cloudHelper.callCloudData('admin/queue_detail', { id }, { title: '加载中' });
			if (!item) return;
			this._showDetail(item);
		} catch (e) {
			console.log(e);
		}
	},

	_showDetail: function (item) {
		let actionEditIndex = this.data.actions.findIndex(action => action.id === item.QUEUE_ACTION);
		this.setData({
			showDetail: true,
			editMode: false,
			selectedItem: item,
			editForm: {
				plate: item.QUEUE_PLATE || '',
				phone: item.QUEUE_PHONE || '',
				action: item.QUEUE_ACTION || '',
				cargoName: item.QUEUE_CARGO_NAME || '',
			},
			actionEditIndex: actionEditIndex > -1 ? actionEditIndex : 0,
			cancelReason: '',
		});
	},

	bindCloseDetailTap: function () {
		this.setData({
			showDetail: false,
			editMode: false,
			selectedItem: null,
			cancelReason: '',
		});
	},

	bindNoop: function () {},

	bindEditTap: function () {
		this.setData({ editMode: true });
	},

	bindCancelEditTap: function () {
		if (!this.data.selectedItem) return;
		this._showDetail(this.data.selectedItem);
	},

	bindPlateInput: function (e) {
		this.setData({ 'editForm.plate': e.detail.value });
	},

	bindPhoneInput: function (e) {
		this.setData({ 'editForm.phone': e.detail.value });
	},

	bindCargoNameInput: function (e) {
		this.setData({ 'editForm.cargoName': e.detail.value });
	},

	bindCancelReasonInput: function (e) {
		this.setData({ cancelReason: e.detail.value });
	},

	bindEditActionChange: function (e) {
		let index = Number(e.detail.value);
		let action = this.data.actions[index];
		this.setData({
			actionEditIndex: index,
			'editForm.action': action ? action.id : '',
		});
	},

	bindSaveEditTap: async function () {
		if (this.data.submitting || !this.data.selectedItem) return;

		let form = this.data.editForm;
		let plate = form.plate.trim();
		let phone = form.phone.trim();
		if (!plate) return wx.showToast({ title: '请输入车牌号', icon: 'none' });
		if (!phone) return wx.showToast({ title: '请输入手机号', icon: 'none' });

		this.setData({ submitting: true });
		try {
			let res = await cloudHelper.callCloudSumbit('admin/queue_edit', {
				id: this.data.selectedItem._id,
				plate,
				phone,
				action: form.action,
				cargoName: (form.cargoName || '').trim(),
			}, { title: '保存中' });
			wx.showToast({ title: '已保存', icon: 'success' });
			if (res && res.data) this._showDetail(res.data);
			this.loadList();
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ submitting: false });
		}
	},

	bindCancelQueueTap: function () {
		if (this.data.submitting || !this.data.selectedItem) return;

		let reason = this.data.cancelReason.trim();
		if (!reason) return wx.showToast({ title: '请输入取消原因', icon: 'none' });

		wx.showModal({
			title: '确认取消',
			content: '取消后该车辆会从队列移除，司机需要重新预约。确定继续？',
			success: async res => {
				if (!res.confirm) return;
				this.setData({ submitting: true });
				try {
					await cloudHelper.callCloudSumbit('admin/queue_cancel', {
						id: this.data.selectedItem._id,
						reason,
					}, { title: '取消中' });
					wx.showToast({ title: '已取消', icon: 'success' });
					this.bindCloseDetailTap();
					this.loadList();
				} catch (e) {
					console.log(e);
				} finally {
					this.setData({ submitting: false });
				}
			}
		});
	},

	bindPreviewProofTap: function () {
		let proof = this.data.selectedItem && this.data.selectedItem.QUEUE_PROOF;
		if (!proof) return;
		wx.previewImage({
			urls: [proof],
			current: proof,
		});
	},

	// ========== 导航 ==========

	bindRefreshTap: function () {
		this.loadList();
	},

	bindDriverMgrTap: function () {
		wx.navigateTo({ url: '/pages/admin/driver/list' });
	},

	bindForkliftMgrTap: function () {
		wx.navigateTo({ url: '/pages/admin/forklift/list' });
	},

	bindAdminHomeTap: function () {
		wx.navigateTo({ url: '/pages/admin/index/home/admin_home' });
	},

	bindLogoutTap: function () {
		cacheHelper.remove(constants.CACHE_ADMIN);
		wx.redirectTo({ url: '/pages/login/login' });
	},
});
