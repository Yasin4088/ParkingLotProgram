/**
 * Notes: 管理员存取柜业务（看板叫号/派单/收款确认/柜型管理）
 */

const BaseAdminService = require('./base_admin_service.js');
const StorageModel = require('../../model/storage_model.js');
const CabinetModel = require('../../model/cabinet_model.js');
const UserModel = require('../../model/user_model.js');
const StorageService = require('../storage_service.js');
const timeUtil = require('../../../framework/utils/time_util.js');

class AdminStorageService extends BaseAdminService {

	/** 看板列表（未取柜/未取消的记录） */
	async list() {
		let service = new StorageService();
		// 自动叫号兜底：看板 10s 轮询时顺带执行一次
		await service.autoCallCheck();

		let list = await StorageModel.getAll({
			STORAGE_STATUS: ['in', StorageModel.BOARD_STATUS]
		}, '*', {
			STORAGE_STATUS: 'asc',
			STORAGE_QUEUE_TIME: 'asc',
			STORAGE_ADD_TIME: 'asc'
		}, 200);

		return {
			autoCall: await this.getAutoCallFlag('SETUP_STORAGE_AUTO_CALL'),
			list: list.map(item => service._formatStorageItem(item))
		};
	}

	async detail(id) {
		let service = new StorageService();
		return await service.detail(id);
	}

	/** 管理员叫号（待叫号 → 已叫号，进入吊柜抢单池） */
	async call(id) {
		let item = await StorageModel.getOne({
			_id: id,
			STORAGE_STATUS: ['in', [StorageModel.STATUS.STORE_WAITING, StorageModel.STATUS.FETCH_WAITING]]
		});
		if (!item) this.AppError('仅可叫号待叫号的记录');

		// 取柜叫号防御校验：必须先缴费/确认收款
		if (item.STORAGE_STATUS === StorageModel.STATUS.FETCH_WAITING && Number(item.STORAGE_PAY_STATUS) === StorageModel.PAY_STATUS.UNPAID) {
			this.AppError('该记录尚未缴费，请先确认收款');
		}

		let newStatus = item.STORAGE_STATUS === StorageModel.STATUS.STORE_WAITING
			? StorageModel.STATUS.STORE_CALLED
			: StorageModel.STATUS.FETCH_CALLED;

		let now = timeUtil.time();
		let updated = await StorageModel.edit({
			_id: item._id,
			STORAGE_STATUS: item.STORAGE_STATUS
		}, {
			STORAGE_STATUS: newStatus,
			STORAGE_CALL_TIME: now,
		});
		if (!updated) this.AppError('该记录状态已变化，请刷新后重试');

		return await this.detail(id);
	}

	/** 自动叫号开关（管理员看板切换；开启时立即尝试叫一次） */
	async setAutoCall(value) {
		let flag = Number(value) === 1 ? 1 : 0;
		let service = new StorageService();
		await service.setAutoCallFlag('SETUP_STORAGE_AUTO_CALL', flag);
		if (flag) await service.autoCallCheck();
		return { autoCall: flag };
	}

	/** 管理员收回叫号（吊柜未接单时回退待叫号） */
	async recall(id) {
		let item = await StorageModel.getOne({
			_id: id,
			STORAGE_STATUS: ['in', [StorageModel.STATUS.STORE_CALLED, StorageModel.STATUS.FETCH_CALLED]],
			STORAGE_FORKLIFT_ID: ''
		});
		if (!item) this.AppError('仅可收回吊柜尚未接单的叫号');

		let newStatus = item.STORAGE_STATUS === StorageModel.STATUS.STORE_CALLED
			? StorageModel.STATUS.STORE_WAITING
			: StorageModel.STATUS.FETCH_WAITING;

		let updated = await StorageModel.edit({
			_id: item._id,
			STORAGE_STATUS: item.STORAGE_STATUS,
			STORAGE_FORKLIFT_ID: ''
		}, {
			STORAGE_STATUS: newStatus,
			STORAGE_CALL_TIME: 0,
		});
		if (!updated) this.AppError('该记录状态已变化，请刷新后重试');

		return await this.detail(id);
	}

