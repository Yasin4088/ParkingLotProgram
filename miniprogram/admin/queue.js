const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');

Page({
	data: {
		lots: [],
		lotIndex: 0,
		actions: [
			{ id: 'load', name: '装货' },
			{ id: 'unload', name: '卸货' },
		],
		list: [],
		loading: false,
		submitting: false,
		showDetail: false,
		editMode: false,
		selectedItem: null,
		editForm: {
			plate: '',
			phone: '',
			lotId: '',
			action: '',
		},
		lotEditIndex: 0,
		actionEditIndex: 0,
		cancelReason: '',
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
		let lotEditIndex = this.data.lots.findIndex(lot => lot.id === item.QUEUE_LOT_ID);
		let actionEditIndex = this.data.actions.findIndex(action => action.id === item.QUEUE_ACTION);
		this.setData({
			showDetail: true,
			editMode: false,
			selectedItem: item,
			editForm: {
				plate: item.QUEUE_PLATE || '',
				phone: item.QUEUE_PHONE || '',
				lotId: item.QUEUE_LOT_ID || '',
				action: item.QUEUE_ACTION || '',
			},
			lotEditIndex: lotEditIndex > -1 ? lotEditIndex : 0,
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

	bindCancelReasonInput: function (e) {
		this.setData({ cancelReason: e.detail.value });
	},

	bindEditLotChange: function (e) {
		let index = Number(e.detail.value);
		let lot = this.data.lots[index];
		this.setData({
			lotEditIndex: index,
			'editForm.lotId': lot ? lot.id : '',
		});
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
				lotId: form.lotId,
				action: form.action,
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
