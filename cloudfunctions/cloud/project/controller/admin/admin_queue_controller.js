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

	/** 管理员创建任务；其他管理员只能预填其他公司单（挚力单仅超级管理员预填） */
	async createTask() {
		await this.isAdmin();

		let rules = {
			plate: 'must|string|min:3|max:20|name=车牌号',
			phone: 'must|mobile|name=司机手机号',
			action: 'must|string|name=业务类型',
			cargoName: 'string|max:50|name=货物名称',
			remark: 'string|max:500|name=备注',
			fees: 'array|name=预估费用',
			payMode: 'int|name=支付方式',
			company: 'int|name=公司',
		};
		let input = this.validateData(rules);

		let isSuper = this._isSuper();
		// 其他管理员：强制其他公司单，无费用/支付方式（叫号后直接完成）
		let company = isSuper ? (Number(input.company) === 1 ? 1 : 0) : 1;
		let fees = isSuper ? input.fees : [];
		let payMode = isSuper ? input.payMode : 0;

		let service = new QueueService();
		return await service.createTask(input.plate, input.action, input.cargoName, input.phone, fees, input.remark, payMode, company);
	}

	/** 叫号（挚力单进入叉车抢单池；其他公司单叫号后直接完成） */
	async callSelected() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.callDriver(input.id, this._isSuper());
	}

	async callNext() {
		return await this.callSelected();
	}

	/** 装卸货自动叫号开关（自动/人工叫号切换；仅超级管理员） */
	async setAutoCall() {
		await this.isSuperAdmin();

		let rules = {
			value: 'must|int|name=开关状态',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.setAutoCall(input.value);
	}

	/** 管理员收回叫号（仅超级管理员） */
	async recallCall() {
		await this.isSuperAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.recallCall(input.id);
	}

	/** 管理员手动派单（抢单兜底；仅超级管理员） */
	async manualAssign() {
		await this.isSuperAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			forkliftId: 'must|string|name=叉车司机',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.manualAssign(input.id, input.forkliftId);
	}

	/** 管理员整体保存现场费用（支付前可修改；仅超级管理员） */
	async saveSceneFee() {
		await this.isSuperAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			fees: 'array|name=费用',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.saveSceneFees(input.id, input.fees);
	}

	/** 管理员结算（仅超级管理员） */
	async settle() {
		await this.isSuperAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			payMode: 'int|name=支付方式',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.settle(input.id, '管理员', input.payMode);
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
		await this.isSuperAdmin();

		let rules = {
			yearMonth: 'string|name=月份',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.historyList(input.yearMonth);
	}

	async historyClear() {
		await this.isSuperAdmin();

		let rules = {
			id: 'must|string|name=历史记录',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		await service.clearHistory(input.id);
	}

	async historyClearAll() {
		await this.isSuperAdmin();

		let service = new QueueService();
		await service.clearAllHistory();
	}

	/** 编辑排队记录（仅超级管理员） */
	async edit() {
		await this.isSuperAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			plate: 'must|string|name=车牌号',
			phone: 'must|string|name=手机号',
			action: 'must|string|name=业务类型',
			cargoName: 'string|max:50|name=货物名称',
			remark: 'string|max:500|name=备注',
			fees: 'array|name=预估费用',
			payMode: 'int|name=支付方式',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		return await service.edit(input.id, input);
	}

	/** 取消（超级管理员可取消任意单；其他管理员仅可取消其他公司单） */
	async cancel() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=排队记录',
			reason: 'must|string|name=取消原因',
		};
		let input = this.validateData(rules);

		let service = new QueueService();
		await service.cancel(input.id, input.reason, '管理员', this._isSuper());
	}

	/** 管理员兜底完成（仅超级管理员） */
	async finish() {
		await this.isSuperAdmin();

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
