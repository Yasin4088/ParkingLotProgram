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

	async myTask() {
		let service = new ForkliftService();
		return await service.getMyTask(this._token);
	}

	async myTasks() {
		let service = new ForkliftService();
		return await service.getMyTasks(this._token);
	}

	async complete() {
		let rules = {
			id: 'must|string|name=任务记录',
		};
		let input = this.validateData(rules);

		let service = new ForkliftService();
		return await service.completeTask(this._token, input.id);
	}
}

module.exports = ForkliftController;
