const ForkliftBiz = require('../../biz/forklift_biz.js');
const cloudHelper = require('../../helper/cloud_helper.js');
const app = getApp();

Page({
	data: {
		isLoad: false,
		pool: [],
		myTask: null,
		grabbingId: '',
		loading: false,
		uploading: false,
		finishProof: '',
		finishProofLocal: '',
		billProof: '',
		billProofLocal: '',
		statusBar: 0,
		customBar: 0,
		navBarHeight: 0,
	},

	onLoad: function () {
		this._initNavMetrics();
		if (!ForkliftBiz.isForklift(this)) return;
		this.setData({ isLoad: true });
		this._loadTask();
	},

	onShow: function () {
		if (ForkliftBiz.getForkliftToken()) {
			this._loadTask();
		}
	},

	_loadTask: async function () {
		try {
			let data = await cloudHelper.callCloudData('forklift/my_task', {}, { title: '' });
			data = data || { pool: [], my: null };
			let myTask = (data.my && data.my.length) ? data.my[0] : null;
			let setData = { pool: data.pool || [], myTask };
			if (!myTask) {
				setData.finishProof = '';
				setData.finishProofLocal = '';
				setData.billProof = '';
				setData.billProofLocal = '';
				setData.uploading = false;
			}
			this.setData(setData);
		} catch (e) {
			console.log(e);
		}
	},

	_initNavMetrics: function () {
		let statusBar = app.globalData.statusBar || 0;
		let customBar = app.globalData.customBar || 0;

		if (!statusBar || !customBar) {
			let systemInfo = wx.getSystemInfoSync();
			let capsule = wx.getMenuButtonBoundingClientRect();
			statusBar = systemInfo.statusBarHeight || 0;
			customBar = capsule ? capsule.bottom + capsule.top - statusBar : statusBar + 50;
		}

		this.setData({
			statusBar,
			customBar,
			navBarHeight: customBar - statusBar,
		});
	},

	// ========== 抢单 ==========

	bindGrabTap: function (e) {
		if (this.data.grabbingId) return;
		let id = e.currentTarget.dataset.id;
		let that = this;

		wx.showModal({
			title: '确认抢单',
			content: '一单一人，抢单成功后需完成该任务。确定抢单？',
			success: async res => {
				if (!res.confirm) return;
				that.setData({ grabbingId: id });
				try {
					await cloudHelper.callCloudSumbit('forklift/grab', {
						id,
					}, { title: '抢单中' });
					wx.showToast({ title: '抢单成功', icon: 'success' });
					that._loadTask();
				} catch (err) {
					console.log(err);
					that._loadTask(); // 可能已被其他叉车抢走，刷新任务池
				} finally {
					that.setData({ grabbingId: '' });
				}
			}
		});
	},

	// ========== 双凭证上传 ==========

	bindChooseFinishProof: function () {
		this._chooseImage('finishProof');
	},

	bindChooseBillProof: function () {
		this._chooseImage('billProof');
	},

	_chooseImage: function (field) {
		if (!this.data.myTask || this.data.loading || this.data.uploading) return;
		let dir = field === 'finishProof' ? 'queue/finish-proof/' : 'queue/finish-bill/';

		wx.chooseMedia({
			count: 1,
			mediaType: ['image'],
			sourceType: ['camera', 'album'],
			success: async res => {
				let filePath = res.tempFiles && res.tempFiles[0] ? res.tempFiles[0].tempFilePath : '';
				if (!filePath) return;
				this.setData({ uploading: true });
				try {
					let cloudId = await cloudHelper.transTempPicOne(filePath, dir, this.data.myTask._id, false);
					if (!cloudId) return;
					let data = {};
					data[field] = cloudId;
					data[field + 'Local'] = filePath;
					this.setData(data);
					wx.showToast({ title: '图片已上传', icon: 'success' });
				} catch (e) {
					console.log(e);
					wx.showToast({ title: '上传失败，请重试', icon: 'none' });
				} finally {
					this.setData({ uploading: false });
				}
			}
		});
	},

	// ========== 完成作业 ==========

	bindCompleteTap: function () {
		if (!this.data.myTask || this.data.loading) return;
		if (this.data.uploading) return wx.showToast({ title: '图片上传中', icon: 'none' });
		if (!this.data.finishProof) return wx.showToast({ title: '请先上传现场照片', icon: 'none' });
		if (!this.data.billProof) return wx.showToast({ title: '请先上传单据照片', icon: 'none' });

		let that = this;
		wx.showModal({
			title: '确认完成',
			content: '提交现场照片与单据照片后，任务将提交管理员结算。确定完成？',
			success: async res => {
				if (!res.confirm) return;
				that.setData({ loading: true });
				try {
					await cloudHelper.callCloudSumbit('forklift/complete', {
						id: that.data.myTask._id,
						finishProof: that.data.finishProof,
						billProof: that.data.billProof,
					}, { title: '提交中' });
					wx.showToast({ title: '任务已完成', icon: 'success' });
					that._loadTask();
				} catch (e) {
					console.log(e);
				} finally {
					that.setData({ loading: false });
				}
			}
		});
	},

	bindRefreshTap: function () {
		this._loadTask();
	},

	bindLogoutTap: function () {
		ForkliftBiz.clearForkliftToken();
		wx.redirectTo({ url: '/pages/login/login' });
	},
});
