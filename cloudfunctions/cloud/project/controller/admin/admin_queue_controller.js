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
