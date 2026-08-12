const ForkliftBiz = require('../../biz/forklift_biz.js');
const cloudHelper = require('../../helper/cloud_helper.js');
const app = getApp();

Page({
	data: {
		isLoad: false,
		task: null,
		loading: false,
		accepting: false,
		rejecting: false,
		uploadingFinishProof: false,
		finishProof: '',
		finishProofLocal: '',
		statusBar: 0,
		customBar: 0,
		navBarHeight: 0,
		countdownText: '',
	},

	_countdownTimer: null,

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

	onUnload: function () {
		this._stopCountdown();
	},

	onHide: function () {
		this._stopCountdown();
	},

	_loadTask: async function () {
		try {
			let task = await cloudHelper.callCloudData('forklift/my_task', {}, { title: '' });
			let data = { task };
			if (!task) {
				data.finishProof = '';
				data.finishProofLocal = '';
				data.uploadingFinishProof = false;
				this._stopCountdown();
			} else {
				this._startCountdown(task);
			}
			this.setData(data);
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

	// ========== 接单 / 拒单 ==========

	bindAcceptTap: async function () {
		if (!this.data.task || this.data.accepting) return;
		this.setData({ accepting: true });
		try {
			await cloudHelper.callCloudSumbit('forklift/accept', {
				id: this.data.task._id,
			}, { title: '接受中' });
			wx.showToast({ title: '已接受任务', icon: 'success' });
			this._loadTask();
		} catch (e) {
			console.log(e);
		} finally {
			this.setData({ accepting: false });
		}
	},

	bindRejectTap: function () {
		if (!this.data.task || this.data.rejecting) return;
		wx.showModal({
			title: '确认拒绝',
			content: '拒绝后需管理员重新指派叉车司机，确定拒绝？',
			confirmColor: '#e53e3e',
			success: async res => {
				if (!res.confirm) return;
				this.setData({ rejecting: true });
				try {
					await cloudHelper.callCloudSumbit('forklift/reject', {
						id: this.data.task._id,
					}, { title: '' });
					wx.showToast({ title: '已拒绝任务', icon: 'none' });
					this._loadTask();
				} catch (e) {
					console.log(e);
				} finally {
					this.setData({ rejecting: false });
				}
			}
		});
	},

	// ========== 倒计时（PENDING 状态 5 分钟） ==========

	_startCountdown: function (task) {
		this._stopCountdown();
		if (!task || task.status !== 2) return; // 非 CALLED
		if (!task.myAssignment || task.myAssignment.status !== 0) return; // 非 PENDING

		let assignTime = task.myAssignment.assignTime || 0;
		if (!assignTime) {
			this.setData({ countdownText: '等待响应' });
			return;
		}

		let deadline = assignTime + 5 * 60; // 5 分钟

		let tick = () => {
			let now = Math.floor(Date.now() / 1000);
			let remain = deadline - now;
			if (remain <= 0) {
				this.setData({ countdownText: '已超时，请联系管理员' });
				this._stopCountdown();
				this._loadTask();
				return;
			}
			let m = Math.floor(remain / 60);
			let s = remain % 60;
			this.setData({ countdownText: '剩余 ' + m + ' 分 ' + s + ' 秒' });
		};

		tick();
		this._countdownTimer = setInterval(tick, 1000);
	},

	_stopCountdown: function () {
		if (this._countdownTimer) {
			clearInterval(this._countdownTimer);
			this._countdownTimer = null;
		}
		this.setData({ countdownText: '' });
	},

	// ========== 完成 ==========

	bindChooseFinishProof: function () {
		if (!this.data.task || this.data.loading || this.data.uploadingFinishProof) return;

		wx.chooseMedia({
			count: 1,
			mediaType: ['image'],
			sourceType: ['camera', 'album'],
			success: async res => {
				let filePath = res.tempFiles && res.tempFiles[0] ? res.tempFiles[0].tempFilePath : '';
				if (!filePath) return;
				this.setData({ uploadingFinishProof: true });
				try {
					let cloudId = await cloudHelper.transTempPicOne(filePath, 'queue/finish-proof/', this.data.task._id, false);
					if (!cloudId) return;
					this.setData({
						finishProof: cloudId,
						finishProofLocal: filePath,
					});
					wx.showToast({ title: '凭证已上传', icon: 'success' });
				} catch (e) {
					console.log(e);
					wx.showToast({ title: '上传失败，请重试', icon: 'none' });
				} finally {
					this.setData({ uploadingFinishProof: false });
				}
			}
		});
	},

	bindCompleteTap: async function () {
		if (!this.data.task || this.data.loading) return;
		if (this.data.uploadingFinishProof) return wx.showToast({ title: '凭证上传中', icon: 'none' });
		if (!this.data.finishProof) return wx.showToast({ title: '请先上传完成凭证', icon: 'none' });

		wx.showModal({
			title: '确认完成',
			content: '确定已完成装卸任务，并提交完成作业凭证？',
			success: async res => {
				if (!res.confirm) return;
				this.setData({ loading: true });
				try {
					await cloudHelper.callCloudSumbit('forklift/complete', {
						id: this.data.task._id,
						finishProof: this.data.finishProof,
					}, { title: '提交中' });
					wx.showToast({ title: '任务已完成', icon: 'success' });
					this.setData({
						task: null,
						finishProof: '',
						finishProofLocal: '',
					});
				} catch (e) {
					console.log(e);
				} finally {
					this.setData({ loading: false });
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
