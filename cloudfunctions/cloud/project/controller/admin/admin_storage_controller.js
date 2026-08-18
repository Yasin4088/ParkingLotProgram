/**
 * Notes: 管理员存取柜控制器
 */

const BaseAdminController = require('./base_admin_controller.js');
const AdminStorageService = require('../../service/admin/admin_storage_service.js');

class AdminStorageController extends BaseAdminController {

	async list() {
		await this.isAdmin();

		let service = new AdminStorageService();
		return await service.list(this._isSuper());
	}

	async detail() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=存取柜记录',
		};
		let input = this.validateData(rules);

		let service = new AdminStorageService();
		return await service.detail(input.id, this._isSuper());
	}

	/** 叫号 */
	async call() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=存取柜记录',
		};
		let input = this.validateData(rules);

		let service = new AdminStorageService();
		return await service.call(input.id, this._isSuper());
	}

	/** 存取柜自动叫号开关（自动/人工叫号切换；仅超级管理员） */
	async setAutoCall() {
		await this.isSuperAdmin();

		let rules = {
			value: 'must|int|name=开关状态',
		};
		let input = this.validateData(rules);

		let service = new AdminStorageService();
		return await service.setAutoCall(input.value);
	}

	/** 收回叫号 */
	async recall() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=存取柜记录',
		};
		let input = this.validateData(rules);

		let service = new AdminStorageService();
		return await service.recall(input.id);
	}

	/** 手动派单 */
	async assign() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=存取柜记录',
			forkliftId: 'must|string|name=吊柜司机',
		};
		let input = this.validateData(rules);

		let service = new AdminStorageService();
		return await service.assign(input.id, input.forkliftId, this._isSuper());
	}

	/** 现场收款确认（仅超级管理员） */
	async confirmPay() {
		await this.isSuperAdmin();

		let rules = {
			id: 'must|string|name=存取柜记录',
		};
		let input = this.validateData(rules);

		let service = new AdminStorageService();
		return await service.confirmPay(input.id, '管理员');
	}

	async cancel() {
		await this.isAdmin();

		let rules = {
			id: 'must|string|name=存取柜记录',
			reason: 'must|string|name=取消原因',
		};
		let input = this.validateData(rules);

		let service = new AdminStorageService();
		await service.cancel(input.id, input.reason, '管理员', this._isSuper());
	}

	async historyList() {
		await this.isSuperAdmin();

		let rules = {
			yearMonth: 'string|name=月份',
		};
		let input = this.validateData(rules);

		let service = new AdminStorageService();
		return await service.historyList(input.yearMonth);
	}

	async historyClear() {
		await this.isSuperAdmin();

		let rules = {
			id: 'must|string|name=历史记录',
		};
		let input = this.validateData(rules);

		let service = new AdminStorageService();
		await service.clearHistory(input.id);
	}

	async historyClearAll() {
		await this.isSuperAdmin();

		let service = new AdminStorageService();
		await service.clearAllHistory();
	}

	async cabinetList() {
		await this.isSuperAdmin();

		let service = new AdminStorageService();
		return await service.cabinetList();
	}

	async cabinetSave() {
		await this.isSuperAdmin();

		let rules = {
			id: 'string|name=柜型记录',
			name: 'must|string|name=柜型名称',
			priceDaily: 'must|name=每日单价',
			status: 'int|name=状态',
			order: 'int|name=排序',
		};
		let input = this.validateData(rules);

		let service = new AdminStorageService();
		return await service.cabinetSave({
			id: input.id,
			name: input.name,
			priceDaily: input.priceDaily,
			status: input.status,
			order: input.order,
		});
	}

	async cabinetDel() {
		await this.isSuperAdmin();

		let rules = {
			id: 'must|string|name=柜型记录',
		};
		let input = this.validateData(rules);

		let service = new AdminStorageService();
		await service.cabinetDel(input.id);
	}

	/** 可用吊柜司机列表 */
	async forkliftList() {
		await this.isAdmin();

		let service = new AdminStorageService();
		return await service.getForkliftList();
	}
}

module.exports = AdminStorageController;
