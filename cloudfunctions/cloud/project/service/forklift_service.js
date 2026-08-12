/**
 * Notes: 叉车司机业务
 */

const BaseService = require('./base_service.js');
const UserModel = require('../model/user_model.js');
const QueueModel = require('../model/queue_model.js');
const bcrypt = require('bcryptjs');
const timeUtil = require('../../framework/utils/time_util.js');

class ForkliftService extends BaseService {

	/** 叉车司机登录 */
	async login(username, password) {
		let user = await UserModel.getOne({
			USER_NAME: username,
			USER_ROLE: 'forklift'
		}, '_id,USER_NAME,USER_MOBILE,USER_PASSWORD,USER_STATUS,USER_LOGIN_CNT');

		if (!user) {
			this.AppError('用户名或密码不正确');
		}

		if (user.USER_STATUS === UserModel.STATUS.FORBID) {
			this.AppError('您的账户已被禁用，请联系管理员');
		}

		if (!bcrypt.compareSync(password, user.USER_PASSWORD)) {
			this.AppError('用户名或密码不正确');
		}

		let cnt = (user.USER_LOGIN_CNT || 0) + 1;
		await UserModel.edit(user._id, {
			USER_LOGIN_CNT: cnt,
			USER_LOGIN_TIME: timeUtil.time()
		});

		return {
			id: user._id,
			token: user._id,
			name: user.USER_NAME,
			phone: user.USER_MOBILE || '',
			role: 'forklift'
		};
	}

	/** 获取叉车司机当前任务（CALLED + CONFIRMED，支持多叉车指派） */
	async getMyTask(userId) {
		// 查询 CALLED + CONFIRMED 状态的所有记录
		let list = await QueueModel.getAll({
			QUEUE_STATUS: ['in', [QueueModel.STATUS.CALLED, QueueModel.STATUS.CONFIRMED]]
		}, '*', { QUEUE_CALL_TIME: 'desc' }, 50);

		// 筛选该叉车被分配的任务
		let matched = (list || []).find(item => {
			let assignments = item.QUEUE_FORKLIFT_ASSIGNMENTS || [];
			if (assignments.length > 0) {
				return assignments.some(a => a.id === userId);
			}
			// 向后兼容旧记录
			return item.QUEUE_FORKLIFT_ID === userId;
		});

		if (!matched) return null;
		return this._formatTaskItem(matched, userId);
	}

	/** 获取叉车司机的待处理任务列表（CALLED + CONFIRMED） */
	async getMyTasks(userId) {
		let list = await QueueModel.getAll({
			QUEUE_STATUS: ['in', [QueueModel.STATUS.CALLED, QueueModel.STATUS.CONFIRMED]]
		}, '*', { QUEUE_CALL_TIME: 'desc' }, 50);

		let matched = (list || []).filter(item => {
			let assignments = item.QUEUE_FORKLIFT_ASSIGNMENTS || [];
			if (assignments.length > 0) {
				return assignments.some(a => a.id === userId);
			}
			return item.QUEUE_FORKLIFT_ID === userId;
		});

		return matched.map(item => this._formatTaskItem(item, userId));
	}

