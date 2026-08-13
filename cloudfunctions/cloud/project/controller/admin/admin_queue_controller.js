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

	/** 管理员创建任务 */
	async createTask() {
		await this.isAdmin();

		let rules = {
			plate: 'must|string|min:3|max:20|name=车牌号',
			phone: 'must|mobile|name=司机手机号',
			action: 'must|string|name=业务类型',
			cargoName: 'string|max:50|name=货物名称',
			remark: 'string|max:500|name=备注',
			fees: 'array|name=预估费用',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.createTask(input.plate, input.action, input.cargoName, input.phone, input.fees, input.remark);
	}

	/** 叫号（任务进入叉车抢单池） */
	async callSelected() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.callDriver(input.id);
	}

	async callNext() {
		return await this.callSelected();
	}

	/** 管理员收回叫号 */
	async recallCall() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.recallCall(input.id);
	}

	/** 管理员手动派单（抢单兜底） */
	async manualAssign() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			forkliftId: 'must|string|name=叉车司机',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.manualAssign(input.id, input.forkliftId);
	}

	/** 管理员整体保存现场费用（支付前可修改） */
	async saveSceneFee() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			fees: 'array|name=费用',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.saveSceneFees(input.id, input.fees);
	}

	/** 管理员结算 */
	async settle() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.settle(input.id);
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

		let rules = {
			yearMonth: 'string|name=月份',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.historyList(input.yearMonth);
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
			remark: 'string|max:500|name=备注',
			fees: 'array|name=预估费用',
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
