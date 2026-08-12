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

	/** 叫号（管理员指定车辆 + 多位叉车司机） */
	async callSelected() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			forkliftIds: 'must|array|name=叉车司机',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.callDriver(input.id, input.forkliftIds);
	}

	async callNext() {
		return await this.callSelected();
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

	async historyList() {
		await this.isAdmin();

		let service = new QueueService();
		return await service.historyList();
	}

	async historyClear() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=历史记录',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		await service.clearHistory(input.id);
	}

	async historyClearAll() {
		await this.isAdmin();

		let service = new QueueService();
		await service.clearAllHistory();
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

	/** 管理员重新分派叉车司机（替换拒绝/超时的） */
	async reassignForklift() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			oldForkliftId: 'must|string|name=被替换叉车司机',
			newForkliftId: 'must|string|name=新叉车司机',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.reassignForklift(input.id, input.oldForkliftId, input.newForkliftId);
	}
}

module.exports = AdminQueueController;
