/**
 * Notes: 停车场装卸排队业务（任务制 + 叉车抢单 + 费用结算）
 */

const BaseService = require('./base_service.js');
const QueueModel = require('../model/queue_model.js');
const UserModel = require('../model/user_model.js');
const WxPayLib = require('../lib/wxpay_lib.js');
const config = require('../../config/config.js');
const timeUtil = require('../../framework/utils/time_util.js');
const miniLib = require('../../framework/lib/mini_lib.js');

const DEFAULT_LOT = { id: 'A', name: '装卸堆场', address: '园区装卸区' };

const ACTIONS = {
	load: '装货',
	unload: '卸货'
};

// 司机进行中的状态（认领后到离场前）
const ACTIVE_STATUS = [
	QueueModel.STATUS.BOOKED,
	QueueModel.STATUS.WAITING,
	QueueModel.STATUS.CALLED,
	QueueModel.STATUS.EXECUTING,
	QueueModel.STATUS.FINISHED,
	QueueModel.STATUS.TO_PAY
];

// 管理员看板展示的状态
const BOARD_STATUS = [
	QueueModel.STATUS.CLAIM_PENDING,
	QueueModel.STATUS.BOOKED,
	QueueModel.STATUS.WAITING,
	QueueModel.STATUS.CALLED,
	QueueModel.STATUS.EXECUTING,
	QueueModel.STATUS.FINISHED,
	QueueModel.STATUS.TO_PAY
];

class QueueService extends BaseService {

	getOptions() {
		return {
			lots: [DEFAULT_LOT],
			actions: Object.keys(ACTIONS).map(key => ({ id: key, name: ACTIONS[key] }))
		};
	}

	/** 管理员创建任务（待认领）；company 0=挚力(全流程),1=其他(叫号后直接完成不留历史) */
	async createTask(plate, action, cargoName, phone, fees, remark, payMode, company) {
		if (!ACTIONS[action]) this.AppError('请选择装货或卸货');

		plate = (plate || '').trim().toUpperCase();
		if (!plate) this.AppError('请输入车牌号');
		phone = (phone || '').trim();
		if (!phone) this.AppError('请输入司机手机号');

		let comp = Number(company) === 1 ? 1 : 0;
		// 其他公司单无计费环节，费用/支付方式不落库
		let storeFees = comp === 1 ? [] : this._checkEstimateFees(fees);
		let storePayMode = comp === 1 ? 0 : (Number(payMode) === 1 ? 1 : 0);

		return await QueueModel.insert({
			QUEUE_USER_ID: '',
			QUEUE_OPENID: '',
			QUEUE_PHONE: phone,
			QUEUE_PLATE: plate,
			QUEUE_LOT_ID: DEFAULT_LOT.id,
			QUEUE_LOT_NAME: DEFAULT_LOT.name,
			QUEUE_COMPANY: comp,
			QUEUE_ACTION: action,
			QUEUE_ACTION_NAME: ACTIONS[action],
			QUEUE_CARGO_NAME: cargoName || '',
			QUEUE_REMARK: (remark || '').trim(),
			QUEUE_CREATE_TYPE: 0,
			QUEUE_FEES: storeFees,
			QUEUE_FEE_TOTAL: this._sumFees(storeFees),
			QUEUE_PAY_MODE: storePayMode,
			QUEUE_FORKLIFT_ID: '',
			QUEUE_FORKLIFT_NAME: '',
			QUEUE_STATUS: QueueModel.STATUS.CLAIM_PENDING,
			QUEUE_SUBSCRIBE: 0,
		});
	}

	/** 司机认领任务（车牌匹配待认领任务） */
	async claimTask(userId, openId, plate, phone, proof) {
		let active = await QueueModel.getOne({
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: ['in', ACTIVE_STATUS]
		}, 'QUEUE_ID,QUEUE_STATUS');
		if (active) this.AppError('您已有未完成的预约或排队记录，请完成后再提交');

		plate = (plate || '').trim().toUpperCase();
		let task = await QueueModel.getOne({
			QUEUE_STATUS: QueueModel.STATUS.CLAIM_PENDING,
			QUEUE_PLATE: plate
		}, '*', { QUEUE_ADD_TIME: 'asc' });
		if (!task) this.AppError('未找到与车牌匹配的待认领任务，请联系管理员创建');

		let updated = await QueueModel.edit({
			_id: task._id,
			QUEUE_STATUS: QueueModel.STATUS.CLAIM_PENDING
		}, {
			QUEUE_USER_ID: userId,
			QUEUE_OPENID: openId,
			QUEUE_PHONE: phone,
			QUEUE_PROOF: proof || '',
			QUEUE_STATUS: QueueModel.STATUS.BOOKED,
		});
		if (!updated) this.AppError('手慢了，该任务已被认领');

		return await this.detail(task._id);
	}

