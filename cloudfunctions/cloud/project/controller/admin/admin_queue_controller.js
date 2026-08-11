/**
 * Notes: 管理员装卸叫号控制器
 */

const BaseAdminController = require('./base_admin_controller.js');
const QueueService = require('../../service/queue_service.js');

class AdminQueueController extends BaseAdminController {

	async list() {
		await this.isAdmin();

		let rules = {
			lotId: 'string|name=停车场',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.list(input.lotId);
	}

	async callNext() {
		await this.isAdmin();

		let rules = {
			lotId: 'must|string|name=停车场',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.callNext(input.lotId);
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
			lotId: 'must|string|name=停车场',
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
}

module.exports = AdminQueueController;
