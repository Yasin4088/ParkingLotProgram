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

	/** 司机认领任务（车牌匹配待认领任务） */
	async create() {
		let rules = {
			plate: 'must|string|min:3|max:20|name=车牌号',
			phone: 'must|mobile|name=手机号',
			proof: 'string|name=单证图片',
		};
		let input = this.validateData(rules);

		let driver = await this.getDriverId();
		let service = new QueueService();
		return await service.claimTask(driver._id, this._userId, input.plate, input.phone, input.proof);
	}

	async myCurrent() {
		let driver = await this.getDriverId();
		let service = new QueueService();
		return await service.myCurrent(driver._id);
	}

	async checkin() {
		let rules = {
			id: 'must|string|name=预约记录',
			lat: 'must|name=纬度',
			lng: 'must|name=经度',
		};
		let input = this.validateData(rules);

		let driver = await this.getDriverId();
		let service = new QueueService();
		return await service.checkin(driver._id, input.id, input.lat, input.lng);
	}

	async subscribe() {
		let rules = {
			id: 'must|string|name=排队记录',
		};
		let input = this.validateData(rules);

		let driver = await this.getDriverId();
		let service = new QueueService();
		await service.subscribe(driver._id, input.id);
	}

	/** 司机确认收到叫号 */
	async confirm() {
		let rules = {
			id: 'must|string|name=排队记录',
		};
		let input = this.validateData(rules);

		let driver = await this.getDriverId();
		let service = new QueueService();
		return await service.driverConfirm(driver._id, input.id);
	}
}

module.exports = QueueController;
