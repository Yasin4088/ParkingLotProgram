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
		uploadingField: '',
		execProof: '',
		execProofLocal: '',
		statusBar: 0,
		customBar: 0,
		navBarHeight: 0,
	},

	onLoad: async function () {
		this._initNavMetrics();
		if (!ForkliftBiz.isForklift(this)) return;
		if (ForkliftBiz.getWorkRole() !== 'crane') {
			// 叉车身份进叉车工作台，两界面不互通
			wx.redirectTo({ url: '/pages/forklift/home' });
			return;
		}
		this.setData({ isLoad: true });
		await this._loadTask(true);
		this._loaded = true;
		// 10s 自动刷新（与管理员看板一致）：任务池/我的任务保持最新，避免对已被接走的单误抢
		this._timer = setInterval(() => {
			if (this.data.uploading) return; // 上传照片期间跳过，避免与选图/上传冲突
			this._loadTask(true);
		}, 10000);
	},

	onUnload: function () {
		if (this._timer) {
			clearInterval(this._timer);
			this._timer = null;
		}
	},

	onShow: function () {
		if (!this._loaded) return; // 首次加载由 onLoad 处理，避免重复请求导致闪烁
		if (this.data.uploading) return; // 选图返回会触发 onShow，跳过以免与上传冲突
		if (ForkliftBiz.getForkliftToken()) {
			this._loadTask(true);
		}
	},

	_loadTask: async function (silent) {
		try {
			let options = silent ? { title: '', hint: false } : { title: '加载中' };
			let data = await cloudHelper.callCloudData('storage_forklift/my_task', {}, options);
			data = data || { pool: [], my: null };
			let myTask = (data.my && data.my.length) ? data.my[0] : null;
			let setData = { pool: data.pool || [], myTask };
			if (!myTask && !this.data.uploading) {
				setData.execProof = '';
				setData.execProofLocal = '';
				setData.uploading = false;
				setData.uploadingField = '';
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
					await cloudHelper.callCloudSumbit('storage_forklift/grab', {
						id,
					}, { title: '抢单中' });
					wx.showToast({ title: '抢单成功', icon: 'success' });
					that._loadTask();
				} catch (err) {
					console.log(err);
					wx.showToast({ title: (err && err.msg) || '抢单失败，请重试', icon: 'none' });
					that._loadTask(); // 可能已被其他吊柜司机抢走，刷新任务池
				} finally {
					that.setData({ grabbingId: '' });
				}
			}
		});
	},

	// ========== 执行照片上传 ==========

	bindChooseExecProof: function () {
		this._chooseImage('execProof');
	},

	_chooseImage: function (field) {
		if (!this.data.myTask || this.data.loading || this.data.uploading) return;
		let dir = 'storage/exec/';

		wx.chooseMedia({
			count: 1,
			mediaType: ['image'],
			sourceType: ['camera', 'album'],
			success: async res => {
				let filePath = res.tempFiles && res.tempFiles[0] ? res.tempFiles[0].tempFilePath : '';
				if (!filePath) return;
				this.setData({ uploading: true, uploadingField: field });
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
					this.setData({ uploading: false, uploadingField: '' });
				}
			}
		});
	},

	// ========== 完成作业（存柜 2→3 记计费起点 / 取柜 7→8 终态） ==========

	bindCompleteTap: function () {
		if (!this.data.myTask || this.data.loading) return;
		if (this.data.uploading) return wx.showToast({ title: '图片上传中', icon: 'none' });
		if (!this.data.execProof) return wx.showToast({ title: '请先上传执行照片', icon: 'none' });

		let isStore = this.data.myTask.STORAGE_STATUS === 2;
		let that = this;
		wx.showModal({
			title: '确认完成',
			content: isStore ? '提交照片后该柜标记为已存柜，并开始计费。确定完成？' : '提交照片后该柜标记为已取柜。确定完成？',
			success: async res => {
				if (!res.confirm) return;
				that.setData({ loading: true });
				try {
					await cloudHelper.callCloudSumbit('storage_forklift/complete', {
						id: that.data.myTask._id,
						execProof: that.data.execProof,
					}, { title: '提交中' });
					wx.showToast({ title: '任务已完成', icon: 'success' });
					that._loadTask();
				} catch (e) {
					console.log(e);
					wx.showToast({ title: (e && e.msg) || '提交失败，请重试', icon: 'none' });
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