	/** 管理员手动派单（抢单兜底，派单即进入执行中，仅限吊柜身份账号） */
	async assign(id, forkliftId) {
		let forklift = await UserModel.getOne({
			_id: forkliftId,
			USER_ROLE: 'crane',
			USER_STATUS: UserModel.STATUS.COMM
		}, 'USER_NAME');
		if (!forklift) this.AppError('吊柜司机不存在或已禁用');

		let item = await StorageModel.getOne({
			_id: id,
			STORAGE_STATUS: ['in', [StorageModel.STATUS.STORE_CALLED, StorageModel.STATUS.FETCH_CALLED]],
			STORAGE_FORKLIFT_ID: ''
		});
		if (!item) this.AppError('该记录已被吊柜司机接单');

		let newStatus = item.STORAGE_STATUS === StorageModel.STATUS.STORE_CALLED
			? StorageModel.STATUS.STORE_EXECUTING
			: StorageModel.STATUS.FETCH_EXECUTING;

		let now = timeUtil.time();
		let updated = await StorageModel.edit({
			_id: item._id,
			STORAGE_STATUS: item.STORAGE_STATUS,
			STORAGE_FORKLIFT_ID: ''
		}, {
			STORAGE_STATUS: newStatus,
			STORAGE_FORKLIFT_ID: forkliftId,
			STORAGE_FORKLIFT_NAME: forklift.USER_NAME,
			STORAGE_FORKLIFT_GRAB_TIME: now,
			STORAGE_FORKLIFT_GRAB_TYPE: StorageModel.GRAB_TYPE.ASSIGN,
		});
		if (!updated) this.AppError('该记录已被吊柜司机接单或状态已变化，请刷新');

		// 派单后抢单池释放，立即尝试自动叫下一位
		await new StorageService().autoCallCheck();

		return await this.detail(id);
	}

	/** 现场收款确认（取柜待缴费 → 取柜待叫号，生成排队号） */
	async confirmPay(id, operator = '管理员') {
		let item = await StorageModel.getOne({
			_id: id,
			STORAGE_STATUS: StorageModel.STATUS.FETCH_TO_PAY
		});
		if (!item) this.AppError('仅可确认待缴费记录的收款');

		let now = timeUtil.time();
		let queueNo = await StorageService.makeStorageNo(now);

		// 条件更新：仍为待缴费才确认（与 payNotify 回调互斥，防双发排队号）
		let updated = await StorageModel.edit({
			_id: item._id,
			STORAGE_STATUS: StorageModel.STATUS.FETCH_TO_PAY
		}, {
			STORAGE_STATUS: StorageModel.STATUS.FETCH_WAITING,
			STORAGE_PAY_MODE: StorageModel.PAY_MODE.ONSITE,
			STORAGE_PAY_STATUS: StorageModel.PAY_STATUS.CONFIRMED,
			STORAGE_PAY_CONFIRM_TIME: now,
			STORAGE_PAY_CONFIRM_OPERATOR: operator,
			STORAGE_NO: queueNo,
			STORAGE_QUEUE_TIME: now,
		});
		if (!updated) this.AppError('该记录状态已变化（可能已在线支付入队），请刷新后重试');

		// 确认收款进队后立即尝试自动叫号（开关开启时；detail 在叫号后读取为最新状态）
		await new StorageService().autoCallCheck();

		return await this.detail(id);
	}

	/** 管理员取消（看板任意状态均可删除，留历史） */
	async cancel(id, reason, operator = '管理员') {
		let item = await StorageModel.getOne({
			_id: id,
			STORAGE_STATUS: ['in', StorageModel.BOARD_STATUS]
		});
		if (!item) this.AppError('仅可删除看板上的记录');

		reason = (reason || '').trim();
		if (!reason) this.AppError('请输入取消原因');

		let updated = await StorageModel.edit({
			_id: item._id,
			STORAGE_STATUS: item.STORAGE_STATUS
		}, {
			STORAGE_STATUS: StorageModel.STATUS.CANCEL,
			STORAGE_CANCEL_TIME: timeUtil.time(),
			STORAGE_CANCEL_REASON: reason,
			STORAGE_CANCEL_OPERATOR: operator
		});
		if (!updated) this.AppError('该记录状态已变化，请刷新后重试');
	}

