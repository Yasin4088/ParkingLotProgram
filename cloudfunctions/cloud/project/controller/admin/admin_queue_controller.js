/**
 * Notes: 管理员装卸叫号控制器
 */

const BaseAdminController = require('./base_admin_controller.js');
const QueueService = require('../../service/queue_service.js');

class AdminQueueController extends BaseAdminController {

	async list() {
		await this.isAdmin();

		let service = new QueueService();
		return await service.list();
	}

	/** 叫号（指定车辆 + 叉车司机） */
	async callNext() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			forkliftId: 'must|string|name=叉车司机',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.callDriver(input.id, input.forkliftId);
	}

	async detail() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.detail(input.id);
	}

	async edit() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			plate: 'must|string|name=车牌号',
			phone: 'must|string|name=手机号',
			action: 'must|string|name=业务类型',
			cargoName: 'string|max:50|name=货物名称',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.edit(input.id, input);
	}

	async cancel() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			reason: 'must|string|name=取消原因',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		await service.cancel(input.id, input.reason);
	}

	async finish() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		await service.finish(input.id);
	}

	/** 获取可用叉车司机列表 */
	async forkliftList() {
		await this.isAdmin();

		let service = new QueueService();
		return await service.getForkliftList();
	}
}

module.exports = AdminQueueController;