	async myCurrent(userId) {
		let item = await QueueModel.getOne({
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: ['in', ACTIVE_STATUS]
		}, '*', { QUEUE_ADD_TIME: 'desc' });

		let ret = { item: null, lastDone: null };
		if (item) {
			let ahead = 0;
			if (item.QUEUE_STATUS === QueueModel.STATUS.WAITING) {
				ahead = await QueueModel.count({
					QUEUE_STATUS: QueueModel.STATUS.WAITING,
					QUEUE_CHECKIN_TIME: ['<', item.QUEUE_CHECKIN_TIME]
				});
			}
			ret.item = this._formatQueueItem(item, ahead);
		} else {
			// 无进行中记录时，附带最近一条历史记录（只读展示）
			let last = await QueueModel.getOne({
				QUEUE_USER_ID: userId,
				QUEUE_STATUS: ['in', [QueueModel.STATUS.DONE, QueueModel.STATUS.CANCEL]]
			}, '*', { QUEUE_ADD_TIME: 'desc' });
			ret.lastDone = last ? this._formatQueueItem(last) : null;
		}

		// 剥离内部字段（用户 _id/叉车 _id/单证照等不可下发，防止伪造身份）
		for (let obj of [ret.item, ret.lastDone]) {
			if (!obj) continue;
			delete obj.QUEUE_USER_ID;
			delete obj.QUEUE_OPENID;
			delete obj.QUEUE_FORKLIFT_ID;
			delete obj.QUEUE_PROOF;
			delete obj.QUEUE_CHECKIN_LAT;
			delete obj.QUEUE_CHECKIN_LNG;
		}

		return ret;
	}