	/** 历史记录（已取柜/已取消，可按月筛选） */
	async historyList(yearMonth) {
		let list = await StorageModel.getAll({
			STORAGE_STATUS: ['in', [StorageModel.STATUS.FETCHED, StorageModel.STATUS.CANCEL]]
		}, '*', { STORAGE_ADD_TIME: 'desc' }, 500);

		let service = new StorageService();
		list = (list || []).map(item => service._formatStorageItem(item));

		if (yearMonth) {
			let range = service._getMonthRange(yearMonth);
			list = list.filter(item => {
				let t = service._getHistoryTime(item);
				return t >= range.start && t < range.end;
			});
		}

		list.sort((a, b) => (service._getHistoryTime(b) - service._getHistoryTime(a)));

		return {
			total: list.length,
			list
		};
	}

	/** 清理单条历史记录 */
	async clearHistory(id) {
		let item = await StorageModel.getOne({
			_id: id,
			STORAGE_STATUS: ['in', [StorageModel.STATUS.FETCHED, StorageModel.STATUS.CANCEL]]
		}, '_id');
		if (!item) this.AppError('未找到可清理的历史记录');

		await StorageModel.del(item._id);
	}

	/** 清空全部历史记录 */
	async clearAllHistory() {
		await StorageModel.del({
			STORAGE_STATUS: ['in', [StorageModel.STATUS.FETCHED, StorageModel.STATUS.CANCEL]]
		});
	}

	// ========== 柜型管理 ==========

	async cabinetList() {
		let list = await CabinetModel.getAll({}, '*', {
			CABINET_ORDER: 'asc',
			CABINET_ADD_TIME: 'asc'
		}, 100);

		return {
			list: (list || []).map(c => ({
				_id: c._id,
				name: c.CABINET_NAME,
				priceDaily: Number(c.CABINET_PRICE_DAILY) || 0,
				priceDailyText: ((Number(c.CABINET_PRICE_DAILY) || 0) / 100).toFixed(2),
				status: c.CABINET_STATUS,
				statusDesc: CabinetModel.getDesc('STATUS', c.CABINET_STATUS),
				order: c.CABINET_ORDER,
			}))
		};
	}

	/** 新增/编辑柜型（id 空=新增，否则编辑） */
	async cabinetSave({ id, name, priceDaily, status, order }) {
		name = (name || '').trim();
		if (!name) this.AppError('请输入柜型名称');
		if (name.length > 20) this.AppError('柜型名称过长');
		let price = Number(priceDaily);
		if (!Number.isInteger(price) || price < 0) this.AppError('每日单价需为不小于0的整数（分）');
		let st = Number(status) === CabinetModel.STATUS.FORBID ? CabinetModel.STATUS.FORBID : CabinetModel.STATUS.OPEN;

		let data = {
			CABINET_NAME: name,
			CABINET_PRICE_DAILY: price,
			CABINET_STATUS: st,
			CABINET_ORDER: Number.isInteger(Number(order)) ? Number(order) : 9999,
		};

		if (id) {
			let item = await CabinetModel.getOne({ _id: id }, 'CABINET_ID');
			if (!item) this.AppError('柜型不存在');
			await CabinetModel.edit(id, data);
		} else {
			await CabinetModel.insert(data);
		}

		return await this.cabinetList();
	}

	/** 删除柜型（有进行中记录引用时拒绝） */
	async cabinetDel(id) {
		let item = await CabinetModel.getOne({ _id: id }, 'CABINET_ID');
		if (!item) this.AppError('柜型不存在');

		let cnt = await StorageModel.count({
			STORAGE_CABINET_ID: id,
			STORAGE_STATUS: ['in', StorageModel.BOARD_STATUS]
		});
		if (cnt > 0) this.AppError('该柜型有进行中的存取柜记录，请先禁用');

		await CabinetModel.del(id);
	}

	/** 可用吊柜司机列表（仅吊柜身份账号 USER_ROLE=crane） */
	async getForkliftList() {
		let list = await UserModel.getAll({
			USER_ROLE: 'crane',
			USER_STATUS: UserModel.STATUS.COMM
		}, 'USER_NAME', { USER_NAME: 'asc' }, 200);
		return (list || []).map(u => ({ _id: u._id, USER_NAME: u.USER_NAME }));
	}
}

module.exports = AdminStorageService;
