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

		// 叫号弹窗（多选叉车）
		showCallModal: false,
		callTarget: null,
		forkliftList: [],
		selectedForkliftIds: [],
		callLoading: false,

		// 接单状态弹窗
		showAssignModal: false,
		assignmentTarget: null,

		// 重新分派弹窗
		showReassignModal: false,
		reassignOldForkliftId: '',
		reassignForkliftList: [],
		reassignIndex: 0,
		reassignLoading: false,
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

	// ========== 叫号（多选叉车） ==========

	bindCallTap: async function (e) {
		let id = e.currentTarget.dataset.id;
		let item = this.data.list.find(v => v._id === id);
		if (!item) return;

		try {
			let rawList = await cloudHelper.callCloudData('admin/forklift_list', {}, { title: '' });
			if (!rawList || !rawList.length) {
				wx.showToast({ title: '暂无可用叉车司机，请先添加', icon: 'none' });
				return;
			}
			let forkliftList = rawList.map(f => ({ ...f, checked: false }));
			this.setData({
				showCallModal: true,
				callTarget: item,
				forkliftList: forkliftList,
				selectedForkliftIds: [],
			});
		} catch (err) {
			console.log(err);
		}
	},

	bindToggleForklift: function (e) {
		let index = e.currentTarget.dataset.index;
		let forkliftList = this.data.forkliftList;
		forkliftList[index].checked = !forkliftList[index].checked;
		let selectedForkliftIds = forkliftList.filter(f => f.checked).map(f => f._id);
		this.setData({ forkliftList, selectedForkliftIds });
	},

	bindCloseCallModal: function () {
		this.setData({ showCallModal: false, callTarget: null, selectedForkliftIds: [] });
	},

	bindConfirmCall: async function () {
		if (this.data.callLoading) return;
		let target = this.data.callTarget;
		let ids = this.data.selectedForkliftIds;
		if (!target || !ids.length) {
			wx.showToast({ title: '请至少选择一名叉车司机', icon: 'none' });
			return;
		}

		this.setData({ callLoading: true });
		try {
			let res = await cloudHelper.callCloudSumbit('admin/queue_call', {
				id: target._id,
				forkliftIds: ids,
			}, { title: '叫号中' });

			let data = res && res.data ? res.data : res;
			let names = (data.QUEUE_FORKLIFT_ASSIGNMENTS || []).map(a => a.name).join('、');
			if (!names && data.QUEUE_FORKLIFT_NAME) names = data.QUEUE_FORKLIFT_NAME;
			wx.showModal({
				title: '叫号成功',
				content: '请 ' + (data.QUEUE_NO || '') + ' 号，车牌 ' + data.QUEUE_PLATE + ' 前往装卸区\n叉车司机：' + names,
				showCancel: false,
			});

			this.setData({ showCallModal: false, callTarget: null, selectedForkliftIds: [] });
			this.loadList();
		} catch (err) {
			console.log(err);
		} finally {
			this.setData({ callLoading: false });
		}
	},

	// ========== 接单状态弹窗 ==========

	bindViewAssignments: function (e) {
		let id = e.currentTarget.dataset.id;
		let item = this.data.list.find(v => v._id === id);
		if (!item) return;
		this.setData({ showAssignModal: true, assignmentTarget: item });
	},

	bindCloseAssignModal: function () {
		this.setData({ showAssignModal: false, assignmentTarget: null });
	},

	// ========== 重新分派 ==========

	bindReassignTap: function (e) {
		let oldId = e.currentTarget.dataset.forkliftid;
		// 使用完整的叉车列表（不含 checked 状态）作为重新分派的候选
		let list = (this.data.forkliftList || []).map(f => ({ _id: f._id, USER_NAME: f.USER_NAME }));
		if (!list.length) {
			// 如果当前没有缓存的 forkliftList，异步加载
			cloudHelper.callCloudData('admin/forklift_list', {}, { title: '' }).then(rawList => {
				this.setData({
					showReassignModal: true,
					reassignOldForkliftId: oldId,
					reassignForkliftList: (rawList || []).map(f => ({ _id: f._id, USER_NAME: f.USER_NAME })),
					reassignIndex: 0,
				});
			});
			return;
		}
		this.setData({
			showReassignModal: true,
			reassignOldForkliftId: oldId,
			reassignForkliftList: list,
			reassignIndex: 0,
		});
	},

	bindCloseReassignModal: function () {
		this.setData({ showReassignModal: false, reassignOldForkliftId: '' });
	},

	bindReassignChange: function (e) {
		this.setData({ reassignIndex: Number(e.detail.value) });
	},

	bindConfirmReassign: async function () {
		if (this.data.reassignLoading) return;
		let target = this.data.assignmentTarget;
		let newForklift = this.data.reassignForkliftList[this.data.reassignIndex];
		if (!target || !newForklift || !this.data.reassignOldForkliftId) return;

		this.setData({ reassignLoading: true });
		try {
			await cloudHelper.callCloudSumbit('admin/queue_reassign', {
				id: target._id,
				oldForkliftId: this.data.reassignOldForkliftId,
				newForkliftId: newForklift._id,
			}, { title: '调整中' });
			wx.showToast({ title: '已调整', icon: 'success' });
			this.setData({ showReassignModal: false, reassignOldForkliftId: '' });
			this.loadList();
		} catch (err) {
			console.log(err);
		} finally {
			this.setData({ reassignLoading: false });
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

	bindPreviewFinishProofTap: function () {
		let proof = this.data.selectedItem && this.data.selectedItem.QUEUE_FINISH_PROOF;
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

	bindAdminHomeTap: function () {
		wx.navigateTo({ url: '/pages/admin/index/home/admin_home' });
	},
});
