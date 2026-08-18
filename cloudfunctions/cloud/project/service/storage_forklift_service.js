/**
 * Notes: 吊柜司机业务（存取柜抢单/执行，账号角色 USER_ROLE=crane）
 */

const BaseService = require('./base_service.js');
const UserModel = require('../model/user_model.js');
const StorageModel = require('../model/storage_model.js');
const StorageService = require('./storage_service.js');
const timeUtil = require('../../framework/utils/time_util.js');

class StorageForkliftService extends BaseService {

	/** 获取吊柜司机任务（抢单池 + 我的任务） */
	async getMyTask(userId) {
		let service = new StorageService();
		// 自动叫号兜底：吊柜工作台轮询时顺带执行一次（管理员看板未打开时也能自动叫号）
		await service.autoCallCheck();

		let pool = await StorageModel.getAll({
			STORAGE_STATUS: ['in', [StorageModel.STATUS.STORE_CALLED, StorageModel.STATUS.FETCH_CALLED]],
			STORAGE_FORKLIFT_ID: ''
		}, '*', { STORAGE_CALL_TIME: 'asc' }, 50);

		let mine = await StorageModel.getAll({
			STORAGE_FORKLIFT_ID: userId,
			STORAGE_STATUS: ['in', [StorageModel.STATUS.STORE_CALLED, StorageModel.STATUS.STORE_EXECUTING, StorageModel.STATUS.FETCH_CALLED, StorageModel.STATUS.FETCH_EXECUTING]]
		}, '*', { STORAGE_CALL_TIME: 'asc' }, 50);

		return {
			pool: (pool || []).map(item => service._formatStorageItem(item)),
			my: (mine || []).map(item => service._formatStorageItem(item))
		};
	}

	/** 吊柜司机抢单（已叫号 → 执行中，先接先得） */
	async grabTask(userId, queueId) {
		let forklift = await UserModel.getOne({
			_id: userId
		}, 'USER_NAME');
		if (!forklift) this.AppError('吊柜司机信息不存在');

		let item = await StorageModel.getOne({
			_id: queueId,
			STORAGE_STATUS: ['in', [StorageModel.STATUS.STORE_CALLED, StorageModel.STATUS.FETCH_CALLED]],
			STORAGE_FORKLIFT_ID: ''
		}, 'STORAGE_STATUS');
		if (!item) this.AppError('手慢了，任务已被其他吊柜司机接单');

		let newStatus = item.STORAGE_STATUS === StorageModel.STATUS.STORE_CALLED
			? StorageModel.STATUS.STORE_EXECUTING
			: StorageModel.STATUS.FETCH_EXECUTING;

		let updated = await StorageModel.edit({
			_id: queueId,
			STORAGE_STATUS: item.STORAGE_STATUS,
			STORAGE_FORKLIFT_ID: ''
		}, {
			STORAGE_STATUS: newStatus,
			STORAGE_FORKLIFT_ID: userId,
			STORAGE_FORKLIFT_NAME: forklift.USER_NAME,
			STORAGE_FORKLIFT_GRAB_TIME: timeUtil.time(),
			STORAGE_FORKLIFT_GRAB_TYPE: StorageModel.GRAB_TYPE.GRAB,
		});
		if (!updated) this.AppError('手慢了，任务已被其他吊柜司机抢走');

		let service = new StorageService();
		// 抢单后抢单池释放，立即尝试自动叫下一位
		await service.autoCallCheck();
		return await service.detail(queueId);
	}

	/** 吊柜司机完成作业（必传执行照片；存柜 2→3 记计费起点，取柜 7→8） */
	async completeTask(userId, queueId, execProof) {
		execProof = (execProof || '').trim();
		if (!execProof) this.AppError('请先上传执行照片');

		let item = await StorageModel.getOne({
			_id: queueId,
			STORAGE_STATUS: ['in', [StorageModel.STATUS.STORE_EXECUTING, StorageModel.STATUS.FETCH_EXECUTING]],
			STORAGE_FORKLIFT_ID: userId
		}, 'STORAGE_STATUS,STORAGE_MONTHLY,STORAGE_MONTHLY_PLATE_ID');
		if (!item) this.AppError('任务状态已变更，无法完成');

		let now = timeUtil.time();
		let editData = {};
		if (item.STORAGE_STATUS === StorageModel.STATUS.STORE_EXECUTING) {
			editData = {
				STORAGE_STATUS: StorageModel.STATUS.STORED,
				STORAGE_EXEC_PROOF: execProof,
				STORAGE_FINISH_TIME: now, // 计费起点
			};
		} else {
			editData = {
				STORAGE_STATUS: StorageModel.STATUS.FETCHED,
				STORAGE_FETCH_PROOF: execProof,
				STORAGE_FETCH_DONE_TIME: now,
			};
		}

		let updated = await StorageModel.edit({
			_id: queueId,
			STORAGE_STATUS: item.STORAGE_STATUS,
			STORAGE_FORKLIFT_ID: userId
		}, editData);
		if (!updated) this.AppError('任务状态已变更，无法完成');

		let service = new StorageService();
		// 月付柜被司机提走（取柜完成）后，对应的月付车牌从月付池中消去
		if (item.STORAGE_STATUS === StorageModel.STATUS.FETCH_EXECUTING
			&& Number(item.STORAGE_MONTHLY) === 1 && item.STORAGE_MONTHLY_PLATE_ID) {
			try {
				await service.consumeMplate(item.STORAGE_MONTHLY_PLATE_ID);
			} catch (e) {
				// 消去失败不影响取柜完成主流程，仅记录（客户侧该车牌仍显示占用，可联系管理员处理）
				console.error('月付车牌消去失败', item.STORAGE_MONTHLY_PLATE_ID, e);
			}
		}
		return await service.detail(queueId);
	}
}

module.exports = StorageForkliftService;