	/** 叉车司机接受任务 */
	async acceptTask(userId, queueId) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.CALLED
		});
		if (!item) this.AppError('未找到待确认的任务（任务已过期或状态已变更）');

		let assignments = item.QUEUE_FORKLIFT_ASSIGNMENTS || [];

		if (assignments.length > 0) {
			let idx = assignments.findIndex(a => a.id === userId);
			if (idx < 0) this.AppError('您未被分配到该任务');

			if (assignments[idx].status === QueueModel.FORKLIFT_ASSIGN_STATUS.ACCEPTED) {
				this.AppError('您已接受该任务');
			}

			let now = timeUtil.time();
			assignments[idx].status = QueueModel.FORKLIFT_ASSIGN_STATUS.ACCEPTED;
			assignments[idx].acceptTime = now;

			await QueueModel.edit(item._id, {
				QUEUE_FORKLIFT_ASSIGNMENTS: assignments,
			});
		} else {
			// 向后兼容旧记录：无 assignments 数组时，直接标记旧字段
			if (item.QUEUE_FORKLIFT_ID !== userId) this.AppError('您未被分配到该任务');
		}

		// 尝试流转到 CONFIRMED
		const QueueService = require('./queue_service.js');
		let queueService = new QueueService();
		return await queueService._tryConfirm(queueId);
	}

	/** 叉车司机拒绝任务 */
	async rejectTask(userId, queueId) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.CALLED
		});
		if (!item) this.AppError('未找到待确认的任务');

		let assignments = item.QUEUE_FORKLIFT_ASSIGNMENTS || [];
		if (!assignments.length) {
			this.AppError('该任务无叉车分配信息');
		}

		let idx = assignments.findIndex(a => a.id === userId);
		if (idx < 0) this.AppError('您未被分配到该任务');

		if (assignments[idx].status === QueueModel.FORKLIFT_ASSIGN_STATUS.ACCEPTED) {
			this.AppError('已接受的任务不可拒绝，请联系管理员');
		}

		assignments[idx].status = QueueModel.FORKLIFT_ASSIGN_STATUS.REJECTED;
		assignments[idx].acceptTime = timeUtil.time();

		await QueueModel.edit(item._id, {
			QUEUE_FORKLIFT_ASSIGNMENTS: assignments,
		});

		return { success: true, note: '管理员将收到通知，重新分配叉车司机' };
	}

	/** 叉车司机完成任务 */
	async completeTask(userId, queueId, finishProof) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.CONFIRMED
		});
		if (!item) this.AppError('未找到待完成的任务（仅司机已确认的任务可完成）');

		// 校验该叉车是否被分配到此任务（兼容新旧数据结构）
		let assignments = item.QUEUE_FORKLIFT_ASSIGNMENTS || [];
		let isAssigned = false;
		if (assignments.length > 0) {
			isAssigned = assignments.some(a => a.id === userId && a.status === QueueModel.FORKLIFT_ASSIGN_STATUS.ACCEPTED);
		} else {
			isAssigned = (item.QUEUE_FORKLIFT_ID === userId);
		}
		if (!isAssigned) this.AppError('您未被分配到该任务');

		finishProof = (finishProof || '').trim();
		if (!finishProof) this.AppError('请先上传完成作业凭证');

		let now = timeUtil.time();
		await QueueModel.edit(item._id, {
			QUEUE_STATUS: QueueModel.STATUS.DONE,
			QUEUE_FINISH_PROOF: finishProof,
			QUEUE_FINISH_TIME: now,
		});

		return { success: true };
	}

	_formatTaskItem(item, userId) {
		if (!item) return null;

		let assignments = item.QUEUE_FORKLIFT_ASSIGNMENTS || [];
		let myAssignment = null;

		if (userId && assignments.length > 0) {
			myAssignment = assignments.find(a => a.id === userId) || null;
		}

		// 向后兼容：无 assignments 但有 QUEUE_FORKLIFT_ID
		if (!myAssignment && userId && item.QUEUE_FORKLIFT_ID === userId) {
			myAssignment = {
				id: item.QUEUE_FORKLIFT_ID,
				name: item.QUEUE_FORKLIFT_NAME || '',
				status: QueueModel.FORKLIFT_ASSIGN_STATUS.ACCEPTED,
				assignTime: item.QUEUE_FORKLIFT_TIME || 0,
				acceptTime: item.QUEUE_FORKLIFT_TIME || 0,
			};
		}

		return {
			_id: item._id,
			plate: item.QUEUE_PLATE || '',
			phone: item.QUEUE_PHONE || '',
			cargoName: item.QUEUE_CARGO_NAME || '',
			actionName: item.QUEUE_ACTION_NAME || '',
			status: item.QUEUE_STATUS,
			statusDesc: QueueModel.STATUS_DESC[Object.keys(QueueModel.STATUS).find(k => QueueModel.STATUS[k] === item.QUEUE_STATUS)] || '',
			callTimeText: item.QUEUE_CALL_TIME ? timeUtil.timestamp2Time(item.QUEUE_CALL_TIME) : '',
			confirmTimeText: item.QUEUE_CONFIRM_TIME ? timeUtil.timestamp2Time(item.QUEUE_CONFIRM_TIME) : '',
			driverConfirmed: item.QUEUE_DRIVER_CONFIRMED === 1,
			assignments: assignments,
			myAssignment: myAssignment,
		};
	}
}

module.exports = ForkliftService;
