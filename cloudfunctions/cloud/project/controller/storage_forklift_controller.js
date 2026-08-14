/**
 * Notes: 吊柜司机控制器（存取柜执行，账号角色 USER_ROLE=crane）
 */

const BaseController = require('./base_controller.js');
const StorageForkliftService = require('../service/storage_forklift_service.js');

class StorageForkliftController extends BaseController {

	/** 抢单池 + 我的任务 */
	async myTask() {
		await this.checkWorkRole('crane');
		let service = new StorageForkliftService();
		return await service.getMyTask(this._token);
	}

	/** 吊柜司机完成作业（执行照片） */
	async complete() {
		await this.checkWorkRole('crane');
		let rules = {
			id: 'must|string|name=存取柜记录',
			execProof: 'must|string|name=执行照片',
		};
		let input = this.validateData(rules);

		let service = new StorageForkliftService();
		return await service.completeTask(this._token, input.id, input.execProof);
	}

	/** 吊柜司机抢单 */
	async grab() {
		await this.checkWorkRole('crane');
		let rules = {
			id: 'must|string|name=存取柜记录',
		};
		let input = this.validateData(rules);

		let service = new StorageForkliftService();
		return await service.grabTask(this._token, input.id);
	}
}

module.exports = StorageForkliftController;
