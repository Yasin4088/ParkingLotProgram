/**
 * Notes: 停车场装卸排队控制器
 */

const BaseController = require('./base_controller.js');
const QueueService = require('../service/queue_service.js');

class QueueController extends BaseController {

	async options() {
		let service = new QueueService();
		return service.getOptions();
	}

	async create() {
		let rules = {
			action: 'must|string|name=业务类型',
			plate: 'must|string|min:3|max:20|name=车牌号',
			phone: 'must|mobile|name=手机号',
			proof: 'string|name=单证图片',
			cargoName: 'string|max:50|name=货物名称',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.create(this._token, this._userId, input.action, input.plate, input.phone, input.proof, input.cargoName);
	}

	async myCurrent() {
		let service = new QueueService();
		return await service.myCurrent(this._token);
	}

	async checkin() {
		let rules = {
			id: 'must|string|name=预约记录',
			lat: 'must|name=纬度',
			lng: 'must|name=经度',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.checkin(this._token, input.id, input.lat, input.lng);
	}

	async subscribe() {
		let rules = {
			id: 'must|string|name=排队记录',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		await service.subscribe(this._token, input.id);
	}

	/** 司机确认收到叫号 */
	async confirm() {
		let rules = {
			id: 'must|string|name=排队记录',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.driverConfirm(this._token, input.id);
	}

	async driverLogin() {
		let rules = {
			username: 'must|string|min:2|max:30|name=用户名',
			password: 'must|string|min:4|max:30|name=密码',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.driverLogin(input.username, input.password);
	}
}

module.exports = QueueController;
