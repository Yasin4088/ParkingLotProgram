/**
 * Notes: 叉车司机控制器
 */

const BaseController = require('./base_controller.js');
const ForkliftService = require('../service/forklift_service.js');

class ForkliftController extends BaseController {

	async login() {
		let rules = {
			username: 'must|string|min:2|max:30|name=用户名',
			password: 'must|string|min:4|max:30|name=密码',
		};
		let input = this.validateData(rules);

		let service = new ForkliftService();
		return await service.login(input.username, input.password);
	}

	/** 抢单池 + 我的任务 */
	async myTask() {
		await this.checkWorkRole('forklift');
		let service = new ForkliftService();
		return await service.getMyTask(this._token);
	}

	/** 叉车司机完成作业（单据照片） */
	async complete() {
		await this.checkWorkRole('forklift');
		let rules = {
			id: 'must|string|name=任务记录',
			billProof: 'must|string|name=单据照片',
		};
		let input = this.validateData(rules);

		let service = new ForkliftService();
		return await service.completeTask(this._token, input.id, input.billProof);
	}

	/** 叉车司机抢单 */
	async grab() {
		await this.checkWorkRole('forklift');
		let rules = {
			id: 'must|string|name=任务记录',
		};
		let input = this.validateData(rules);

		let service = new ForkliftService();
		return await service.grabTask(this._token, input.id);
	}
}

module.exports = ForkliftController;