	async checkin(userId, id, lat, lng) {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.BOOKED
		});
		if (!item) this.AppError('未找到可签到的预约记录');

		// GPS 距离校验：司机上报位置须在装卸区允许半径内（未配置坐标时跳过）
		this._checkInRange(lat, lng);

		let now = timeUtil.time();
		let queueNo = await this._makeQueueNo(now);
		// 条件更新：并发签到/过期清理时只有一方成功（号码已发，失败时当日号码留空号，可接受）
		let updated = await QueueModel.edit({
			_id: item._id,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.BOOKED
		}, {
			QUEUE_NO: queueNo,
			QUEUE_STATUS: QueueModel.STATUS.WAITING,
			QUEUE_CHECKIN_LAT: Number(lat) || 0,
			QUEUE_CHECKIN_LNG: Number(lng) || 0,
			QUEUE_CHECKIN_TIME: now,
		});
		if (!updated) this.AppError('预约状态已变化，请刷新后重试');

		// 签到进队后立即尝试自动叫号（开关开启时；myCurrent 随后读取为最新状态）
		await this.autoCallCheck();

		return await this.myCurrent(userId);
	}

	/** GPS 签到距离校验：超出装卸区允许半径时拒绝签到（config.CHECKIN_LOT 未配置时跳过）
	 *  坐标基于 gcj02（与 wx.getLocation type=gcj02 一致） */
	_checkInRange(lat, lng) {
		let cfg = config.CHECKIN_LOT || {};
		let cLat = Number(cfg.lat);
		let cLng = Number(cfg.lng);
		let radius = Number(cfg.radiusM) || 0;
		if (!cLat || !cLng || radius <= 0) return; // 未配置堆场坐标时不校验

		let latN = Number(lat);
		let lngN = Number(lng);
		if (!latN || !lngN) this.AppError('定位失败，请重新签到');

		let dist = this._distanceM(latN, lngN, cLat, cLng);
		if (dist > radius) {
			let km = dist >= 1000 ? (dist / 1000).toFixed(1) + '公里' : Math.round(dist) + '米';
			this.AppError('您还未到达装卸区，无法签到（距园区约' + km + '）');
		}
	}

	/** 两点球面距离（haversine，米） */
	_distanceM(lat1, lng1, lat2, lng2) {
		let R = 6371000;
		let dLat = (lat2 - lat1) * Math.PI / 180;
		let dLng = (lng2 - lng1) * Math.PI / 180;
		let a = Math.pow(Math.sin(dLat / 2), 2)
			+ Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.pow(Math.sin(dLng / 2), 2);
		return 2 * R * Math.asin(Math.sqrt(a));
	}

	async subscribe(userId, id) {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: ['in', ACTIVE_STATUS]
		}, '_id');
		if (!item) this.AppError('未找到排队记录');

		// 订阅为非关键动作：状态已变时静默忽略，不报错
		await QueueModel.edit({
			_id: item._id,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: ['in', ACTIVE_STATUS]
		}, { QUEUE_SUBSCRIBE: 1 });
	}

	/** 管理员叫号（挚力单进入叉车抢单池；其他公司单叫号后直接完成，无后续流程）
	 *  isSuper=false（其他管理员）时仅可叫号其他公司单 */
	async callDriver(queueId, isSuper = true) {
		let now = timeUtil.time();
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.WAITING
		}, 'QUEUE_COMPANY');
		if (!item) this.AppError('仅可叫号排队中的车辆');
		if (!isSuper && Number(item.QUEUE_COMPANY) !== 1) this.AppError('仅可叫号其他公司的排队记录');

		if (Number(item.QUEUE_COMPANY) === 1) {
			// 其他公司单：叫号广播照常，但直接置为已完成（不进叉车池、无费用/结算/支付）
			let updated = await QueueModel.edit({
				_id: queueId,
				QUEUE_STATUS: QueueModel.STATUS.WAITING
			}, {
				QUEUE_STATUS: QueueModel.STATUS.DONE,
				QUEUE_CALL_TIME: now,
				QUEUE_FINISH_TIME: now,
				QUEUE_DONE_TIME: now,
				QUEUE_PAY_STATUS: QueueModel.PAY_STATUS.FREE,
			});
			if (!updated) this.AppError('仅可叫号排队中的车辆');
			return await this.detail(queueId);
		}

		let updated = await QueueModel.edit({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.WAITING
		}, {
			QUEUE_STATUS: QueueModel.STATUS.CALLED,
			QUEUE_CALL_TIME: now,
			QUEUE_DRIVER_CONFIRMED: 0,
		});
		if (!updated) this.AppError('仅可叫号排队中的车辆');

		return await this.detail(queueId);
	}

	/** 自动叫号：开关开启且无未接单的叫号时，自动叫排队最早的一辆（最多保持 1 单待接单，接单后自动叫下一位）
	 *  其他公司单被叫后直接完成，不占用叉车抢单池 */
	async autoCallCheck() {
		try {
			if (!(await this.getAutoCallFlag('SETUP_QUEUE_AUTO_CALL'))) return;

			let calledCnt = await QueueModel.count({
				QUEUE_STATUS: QueueModel.STATUS.CALLED,
				QUEUE_FORKLIFT_ID: ''
			});
			if (calledCnt > 0) return;

			let waiting = await QueueModel.getAll({
				QUEUE_STATUS: QueueModel.STATUS.WAITING
			}, '_id,QUEUE_COMPANY', { QUEUE_CHECKIN_TIME: 'asc' }, 1);
			if (!waiting.length) return;

			let now = timeUtil.time();
			let target = waiting[0];
			let editData = {
				QUEUE_CALL_TIME: now,
			};
			if (Number(target.QUEUE_COMPANY) === 1) {
				// 其他公司单：叫号后直接完成
				editData.QUEUE_STATUS = QueueModel.STATUS.DONE;
				editData.QUEUE_FINISH_TIME = now;
				editData.QUEUE_DONE_TIME = now;
				editData.QUEUE_PAY_STATUS = QueueModel.PAY_STATUS.FREE;
			} else {
				editData.QUEUE_STATUS = QueueModel.STATUS.CALLED;
				editData.QUEUE_DRIVER_CONFIRMED = 0;
			}

			// 条件更新：并发/多触发点同时执行时仅一方成功
			await QueueModel.edit({
				_id: target._id,
				QUEUE_STATUS: QueueModel.STATUS.WAITING
			}, editData);
		} catch (e) {
			// 自动叫号为后台增强，失败不影响主流程（签到/抢单/看板刷新）
			console.error('自动叫号执行失败', e);
		}
	}

	/** 自动叫号开关（管理员看板切换；开启时立即尝试叫一次） */
	async setAutoCall(value) {
		let flag = Number(value) === 1 ? 1 : 0;
		await this.setAutoCallFlag('SETUP_QUEUE_AUTO_CALL', flag);
		if (flag) await this.autoCallCheck();
		return { autoCall: flag };
	}

	/** 管理员收回叫号（叉车未接单时回退排队） */
	async recallCall(queueId) {
		let updated = await QueueModel.edit({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.CALLED,
			QUEUE_FORKLIFT_ID: ''
		}, {
			QUEUE_STATUS: QueueModel.STATUS.WAITING,
			QUEUE_CALL_TIME: 0,
			QUEUE_DRIVER_CONFIRMED: 0,
		});
		if (!updated) this.AppError('仅可收回叉车尚未接单的叫号');

		return await this.detail(queueId);
	}

	/** 司机确认收到叫号（与叉车抢单并行，仅设标记位；其他公司单叫号即完成，重复确认静默成功） */
	async driverConfirm(userId, queueId) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.CALLED
		});
		if (!item) {
			// 其他公司单叫号后直接完成，司机此时确认视为已处理（不报错）
			let done = await QueueModel.getOne({
				_id: queueId,
				QUEUE_USER_ID: userId,
				QUEUE_STATUS: QueueModel.STATUS.DONE
			});
			if (done) return this._formatQueueItem(done);
			this.AppError('未找到待确认的叫号记录');
		}

		let updated = await QueueModel.edit({
			_id: item._id,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.CALLED
		}, {
			QUEUE_DRIVER_CONFIRMED: 1,
		});
		if (!updated) {
			// 重复确认/状态已流转：直接读取最新状态返回
			return await this._tryExecuting(queueId);
		}

		return await this._tryExecuting(queueId);
	}

	/** 检查是否可以进入执行中：司机已确认 + 叉车已接单 */
	async _tryExecuting(queueId) {
		let item = await QueueModel.getOne({ _id: queueId });
		if (!item) return null;

		if (item.QUEUE_STATUS !== QueueModel.STATUS.CALLED) {
			return this._formatQueueItem(item);
		}

		if (item.QUEUE_DRIVER_CONFIRMED === 1 && item.QUEUE_FORKLIFT_ID) {
			let now = timeUtil.time();
			let updated = await QueueModel.edit({
				_id: queueId,
				QUEUE_STATUS: QueueModel.STATUS.CALLED,
				QUEUE_DRIVER_CONFIRMED: 1,
				QUEUE_FORKLIFT_ID: item.QUEUE_FORKLIFT_ID
			}, {
				QUEUE_STATUS: QueueModel.STATUS.EXECUTING,
				QUEUE_CONFIRM_TIME: now,
			});
			if (updated) {
				item.QUEUE_STATUS = QueueModel.STATUS.EXECUTING;
				item.QUEUE_CONFIRM_TIME = now;
			}
		}

		return this._formatQueueItem(item);
	}

	/** 管理员手动派单（抢单兜底） */
	async manualAssign(queueId, forkliftId) {
		let forklift = await UserModel.getOne({
			_id: forkliftId,
			USER_ROLE: 'forklift',
			USER_STATUS: UserModel.STATUS.COMM
		}, 'USER_NAME');
		if (!forklift) this.AppError('叉车司机不存在或已禁用');

		let now = timeUtil.time();
		let updated = await QueueModel.edit({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.CALLED,
			QUEUE_FORKLIFT_ID: ''
		}, {
			QUEUE_FORKLIFT_ID: forkliftId,
			QUEUE_FORKLIFT_NAME: forklift.USER_NAME,
			QUEUE_FORKLIFT_GRAB_TIME: now,
			QUEUE_FORKLIFT_GRAB_TYPE: QueueModel.GRAB_TYPE.ASSIGN,
		});
		if (!updated) this.AppError('该任务已被叉车司机抢单');

		let ret = await this._tryExecuting(queueId);
		// 派单后抢单池释放，立即尝试自动叫下一位
		await this.autoCallCheck();
		return ret;
	}

	/** 管理员整体保存现场费用（执行中/待结算/待支付，支付前均可修改） */
	async saveSceneFees(queueId, fees) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.EXECUTING, QueueModel.STATUS.FINISHED, QueueModel.STATUS.TO_PAY]]
		});
		if (!item) this.AppError('仅可对执行中/待结算/待支付的记录修改费用');

		let list = Array.isArray(fees) ? fees : [];
		let clean = [];
		for (let f of list) {
			let name = (f.name || '').trim();
			if (!name) this.AppError('费用名称不能为空');
			if (name.length > 20) this.AppError('费用名称过长');
			let amount = Number(f.amount);
			if (!Number.isInteger(amount) || amount <= 0) this.AppError('费用金额需为大于0的整数（分）');
			clean.push({
				name,
				amount,
				type: QueueModel.FEE_TYPE.SCENE
			});
		}

		let total = this._sumFees(clean);
		let editData = {
			QUEUE_FEES: clean,
			QUEUE_FEE_TOTAL: total,
		};
		if (item.QUEUE_STATUS === QueueModel.STATUS.TO_PAY && total === 0) {
			// 待支付改零费用：回退待结算，重新走结算流程（免支付完成）
			editData.QUEUE_STATUS = QueueModel.STATUS.FINISHED;
			editData.QUEUE_SETTLE_TIME = 0;
		}

		let updated = await QueueModel.edit({
			_id: item._id,
			QUEUE_STATUS: item.QUEUE_STATUS
		}, editData);
		if (!updated) this.AppError('该记录状态已变化，请刷新后重试');

		return await this.detail(queueId);
	}

	/** 管理员结算：总费用>0 → 待支付（现场付）或直接完成（客户记账）；=0 → 免支付直接完成 */
	async settle(queueId, operator = '管理员', payMode) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.FINISHED
		});
		if (!item) this.AppError('仅可结算作业完成的记录');

		// 结算时显式选择的支付方式优先，未传时沿用建单时预填的方式
		let mode = Number(payMode);
		if (mode !== 0 && mode !== 1) {
			mode = Number(item.QUEUE_PAY_MODE) === 1 ? 1 : 0;
		}

		let now = timeUtil.time();
		let total = this._sumFees(item.QUEUE_FEES || []);
		// 条件更新：状态仍为 FINISHED 才允许结算，防并发重复结算
		let settleWhere = {
			_id: item._id,
			QUEUE_STATUS: QueueModel.STATUS.FINISHED
		};
		let updated = false;
		if (total > 0 && mode === 1) {
			// 客户记账：视为已完成，后台留支付方式记录
			updated = await QueueModel.edit(settleWhere, {
				QUEUE_FEE_TOTAL: total,
				QUEUE_PAY_MODE: 1,
				QUEUE_STATUS: QueueModel.STATUS.DONE,
				QUEUE_PAY_STATUS: QueueModel.PAY_STATUS.ON_ACCOUNT,
				QUEUE_SETTLE_TIME: now,
				QUEUE_SETTLE_OPERATOR: operator,
				QUEUE_DONE_TIME: now,
			});
		} else if (total > 0) {
			updated = await QueueModel.edit(settleWhere, {
				QUEUE_FEE_TOTAL: total,
				QUEUE_PAY_MODE: 0,
				QUEUE_STATUS: QueueModel.STATUS.TO_PAY,
				QUEUE_SETTLE_TIME: now,
				QUEUE_SETTLE_OPERATOR: operator,
			});
		} else {
			updated = await QueueModel.edit(settleWhere, {
				QUEUE_FEE_TOTAL: 0,
				QUEUE_PAY_MODE: mode,
				QUEUE_STATUS: QueueModel.STATUS.DONE,
				QUEUE_PAY_STATUS: QueueModel.PAY_STATUS.FREE,
				QUEUE_SETTLE_TIME: now,
				QUEUE_SETTLE_OPERATOR: operator,
				QUEUE_DONE_TIME: now,
			});
		}
		if (!updated) this.AppError('该记录状态已变化，请刷新后重试');

		return await this.detail(queueId);
	}

	/** 装卸货在线支付下单：返回 payParams 供 wx.requestPayment；查单兜底发现已支付时返回 {paid:true} */
	async pay(userId, id) {
		if (!config.WXPAY_ENABLE) this.AppError('在线支付暂未开通，请联系管理员现场缴费');

		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_USER_ID: userId,
			QUEUE_STATUS: QueueModel.STATUS.TO_PAY
		});
		if (!item) this.AppError('未找到待支付的排队记录');
		if (Number(item.QUEUE_FEE_TOTAL) <= 0) this.AppError('该记录无需支付');
		if (!item.QUEUE_OPENID) this.AppError('缺少支付用户信息，无法在线支付');
		if (!config.WXPAY_NOTIFY_URL) this.AppError('支付回调地址未配置');

		// 已有未完成订单先查单兜底（回调可能延迟/丢失）
		if (item.QUEUE_PAY_OUT_TRADE_NO) {
			let order = await this._queryWxOrder(item.QUEUE_PAY_OUT_TRADE_NO);
			if (order && order.trade_state === 'SUCCESS') {
				await this.markPaidByNotify(order);
				return { paid: true, id: item._id };
			}
			// NOTPAY/CLOSED：换新订单号重新下单
		}

		// 生成并保存商户订单号；条件更新把旧订单号（含空串）纳入 where，
		// 并发重复下单时仅先到者成功，避免两笔订单同时有效导致支付后不完成
		let outTradeNo = WxPayLib.genOutTradeNo(item._id, 'QUE');
		let updated = await QueueModel.edit({
			_id: item._id,
			QUEUE_STATUS: QueueModel.STATUS.TO_PAY,
			QUEUE_PAY_STATUS: QueueModel.PAY_STATUS.UNPAID,
			QUEUE_PAY_OUT_TRADE_NO: item.QUEUE_PAY_OUT_TRADE_NO || ''
		}, {
			QUEUE_PAY_OUT_TRADE_NO: outTradeNo,
			QUEUE_PAY_MODE: QueueModel.PAY_MODE.ONLINE,
		});
		if (!updated) {
			// 并发下单被抢先：以库内最新订单号查单兜底，已支付直接完成
			let fresh = await QueueModel.getOne({ _id: item._id }, 'QUEUE_PAY_OUT_TRADE_NO,QUEUE_STATUS');
			if (fresh && fresh.QUEUE_PAY_OUT_TRADE_NO && fresh.QUEUE_STATUS === QueueModel.STATUS.TO_PAY) {
				let existOrder = await this._queryWxOrder(fresh.QUEUE_PAY_OUT_TRADE_NO);
				if (existOrder && existOrder.trade_state === 'SUCCESS') {
					await this.markPaidByNotify(existOrder);
					return { paid: true, id: item._id };
				}
			}
			this.AppError('订单处理中，请稍后重试');
		}

		try {
			let prepay = await WxPayLib.jsapiPrepay({
				outTradeNo,
				description: '装卸货费用-' + (item.QUEUE_PLATE || ''),
				amountTotal: Number(item.QUEUE_FEE_TOTAL),
				payerOpenid: item.QUEUE_OPENID,
				notifyUrl: config.WXPAY_NOTIFY_URL,
			});
			return {
				payParams: WxPayLib.buildPayParams(prepay.prepay_id),
				id: item._id
			};
		} catch (e) {
			// 订单号被占用（重试/并发）：查单兜底，已支付直接完成
			if (e && e.wxCode === 'OUT_TRADE_NO_USED') {
				let order = await this._queryWxOrder(outTradeNo);
				if (order && order.trade_state === 'SUCCESS') {
					await this.markPaidByNotify(order);
					return { paid: true, id: item._id };
				}
				this.AppError('订单处理中，请稍后重试');
			}
			throw e;
		}
	}

	/** 查单兜底（订单不存在返回 null，网络/签名错误向上抛） */
	async _queryWxOrder(outTradeNo) {
		try {
			return await WxPayLib.queryOrder(outTradeNo);
		} catch (e) {
			if (e && (e.wxCode === 'ORDER_NOT_EXIST' || e.statusCode === 404)) return null;
			throw e;
		}
	}

	/** 支付成功落库（payNotify 回调/定时查单/下单兜底共用）：金额校验 + 条件更新 6→9，幂等
	 *  返回：'paid' 本次落库成功 / 'already' 已处理过 / 'amount_mismatch' 金额不符
	 *  注意：payNotify/index.js 内有同算法副本（markPaidQueue），改动需同步 */
	async markPaidByNotify(order) {
		let recordRes = await QueueModel.getAll({
			QUEUE_PAY_OUT_TRADE_NO: order.out_trade_no
		}, '_id,QUEUE_STATUS,QUEUE_FEE_TOTAL,QUEUE_PAY_OUT_TRADE_NO', {}, 1);
		let record = (recordRes || [])[0];
		if (!record) return 'already';

		if (Number(order.amount && order.amount.total) !== Number(record.QUEUE_FEE_TOTAL)) {
			console.error('[queue] 支付金额与费用不符：', order.out_trade_no, order.amount && order.amount.total, record.QUEUE_FEE_TOTAL);
			return 'amount_mismatch';
		}

		let now = timeUtil.time();
		let updated = await QueueModel.edit({
			_id: record._id,
			QUEUE_STATUS: QueueModel.STATUS.TO_PAY,
			QUEUE_PAY_OUT_TRADE_NO: order.out_trade_no
		}, {
			QUEUE_STATUS: QueueModel.STATUS.DONE,
			QUEUE_PAY_STATUS: QueueModel.PAY_STATUS.PAID,
			QUEUE_PAY_MODE: QueueModel.PAY_MODE.ONLINE,
			QUEUE_PAY_TIME: order.success_time ? new Date(order.success_time).getTime() : now,
			QUEUE_PAY_AMOUNT: Number(order.amount && order.amount.total) || 0,
			QUEUE_PAY_TRANSACTION_ID: order.transaction_id || '',
			QUEUE_DONE_TIME: now,
		});
		if (!updated) return 'already'; // 幂等：状态已流转或订单号已更换
		return 'paid';
	}

	/** 管理员现场确认收款（待支付 → 已完成，PAY_STATUS=4；仅超级管理员，现场缴费兜底） */
	async confirmPay(queueId, operator = '管理员') {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.TO_PAY
		}, 'QUEUE_ID,QUEUE_FEE_TOTAL');
		if (!item) this.AppError('仅可确认收款待支付的记录');

		let updated = await QueueModel.edit({
			_id: item._id,
			QUEUE_STATUS: QueueModel.STATUS.TO_PAY
		}, {
			QUEUE_STATUS: QueueModel.STATUS.DONE,
			QUEUE_PAY_STATUS: QueueModel.PAY_STATUS.CONFIRMED,
			QUEUE_PAY_CONFIRM_TIME: timeUtil.time(),
			QUEUE_PAY_CONFIRM_OPERATOR: operator,
			QUEUE_DONE_TIME: timeUtil.time(),
		});
		if (!updated) this.AppError('该记录状态已变化，请刷新后重试');

		return await this.detail(queueId);
	}

	/** 管理员兜底完成（叉车无法操作时） */
	async finish(queueId) {
		let item = await QueueModel.getOne({
			_id: queueId,
			QUEUE_STATUS: QueueModel.STATUS.EXECUTING
		});
		if (!item) this.AppError('仅可完成执行中的记录');

		let updated = await QueueModel.edit({
			_id: item._id,
			QUEUE_STATUS: QueueModel.STATUS.EXECUTING
		}, {
			QUEUE_STATUS: QueueModel.STATUS.FINISHED,
			QUEUE_FINISH_TIME: timeUtil.time(),
		});
		if (!updated) this.AppError('该记录状态已变化，请刷新后重试');
	}

	/** 管理员列表（单一堆场，无需按停车场筛选） */
	async list() {
		await this.cancelExpired();
		// 自动叫号兜底：看板 10s 轮询时顺带执行一次
		await this.autoCallCheck();

		let where = {
			QUEUE_STATUS: ['in', BOARD_STATUS]
		};

		let list = await QueueModel.getAll(where, '*', {
			QUEUE_STATUS: 'asc',
			QUEUE_CHECKIN_TIME: 'asc',
			QUEUE_ADD_TIME: 'asc'
		}, 200);

		return {
			lots: [DEFAULT_LOT],
			autoCall: await this.getAutoCallFlag('SETUP_QUEUE_AUTO_CALL'),
			list: list.map(item => this._formatQueueItem(item))
		};
	}

	/** 管理员历史记录（已完成/已取消，可按月筛选；其他公司单不留历史） */
	async historyList(yearMonth) {
		let list = await QueueModel.getAll({
			QUEUE_STATUS: ['in', [QueueModel.STATUS.DONE, QueueModel.STATUS.CANCEL]],
			QUEUE_COMPANY: ['<>', 1] // 排除其他公司单（含无字段的历史数据，视为挚力单）
		}, '*', { QUEUE_ADD_TIME: 'desc' }, 500);

		list = (list || []).map(item => this._formatQueueItem(item));

		if (yearMonth) {
			let range = this._getMonthRange(yearMonth);
			list = list.filter(item => {
				let t = this._getHistoryTime(item);
				return t >= range.start && t < range.end;
			});
		}

		list.sort((a, b) => (this._getHistoryTime(b) - this._getHistoryTime(a)));

		return {
			total: list.length,
			list
		};
	}

	/** 管理员清理单条历史记录（仅挚力单） */
	async clearHistory(id) {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.DONE, QueueModel.STATUS.CANCEL]],
			QUEUE_COMPANY: ['<>', 1]
		}, '_id');
		if (!item) this.AppError('未找到可清理的历史记录');

		await QueueModel.del(item._id);
	}

	/** 管理员清空全部历史记录（仅挚力单） */
	async clearAllHistory() {
		await QueueModel.del({
			QUEUE_STATUS: ['in', [QueueModel.STATUS.DONE, QueueModel.STATUS.CANCEL]],
			QUEUE_COMPANY: ['<>', 1]
		});
	}

	/** 清理过期记录：7天未认领的任务 + 24h未签到的预约 */
	async cancelExpired() {
		let now = timeUtil.time();

		// 7 天未认领的任务
		let expiredClaim = await QueueModel.getAll({
			QUEUE_STATUS: QueueModel.STATUS.CLAIM_PENDING,
			QUEUE_ADD_TIME: ['<', now - 7 * 24 * 60 * 60 * 1000]
		}, '_id', { QUEUE_ADD_TIME: 'asc' }, 200);

		for (let item of expiredClaim) {
			// 条件更新：并发认领时认领方优先，清理方跳过
			await QueueModel.edit({
				_id: item._id,
				QUEUE_STATUS: QueueModel.STATUS.CLAIM_PENDING
			}, {
				QUEUE_STATUS: QueueModel.STATUS.CANCEL,
				QUEUE_CANCEL_TIME: now,
				QUEUE_CANCEL_REASON: '超过7天未认领，任务已自动取消',
				QUEUE_CANCEL_OPERATOR: '系统自动清理'
			});
		}

		// 24h 未签到的预约（以认领时间为准）
		let expiredBooked = await QueueModel.getAll({
			QUEUE_STATUS: QueueModel.STATUS.BOOKED,
			QUEUE_EDIT_TIME: ['<', now - 24 * 60 * 60 * 1000]
		}, '_id', { QUEUE_EDIT_TIME: 'asc' }, 200);

		for (let item of expiredBooked) {
			// 条件更新：并发签到（BOOKED→WAITING）时签到方优先，消除互覆盖
			await QueueModel.edit({
				_id: item._id,
				QUEUE_STATUS: QueueModel.STATUS.BOOKED
			}, {
				QUEUE_STATUS: QueueModel.STATUS.CANCEL,
				QUEUE_CANCEL_TIME: now,
				QUEUE_CANCEL_REASON: '超过一天未签到，预约已自动取消',
				QUEUE_CANCEL_OPERATOR: '系统自动清理'
			});
		}

		return expiredClaim.length + expiredBooked.length;
	}

	async detail(id) {
		let item = await QueueModel.getOne({ _id: id });
		if (!item) this.AppError('未找到排队记录');
		let ret = this._formatQueueItem(item);

		// 附司机注册信息（管理员详情可见；列表不 join 避免 N+1）
		if (item.QUEUE_USER_ID) {
			let user = await UserModel.getOne({ _id: item.QUEUE_USER_ID }, 'USER_NAME,USER_IDCARD,USER_LICENSE_PLATE,USER_MOBILE,USER_DRIVER_LICENSE_IMG,USER_VEHICLE_REG_IMG,USER_IDCARD_IMG');
			if (user) {
				ret.driverInfo = {
					name: user.USER_NAME || '',
					idCard: user.USER_IDCARD || '',
					licensePlate: user.USER_LICENSE_PLATE || '',
					mobile: user.USER_MOBILE || '',
					driverLicenseImg: user.USER_DRIVER_LICENSE_IMG || '',
					vehicleRegImg: user.USER_VEHICLE_REG_IMG || '',
					idCardImg: user.USER_IDCARD_IMG || '',
				};
			}
		}

		return ret;
	}

	async edit(id, data) {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_STATUS: ['in', [QueueModel.STATUS.CLAIM_PENDING, QueueModel.STATUS.BOOKED, QueueModel.STATUS.WAITING, QueueModel.STATUS.CALLED]]
		});
		if (!item) this.AppError('仅可编辑当前流程中的记录');

		let editData = {};
		if (item.QUEUE_STATUS === QueueModel.STATUS.CALLED) {
			// 已叫号：仅可修改预估费用
			let fees = this._checkEstimateFees(data.fees);
			editData.QUEUE_FEES = fees;
			editData.QUEUE_FEE_TOTAL = this._sumFees(fees);
		} else {
			// 待认领/已预约/排队中：可改基本信息与预估费用
			if (!ACTIONS[data.action]) this.AppError('请选择装货或卸货');
			let phone = (data.phone || '').trim();
			let plate = (data.plate || '').trim().toUpperCase();
			if (!plate) this.AppError('请输入车牌号');
			if (!phone) this.AppError('请输入手机号');

			editData = {
				QUEUE_PHONE: phone,
				QUEUE_PLATE: plate,
				QUEUE_ACTION: data.action,
				QUEUE_ACTION_NAME: ACTIONS[data.action],
				QUEUE_CARGO_NAME: data.cargoName || '',
				QUEUE_REMARK: (data.remark || '').trim(),
			};
			if (data.payMode !== undefined && data.payMode !== null) {
				editData.QUEUE_PAY_MODE = Number(data.payMode) === 1 ? 1 : 0;
			}
			if (data.fees !== undefined && data.fees !== null) {
				let fees = this._checkEstimateFees(data.fees);
				editData.QUEUE_FEES = fees;
				editData.QUEUE_FEE_TOTAL = this._sumFees(fees);
			}
		}

		let updated = await QueueModel.edit({
			_id: item._id,
			QUEUE_STATUS: item.QUEUE_STATUS
		}, editData);
		if (!updated) this.AppError('该记录状态已变化，请刷新后重试');

		return await this.detail(id);
	}

	async cancel(id, reason, operator = '管理员', isSuper = true) {
		let item = await QueueModel.getOne({
			_id: id,
			QUEUE_STATUS: ['in', BOARD_STATUS]
		});
		if (!item) this.AppError('仅可删除看板上的记录');
		if (!isSuper && Number(item.QUEUE_COMPANY) !== 1) this.AppError('仅可取消其他公司的排队记录');

		reason = (reason || '').trim();
		if (!reason) this.AppError('请输入取消原因');

		let updated = await QueueModel.edit({
			_id: item._id,
			QUEUE_STATUS: item.QUEUE_STATUS
		}, {
			QUEUE_STATUS: QueueModel.STATUS.CANCEL,
			QUEUE_CANCEL_TIME: timeUtil.time(),
			QUEUE_CANCEL_REASON: reason,
			QUEUE_CANCEL_OPERATOR: operator
		});
		if (!updated) this.AppError('该记录状态已变化，请刷新后重试');

		// 已开始执行的记录不再向司机推送取消通知（文案不适用）
		if (item.QUEUE_STATUS <= QueueModel.STATUS.CALLED) {
			await this._sendCancelNotice(item, reason);
		}
	}

	/** 获取可用叉车司机列表 */
	async getForkliftList() {
		let list = await UserModel.getAll({
			USER_ROLE: 'forklift',
			USER_STATUS: UserModel.STATUS.COMM
		}, 'USER_NAME', { USER_NAME: 'asc' }, 200);
		return (list || []).map(u => ({ _id: u._id, USER_NAME: u.USER_NAME }));
	}

	async _sendCancelNotice(item, reason) {
		if (!config.QUEUE_CANCEL_TEMPLATE_ID || !item.QUEUE_OPENID) return;

		await miniLib.sendMiniOnceTempMsg({
			touser: item.QUEUE_OPENID,
			template_id: config.QUEUE_CANCEL_TEMPLATE_ID,
			page: '/driver/home',
			data: {
				thing1: { value: miniLib.fmtThing('预约已取消，请重新预约') },
				thing2: { value: miniLib.fmtThing(reason) },
				thing3: { value: miniLib.fmtThing(item.QUEUE_PLATE || '') },
				thing4: { value: miniLib.fmtThing(item.QUEUE_LOT_NAME || '') },
			}
		}, 'queue_cancel');
	}

	async _makeQueueNo(now) {
		let day = timeUtil.timestamp2Time(now, 'Y-M-D');
		return await this.nextDayNo('QUEUE_NO', now, async () => {
			return await QueueModel.count({
				QUEUE_CHECKIN_TIME: ['>=', timeUtil.time2Timestamp(day + ' 00:00:00')]
			});
		});
	}

	/** 校验预估费用条目并转为标准结构（金额为 0 或留空的项不计入） */
	_checkEstimateFees(fees) {
		let list = Array.isArray(fees) ? fees : [];
		let clean = [];
		for (let f of list) {
			let amount = Number(f.amount);
			if (!Number.isFinite(amount) || amount <= 0) continue; // 0/空不计入
			let name = (f.name || '').trim();
			if (!name) this.AppError('费用名称不能为空');
			if (name.length > 20) this.AppError('费用名称过长');
			if (!Number.isInteger(amount)) this.AppError('费用金额需为整数（分）');
			clean.push({
				name,
				amount,
				type: QueueModel.FEE_TYPE.ESTIMATE
			});
		}
		return clean;
	}

	_sumFees(fees) {
		return (fees || []).reduce((sum, f) => sum + (Number(f.amount) || 0), 0);
	}

	_fmtMoney(amount) {
		return (Number(amount || 0) / 100).toFixed(2);
	}

	_formatQueueItem(item, ahead = 0) {
		if (!item) return null;

		item.statusDesc = QueueModel.getDesc('STATUS', item.QUEUE_STATUS);
		item.ahead = ahead;
		item.company = Number(item.QUEUE_COMPANY) === 1 ? 1 : 0;
		item.companyDesc = QueueModel.getDesc('COMPANY', item.company);
		item.checkinTimeText = item.QUEUE_CHECKIN_TIME ? timeUtil.timestamp2Time(item.QUEUE_CHECKIN_TIME) : '';
		item.callTimeText = item.QUEUE_CALL_TIME ? timeUtil.timestamp2Time(item.QUEUE_CALL_TIME) : '';
		item.confirmTimeText = item.QUEUE_CONFIRM_TIME ? timeUtil.timestamp2Time(item.QUEUE_CONFIRM_TIME) : '';
		item.finishTimeText = item.QUEUE_FINISH_TIME ? timeUtil.timestamp2Time(item.QUEUE_FINISH_TIME) : '';
		item.settleTimeText = item.QUEUE_SETTLE_TIME ? timeUtil.timestamp2Time(item.QUEUE_SETTLE_TIME) : '';
		item.payTimeText = item.QUEUE_PAY_TIME ? timeUtil.timestamp2Time(item.QUEUE_PAY_TIME) : '';
		item.doneTimeText = item.QUEUE_DONE_TIME ? timeUtil.timestamp2Time(item.QUEUE_DONE_TIME) : '';
		item.cancelTimeText = item.QUEUE_CANCEL_TIME ? timeUtil.timestamp2Time(item.QUEUE_CANCEL_TIME) : '';
		item.addTimeText = item.QUEUE_ADD_TIME ? timeUtil.timestamp2Time(item.QUEUE_ADD_TIME) : '';

		// 叉车信息
		item.driverConfirmed = item.QUEUE_DRIVER_CONFIRMED === 1;
		item.forkliftName = item.QUEUE_FORKLIFT_NAME || '';
		item.grabTypeDesc = item.QUEUE_FORKLIFT_ID ? QueueModel.getDesc('GRAB_TYPE', item.QUEUE_FORKLIFT_GRAB_TYPE) : '';

		// 费用明细
		item.fees = (item.QUEUE_FEES || []).map(f => {
			return {
				name: f.name || '',
				amount: Number(f.amount) || 0,
				amountText: this._fmtMoney(f.amount),
				type: f.type,
				typeDesc: QueueModel.getDesc('FEE_TYPE', f.type),
			};
		});
		item.feeTotal = Number(item.QUEUE_FEE_TOTAL) || this._sumFees(item.QUEUE_FEES);
		item.feeTotalText = this._fmtMoney(item.feeTotal);
		item.payStatusDesc = QueueModel.getDesc('PAY_STATUS', item.QUEUE_PAY_STATUS);

		// 支付方式
		item.payMode = Number(item.QUEUE_PAY_MODE);
		item.payModeDesc = QueueModel.getDesc('PAY_MODE', item.payMode);

		return item;
	}

	_getHistoryTime(item) {
		return item.QUEUE_DONE_TIME || item.QUEUE_FINISH_TIME || item.QUEUE_CANCEL_TIME || item.QUEUE_EDIT_TIME || item.QUEUE_ADD_TIME || 0;
	}

	_getMonthRange(yearMonth) {
		let parts = (yearMonth || '').split('-');
		let year = Number(parts[0]);
		let month = Number(parts[1]);
		if (!year || !month) this.AppError('月份格式错误');

		let nextYear = month === 12 ? year + 1 : year;
		let nextMonth = month === 12 ? '01' : String(month + 1).padStart(2, '0');

		return {
			start: timeUtil.time2Timestamp(yearMonth + '-01 00:00:00'),
			end: timeUtil.time2Timestamp(nextYear + '-' + nextMonth + '-01 00:00:00')
		};
	}
}

module.exports = QueueService;
