const ForkliftBiz = require('../../biz/forklift_biz.js');
const cloudHelper = require('../../helper/cloud_helper.js');
const app = getApp();

Page({
	data: {
		isLoad: false,
		task: null,
		loading: false,
		uploadingFinishProof: false,
		finishProof: '',
		finishProofLocal: '',
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
			let task = await cloudHelper.callCloudData('forklift/my_task', {}, { title: '' });
			let data = { task };
			if (!task) {
				data.finishProof = '';
				data.finishProofLocal = '';
				data.uploadingFinishProof = false;
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
