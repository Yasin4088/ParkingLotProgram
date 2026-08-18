/**
 * Notes: 存取柜业务（司机端登记 + 按天计费 + 独立排队）
 */

const BaseService = require('./base_service.js');
const StorageModel = require('../model/storage_model.js');
const CabinetModel = require('../model/cabinet_model.js');
const UserModel = require('../model/user_model.js');
const StorageMplateModel = require('../model/storage_mplate_model.js');
const WxPayLib = require('../lib/wxpay_lib.js');
const config = require('../../config/config.js');
const timeUtil = require('../../framework/utils/time_util.js');

const DAY_MS = 24 * 60 * 60 * 1000;

class StorageService extends BaseService {

	/** 司机端选项：启用柜型列表 + 在线支付开关 */
	async getOptions() {
		let cabinets = await CabinetModel.getAll({
			CABINET_STATUS: CabinetModel.STATUS.OPEN
		}, '*', { CABINET_ORDER: 'asc', CABINET_ADD_TIME: 'asc' }, 50);

		return {
			cabinets: (cabinets || []).map(c => ({
				_id: c._id,
				name: c.CABINET_NAME,
				priceDaily: Number(c.CABINET_PRICE_DAILY) || 0,
				priceDailyText: this._fmtMoney(c.CABINET_PRICE_DAILY),
			})),
			wxpayEnable: !!config.WXPAY_ENABLE,
		};
	}

	/** 司机登记存柜（免费，自动记录时间，生成存柜码与排队号）；company 0=挚力(计费),1=其他(不计费不留历史) */
	async registerStore(userId, openId, phone, plate, cabinetId, cabinetNo, doorProof, company) {
		plate = (plate || '').trim().toUpperCase();
		if (plate.length < 3) this.AppError('请输入车牌号');
		phone = (phone || '').trim();
		if (!phone) this.AppError('请输入手机号');
		cabinetNo = (cabinetNo || '').trim();
		if (!cabinetNo) this.AppError('请输入柜号');
		doorProof = (doorProof || '').trim();
		if (!doorProof) this.AppError('请上传柜门照片');

		let cabinet = await CabinetModel.getOne({
			_id: cabinetId,
			CABINET_STATUS: CabinetModel.STATUS.OPEN
		}, 'CABINET_NAME,CABINET_PRICE_DAILY');
		if (!cabinet) this.AppError('柜型不存在或已停用');

		// 同柜号处于存柜阶段的记录不可重复登记
		let dup = await StorageModel.getOne({
			STORAGE_CABINET_NO: cabinetNo,
			STORAGE_STATUS: ['in', StorageModel.CODE_ACTIVE]
		}, 'STORAGE_ID');
		if (dup) this.AppError('该柜号正在使用中，暂不可重复登记');

		let now = timeUtil.time();
		let code = await this._makeStorageCode();
		let queueNo = await StorageService.makeStorageNo(now);

		let ret = await StorageModel.insert({
			STORAGE_CODE: code,
			STORAGE_NO: queueNo,
			STORAGE_COMPANY: Number(company) === 1 ? 1 : 0,
			STORAGE_STATUS: StorageModel.STATUS.STORE_WAITING,
			STORAGE_USER_ID: userId,
			STORAGE_OPENID: openId,
			STORAGE_PHONE: phone,
			STORAGE_PLATE: plate,
			STORAGE_CABINET_ID: cabinetId,
			STORAGE_CABINET_NAME: cabinet.CABINET_NAME,
			STORAGE_CABINET_NO: cabinetNo,
			STORAGE_CABINET_DOOR_PROOF: doorProof,
			STORAGE_PRICE_DAILY: Number(cabinet.CABINET_PRICE_DAILY) || 0,
			STORAGE_QUEUE_TIME: now,
			STORAGE_FORKLIFT_ID: '',
			STORAGE_FORKLIFT_NAME: '',
			STORAGE_PAY_MODE: 0,
			STORAGE_PAY_STATUS: StorageModel.PAY_STATUS.FREE,
			STORAGE_PAY_OUT_TRADE_NO: '',
		});

		// 自动叫号：开关开启时登记完成即可能被叫号，被叫中则刷新状态再返回
		let autoCalledId = await this.autoCallCheck();
		if (autoCalledId === ret._id) {
			ret = await StorageModel.getOne({ _id: ret._id });
		}

		return this._formatStorageItem(ret);
	}

	/** 取柜费用预览（按存柜码查询，不落库；其他公司单不计费；附月付车牌提示，不锁定池内车牌） */
	async fetchCalc(code, plate) {
		let item = await this._getByCode(code);
		let noCharge = Number(item.STORAGE_COMPANY) === 1;
		if (noCharge) {
			return {
				_id: item._id,
				code: item.STORAGE_CODE,
				cabinetName: item.STORAGE_CABINET_NAME,
				cabinetNo: item.STORAGE_CABINET_NO,
				plate: item.STORAGE_PLATE,
				finishTimeText: item.STORAGE_FINISH_TIME ? timeUtil.timestamp2Time(item.STORAGE_FINISH_TIME) : '',
				priceDailyText: '0.00',
				days: 0,
				feeTotal: 0,
				feeTotalText: '0.00',
				noCharge: true,
				monthly: false,
			};
		}

		let fee = await this._calcFee(item);
		let monthly = await this.checkMonthlyPlate(plate);
		return {
			_id: item._id,
			code: item.STORAGE_CODE,
			cabinetName: item.STORAGE_CABINET_NAME,
			cabinetNo: item.STORAGE_CABINET_NO,
			plate: item.STORAGE_PLATE,
			finishTimeText: item.STORAGE_FINISH_TIME ? timeUtil.timestamp2Time(item.STORAGE_FINISH_TIME) : '',
			priceDailyText: this._fmtMoney(fee.priceDaily),
			days: fee.days,
			feeTotal: fee.feeTotal,
			feeTotalText: this._fmtMoney(fee.feeTotal),
			noCharge: false,
			monthly: monthly,
		};
	}

	/** 司机登记取柜（挚力单：服务端重算费用并锁定，月付/到付照常；其他公司单：不计费不付款直接入队） */
	async registerFetch(userId, openId, phone, code, payMode, fetchPlate) {
		phone = (phone || '').trim();
		if (!phone) this.AppError('请输入手机号');
		fetchPlate = (fetchPlate || '').trim().toUpperCase();

		let item = await this._getByCode(code);
		let now = timeUtil.time();
		let isOther = Number(item.STORAGE_COMPANY) === 1;

		// 其他公司单：不计费不付款，直接进入取柜排队（跳过费用计算/月付识别/在线现场支付）
		if (isOther) {
			let queueNo = await StorageService.makeStorageNo(now);
			let updated = await StorageModel.edit({
				_id: item._id,
				STORAGE_STATUS: StorageModel.STATUS.STORED
			}, {
				STORAGE_STATUS: StorageModel.STATUS.FETCH_WAITING,
				STORAGE_FETCH_USER_ID: userId,
				STORAGE_FETCH_OPENID: openId,
				STORAGE_FETCH_PHONE: phone,
				STORAGE_FETCH_PLATE: fetchPlate,
				STORAGE_FETCH_TIME: now,
				STORAGE_DAYS: 0,
				STORAGE_FEE_TOTAL: 0,
				STORAGE_PAY_MODE: StorageModel.PAY_MODE.ONSITE,
				STORAGE_PAY_STATUS: StorageModel.PAY_STATUS.NO_CHARGE,
				STORAGE_NO: queueNo,
				STORAGE_QUEUE_TIME: now,
			});
			if (!updated) this.AppError('该柜已被取走或状态已变更');

			await this.autoCallCheck();

			return {
				_id: item._id,
				code: item.STORAGE_CODE,
				cabinetName: item.STORAGE_CABINET_NAME,
				cabinetNo: item.STORAGE_CABINET_NO,
				plate: item.STORAGE_PLATE,
				fetchPlate: fetchPlate,
				days: 0,
				feeTotal: 0,
				feeTotalText: '0.00',
				payMode: 0,
				monthly: false,
				noCharge: true,
				customerName: '',
			};
		}

		let fee = await this._calcFee(item);
		let mode = Number(payMode) === 1 ? 1 : 0;

		// 月付识别：取柜车牌命中月付池则锁定该车牌条目（池内每条单次有效；并发重复登记仅一方成功）
		let mplate = null;
		if (fetchPlate) mplate = await this._claimMonthlyPlate(fetchPlate, item._id);

		let baseData = {
			STORAGE_FETCH_USER_ID: userId,
			STORAGE_FETCH_OPENID: openId,
			STORAGE_FETCH_PHONE: phone,
			STORAGE_FETCH_PLATE: fetchPlate,
			STORAGE_FETCH_TIME: now,
			STORAGE_DAYS: fee.days,
			STORAGE_FEE_TOTAL: fee.feeTotal,
			STORAGE_PRICE_DAILY: fee.priceDaily,
		};

		if (mplate) {
			// 月付单：免现场缴费，直接进入取柜排队（缴费确认/在线支付环节整体跳过）
			let queueNo = await StorageService.makeStorageNo(now);
			baseData.STORAGE_STATUS = StorageModel.STATUS.FETCH_WAITING;
			baseData.STORAGE_PAY_MODE = StorageModel.PAY_MODE.ONSITE;
			baseData.STORAGE_PAY_STATUS = StorageModel.PAY_STATUS.MONTHLY;
			baseData.STORAGE_NO = queueNo;
			baseData.STORAGE_QUEUE_TIME = now;
			baseData.STORAGE_MONTHLY = 1;
			baseData.STORAGE_MONTHLY_PLATE_ID = mplate._id;
			baseData.STORAGE_MONTHLY_CUSTOMER_ID = mplate.MPLATE_CUSTOMER_ID;
			baseData.STORAGE_MONTHLY_CUSTOMER_NAME = mplate.MPLATE_CUSTOMER_NAME || '';
			baseData.STORAGE_MONTHLY_MATCH_TIME = now;
		} else {
			// 到付：锁定费用进入待缴费（现场/在线支付，原逻辑不变）
			baseData.STORAGE_STATUS = StorageModel.STATUS.FETCH_TO_PAY;
			baseData.STORAGE_PAY_MODE = mode;
			baseData.STORAGE_PAY_STATUS = StorageModel.PAY_STATUS.UNPAID;
			baseData.STORAGE_PAY_OUT_TRADE_NO = '';
			baseData.STORAGE_MONTHLY = 0;
		}

		let updated = await StorageModel.edit({
			_id: item._id,
			STORAGE_STATUS: StorageModel.STATUS.STORED
		}, baseData);
		if (!updated) {
			// 条件更新失败（并发/已被取走）：若已锁定月付车牌则释放回池，避免浪费客户额度
			if (mplate) await this.releaseMplate(mplate._id);
			this.AppError('该柜已被取走或状态已变更');
		}

		// 月付单入队后立即尝试自动叫号（开关开启时）
		await this.autoCallCheck();

		// 仅返回取柜单据最小信息，不附带存柜人注册信息（身份证/三证照等 PII 不下发）
		return {
			_id: item._id,
			code: item.STORAGE_CODE,
			cabinetName: item.STORAGE_CABINET_NAME,
			cabinetNo: item.STORAGE_CABINET_NO,
			plate: item.STORAGE_PLATE,
			fetchPlate: fetchPlate,
			days: fee.days,
			feeTotal: fee.feeTotal,
			feeTotalText: this._fmtMoney(fee.feeTotal),
			payMode: mplate ? 0 : mode,
			monthly: !!mplate,
			noCharge: false,
			customerName: mplate ? (mplate.MPLATE_CUSTOMER_NAME || '') : '',
		};
	}

	/** 在线支付下单：返回 payParams 供 wx.requestPayment 调起；查单兜底发现已支付时返回 {paid:true} */
	async pay(userId, id) {
		if (!config.WXPAY_ENABLE) this.AppError('在线支付暂未开通，请现场缴费');

		let item = await StorageModel.getOne({
			_id: id,
			STORAGE_STATUS: StorageModel.STATUS.FETCH_TO_PAY,
			STORAGE_FETCH_USER_ID: userId
		});
		if (!item) this.AppError('未找到待缴费的取柜记录');
		if (Number(item.STORAGE_FEE_TOTAL) <= 0) this.AppError('该记录无需缴费');
		if (!item.STORAGE_FETCH_OPENID) this.AppError('缺少支付用户信息，无法在线支付');
		if (!config.WXPAY_NOTIFY_URL) this.AppError('支付回调地址未配置');

		// 已有未完成订单先查单兜底（回调可能延迟/丢失，官方 4012791861 建议结合查单使用）
		if (item.STORAGE_PAY_OUT_TRADE_NO) {
			let order = await this._queryWxOrder(item.STORAGE_PAY_OUT_TRADE_NO);
			if (order && order.trade_state === 'SUCCESS') {
				await this._confirmPaid(item._id, order);
				return { paid: true, id: item._id };
			}
			// NOTPAY/CLOSED：换新订单号重新下单
		}

		// 生成并保存商户订单号；条件更新把旧订单号（含空串）纳入 where，
		// 并发重复下单时仅先到者成功，避免两笔订单同时有效导致支付后不入队
		let outTradeNo = WxPayLib.genOutTradeNo(item._id);
		let updated = await StorageModel.edit({
			_id: item._id,
			STORAGE_STATUS: StorageModel.STATUS.FETCH_TO_PAY,
			STORAGE_PAY_STATUS: StorageModel.PAY_STATUS.UNPAID,
			STORAGE_PAY_OUT_TRADE_NO: item.STORAGE_PAY_OUT_TRADE_NO || ''
		}, {
			STORAGE_PAY_OUT_TRADE_NO: outTradeNo
		});
		if (!updated) {
			if (!item.STORAGE_PAY_OUT_TRADE_NO) {
				// 历史数据兜底：老记录缺少订单号字段时条件匹配不到，补写一次并收敛到库内最新值
				await StorageModel.edit({
					_id: item._id,
					STORAGE_STATUS: StorageModel.STATUS.FETCH_TO_PAY,
					STORAGE_PAY_STATUS: StorageModel.PAY_STATUS.UNPAID
				}, {
					STORAGE_PAY_OUT_TRADE_NO: outTradeNo
				});
				let fresh = await StorageModel.getOne({ _id: item._id }, 'STORAGE_PAY_OUT_TRADE_NO');
				outTradeNo = fresh.STORAGE_PAY_OUT_TRADE_NO || outTradeNo;
			} else {
				// 并发下单被抢先：以库内最新订单号查单兜底，已支付直接入队
				let fresh = await StorageModel.getOne({ _id: item._id }, 'STORAGE_PAY_OUT_TRADE_NO');
				let existNo = fresh && fresh.STORAGE_PAY_OUT_TRADE_NO;
				if (existNo) {
					let existOrder = await this._queryWxOrder(existNo);
					if (existOrder && existOrder.trade_state === 'SUCCESS') {
						await this._confirmPaid(item._id, existOrder);
						return { paid: true, id: item._id };
					}
				}
				this.AppError('订单处理中，请稍后重试');
			}
		}

		try {
			let prepay = await WxPayLib.jsapiPrepay({
				outTradeNo,
				description: '存取柜取柜费用-' + item.STORAGE_CABINET_NAME + item.STORAGE_CABINET_NO,
				amountTotal: Number(item.STORAGE_FEE_TOTAL),
				payerOpenid: item.STORAGE_FETCH_OPENID,
				notifyUrl: config.WXPAY_NOTIFY_URL,
			});
			return {
				payParams: WxPayLib.buildPayParams(prepay.prepay_id),
				id: item._id
			};
		} catch (e) {
			// 订单号被占用（重试/并发）：查单兜底，已支付直接入队
			if (e && e.wxCode === 'OUT_TRADE_NO_USED') {
				let order = await this._queryWxOrder(outTradeNo);
				if (order && order.trade_state === 'SUCCESS') {
					await this._confirmPaid(item._id, order);
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

	/** 支付成功落库：条件更新 4→5 + 生成排队号（与 payNotify 回调逻辑一致，可并发幂等） */
	async _confirmPaid(id, order) {
		let item = await StorageModel.getOne({ _id: id }, 'STORAGE_FEE_TOTAL');
		if (!item) this.AppError('未找到存取柜记录');
		if (Number(order.amount && order.amount.total) !== Number(item.STORAGE_FEE_TOTAL))
			this.AppError('支付金额与费用不符，请联系管理员');

		let now = timeUtil.time();
		let payTime = order.success_time ? new Date(order.success_time).getTime() : now;
		let queueNo = await StorageService.makeStorageNo(now);

		let updated = await StorageModel.edit({
			_id: id,
			STORAGE_STATUS: StorageModel.STATUS.FETCH_TO_PAY,
			STORAGE_PAY_OUT_TRADE_NO: order.out_trade_no
		}, {
			STORAGE_STATUS: StorageModel.STATUS.FETCH_WAITING,
			STORAGE_PAY_STATUS: StorageModel.PAY_STATUS.PAID,
			STORAGE_PAY_TIME: payTime,
			STORAGE_PAY_AMOUNT: Number(order.amount && order.amount.total) || 0,
			STORAGE_PAY_TRANSACTION_ID: order.transaction_id || '',
			STORAGE_NO: queueNo,
			STORAGE_QUEUE_TIME: now,
		});
		if (!updated) {
			// 回调已处理过（幂等）或状态已被管理员变更
			let fresh = await StorageModel.getOne({ _id: id }, 'STORAGE_STATUS');
			if (fresh && fresh.STORAGE_STATUS === StorageModel.STATUS.FETCH_WAITING) return true;
			this.AppError('该记录状态已变更，请刷新查看');
		}
		// 支付入队后立即尝试自动叫号（开关开启时）
		await this.autoCallCheck();
		return true;
	}

	/** 自动叫号：开关开启且无未接单的叫号时，自动叫排队最早的一条（存柜/取柜同一队列，最多保持 1 单待接单）
	 *  返回被叫记录的 _id（未叫号返回 null），供调用方决定是否需要刷新状态 */
	async autoCallCheck() {
		try {
			if (!(await this.getAutoCallFlag('SETUP_STORAGE_AUTO_CALL'))) return null;

			let calledCnt = await StorageModel.count({
				STORAGE_STATUS: ['in', [StorageModel.STATUS.STORE_CALLED, StorageModel.STATUS.FETCH_CALLED]],
				STORAGE_FORKLIFT_ID: ''
			});
			if (calledCnt > 0) return null;

			// 存柜待叫号与取柜待叫号按排队时间取全局最早的一条
			let storeWait = await StorageModel.getAll({
				STORAGE_STATUS: StorageModel.STATUS.STORE_WAITING
			}, 'STORAGE_STATUS,STORAGE_QUEUE_TIME', { STORAGE_QUEUE_TIME: 'asc' }, 1);
			let fetchWait = await StorageModel.getAll({
				STORAGE_STATUS: StorageModel.STATUS.FETCH_WAITING
			}, 'STORAGE_STATUS,STORAGE_QUEUE_TIME', { STORAGE_QUEUE_TIME: 'asc' }, 1);

			let storeTop = (storeWait || [])[0];
			let fetchTop = (fetchWait || [])[0];
			let target = null;
			if (storeTop && fetchTop) {
				target = storeTop.STORAGE_QUEUE_TIME <= fetchTop.STORAGE_QUEUE_TIME ? storeTop : fetchTop;
			} else {
				target = storeTop || fetchTop;
			}
			if (!target) return null;

			let newStatus = target.STORAGE_STATUS === StorageModel.STATUS.STORE_WAITING
				? StorageModel.STATUS.STORE_CALLED
				: StorageModel.STATUS.FETCH_CALLED;

			// 条件更新：并发/多触发点同时执行时仅一方成功
			let updated = await StorageModel.edit({
				_id: target._id,
				STORAGE_STATUS: target.STORAGE_STATUS
			}, {
				STORAGE_STATUS: newStatus,
				STORAGE_CALL_TIME: timeUtil.time(),
			});
			return updated ? target._id : null;
		} catch (e) {
			// 自动叫号为后台增强，失败不影响主流程（登记/支付/看板刷新）
			console.error('自动叫号执行失败', e);
			return null;
		}
	}

	/** 司机我的存柜（存柜单 + 取柜单；存柜人记录保留到取出为止） */
	async myCurrent(userId) {
		// 存柜人：覆盖 0-7 看板全阶段，取出/取消后才从列表消失
		let storeList = await StorageModel.getAll({
			STORAGE_USER_ID: userId,
			STORAGE_STATUS: ['in', StorageModel.BOARD_STATUS]
		}, '*', { STORAGE_ADD_TIME: 'desc' }, 50);

		let fetchList = await StorageModel.getAll({
			STORAGE_FETCH_USER_ID: userId,
			STORAGE_STATUS: ['in', StorageModel.FETCH_ACTIVE]
		}, '*', { STORAGE_FETCH_TIME: 'desc' }, 50);

		// 排队位次：有 WAITING 记录时各取一次排队列表，内存计算 ahead，避免每条记录一次 count（N+1）
		let hasStoreWait = (storeList || []).some(x => x.STORAGE_STATUS === StorageModel.STATUS.STORE_WAITING);
		let hasFetchWait = (fetchList || []).some(x => x.STORAGE_STATUS === StorageModel.STATUS.FETCH_WAITING);
		let waitStore = hasStoreWait ? await StorageModel.getAll({
			STORAGE_STATUS: StorageModel.STATUS.STORE_WAITING
		}, 'STORAGE_QUEUE_TIME', { STORAGE_QUEUE_TIME: 'asc' }, 500) : [];
		let waitFetch = hasFetchWait ? await StorageModel.getAll({
			STORAGE_STATUS: StorageModel.STATUS.FETCH_WAITING
		}, 'STORAGE_QUEUE_TIME', { STORAGE_QUEUE_TIME: 'asc' }, 500) : [];
		let aheadStore = ts => (waitStore || []).filter(x => x.STORAGE_QUEUE_TIME < ts).length;
		let aheadFetch = ts => (waitFetch || []).filter(x => x.STORAGE_QUEUE_TIME < ts).length;

		let list = [];
		let seen = {};
		for (let item of (storeList || [])) {
			seen[item._id] = true;
			let ahead = item.STORAGE_STATUS === StorageModel.STATUS.STORE_WAITING
				? aheadStore(item.STORAGE_QUEUE_TIME) : 0;
			list.push(this._formatStorageItem(item, ahead));
		}
		for (let item of (fetchList || [])) {
			if (seen[item._id]) continue; // 同一单既是存柜人又是取柜人时去重
			let ahead = item.STORAGE_STATUS === StorageModel.STATUS.FETCH_WAITING
				? aheadFetch(item.STORAGE_QUEUE_TIME) : 0;
			list.push(this._formatStorageItem(item, ahead));
		}
		list.sort((a, b) => (b.STORAGE_ADD_TIME - a.STORAGE_ADD_TIME));

		let ret = { list, lastDone: null };
		if (!list.length) {
			// 无进行中记录时，附带最近一条历史记录（只读展示）
			let last1 = await StorageModel.getOne({
				STORAGE_USER_ID: userId,
				STORAGE_STATUS: ['in', [StorageModel.STATUS.FETCHED, StorageModel.STATUS.CANCEL]]
			}, '*', { STORAGE_ADD_TIME: 'desc' });
			let last2 = await StorageModel.getOne({
				STORAGE_FETCH_USER_ID: userId,
				STORAGE_STATUS: ['in', [StorageModel.STATUS.FETCHED, StorageModel.STATUS.CANCEL]]
			}, '*', { STORAGE_ADD_TIME: 'desc' });
			let last = (last1 && last2) ? (last1.STORAGE_ADD_TIME >= last2.STORAGE_ADD_TIME ? last1 : last2) : (last1 || last2);
			ret.lastDone = last ? this._formatStorageItem(last) : null;
		}

		// 剥离内部字段（用户 _id/吊柜 _id/照片/支付订单号等不可下发，防止伪造身份）
		let stripAll = [].concat(ret.list || [], ret.lastDone || []);
		for (let obj of stripAll) {
			if (!obj) continue;
			delete obj.STORAGE_USER_ID;
			delete obj.STORAGE_OPENID;
			delete obj.STORAGE_FETCH_USER_ID;
			delete obj.STORAGE_FETCH_OPENID;
			delete obj.STORAGE_FORKLIFT_ID;
			delete obj.STORAGE_CABINET_DOOR_PROOF;
			delete obj.STORAGE_EXEC_PROOF;
			delete obj.STORAGE_FETCH_PROOF;
			delete obj.STORAGE_PAY_OUT_TRADE_NO;
			delete obj.STORAGE_PAY_TRANSACTION_ID;
			delete obj.STORAGE_PAY_AMOUNT;
			delete obj.STORAGE_MONTHLY_PLATE_ID;
			delete obj.STORAGE_MONTHLY_CUSTOMER_ID;
		}

		return ret;
	}

	/** 详情（管理员/司机共用，附存柜人注册信息） */
	async detail(id) {
		let item = await StorageModel.getOne({ _id: id });
		if (!item) this.AppError('未找到存取柜记录');
		let ret = this._formatStorageItem(item);

		// 附存柜登记司机注册信息（管理员详情可见；列表不 join 避免 N+1）
		if (item.STORAGE_USER_ID) {
			let user = await UserModel.getOne({ _id: item.STORAGE_USER_ID }, 'USER_NAME,USER_IDCARD,USER_LICENSE_PLATE,USER_MOBILE,USER_DRIVER_LICENSE_IMG,USER_VEHICLE_REG_IMG,USER_IDCARD_IMG');
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
		if (item.STORAGE_FETCH_USER_ID) {
			let user = await UserModel.getOne({ _id: item.STORAGE_FETCH_USER_ID }, 'USER_NAME,USER_MOBILE');
			if (user) {
				ret.fetchUserInfo = {
					name: user.USER_NAME || '',
					mobile: user.USER_MOBILE || '',
				};
			}
		}

		return ret;
	}

	/** 按存柜码查已存柜记录（仅状态3可被取柜登记） */
	async _getByCode(code) {
		let item = await StorageModel.getOne({
			STORAGE_CODE: code,
			STORAGE_STATUS: StorageModel.STATUS.STORED
		});
		if (!item) this.AppError('存柜码不存在或该柜已取出');
		return item;
	}

	// ========== 月付车牌池 ==========

	/** 校验车牌是否命中月付池有效条目（仅查询不锁定，供费用预览提示） */
	async checkMonthlyPlate(plate) {
		plate = (plate || '').trim().toUpperCase();
		if (!plate || plate.length < 3) return false;
		let entry = await StorageMplateModel.getOne({
			MPLATE_PLATE: plate,
			MPLATE_STATUS: StorageMplateModel.STATUS.ACTIVE
		}, 'MPLATE_ID');
		return !!entry;
	}

	/** 锁定一枚有效月付车牌（条件更新防并发双占；同车牌多条时逐条尝试，全部占用返回 null） */
	async _claimMonthlyPlate(plate, storageId) {
		plate = (plate || '').trim().toUpperCase();
		if (!plate || plate.length < 3) return null;

		let now = timeUtil.time();
		for (let i = 0; i < 5; i++) {
			let entry = await StorageMplateModel.getOne({
				MPLATE_PLATE: plate,
				MPLATE_STATUS: StorageMplateModel.STATUS.ACTIVE
			}, 'MPLATE_ID,MPLATE_CUSTOMER_ID,MPLATE_CUSTOMER_NAME', { MPLATE_ADD_TIME: 'asc' });
			if (!entry) return null;

			let updated = await StorageMplateModel.edit({
				_id: entry._id,
				MPLATE_STATUS: StorageMplateModel.STATUS.ACTIVE
			}, {
				MPLATE_STATUS: StorageMplateModel.STATUS.CLAIMED,
				MPLATE_STORAGE_ID: storageId,
				MPLATE_CLAIM_TIME: now,
			});
			if (updated) return entry;
		}
		return null;
	}

	/** 月付柜被提走（取柜完成）后消去车牌：占用 → 已使用，从月付池消失 */
	async consumeMplate(plateId) {
		if (!plateId) return;
		await StorageMplateModel.edit({
			_id: plateId,
			MPLATE_STATUS: StorageMplateModel.STATUS.CLAIMED
		}, {
			MPLATE_STATUS: StorageMplateModel.STATUS.CONSUMED,
			MPLATE_CONSUME_TIME: timeUtil.time(),
		});
	}

	/** 月付单中途取消时释放车牌占用：占用 → 有效，归还月付池 */
	async releaseMplate(plateId) {
		if (!plateId) return;
		await StorageMplateModel.edit({
			_id: plateId,
			MPLATE_STATUS: StorageMplateModel.STATUS.CLAIMED
		}, {
			MPLATE_STATUS: StorageMplateModel.STATUS.ACTIVE,
			MPLATE_STORAGE_ID: '',
			MPLATE_CLAIM_TIME: 0,
		});
	}

	/** 服务端计算取柜费用：天数×每日单价（单价取柜型现行价） */
	async _calcFee(item) {
		let cabinet = await CabinetModel.getOne({ _id: item.STORAGE_CABINET_ID }, 'CABINET_PRICE_DAILY');
		let priceDaily = cabinet ? (Number(cabinet.CABINET_PRICE_DAILY) || 0) : (Number(item.STORAGE_PRICE_DAILY) || 0);

		// 计费起点=存柜完成时间（排队等待不计费）；脏数据回退登记时间
		let start = item.STORAGE_FINISH_TIME || item.STORAGE_ADD_TIME;
		let days = this._calcDays(start, timeUtil.time());

		return {
			priceDaily,
			days,
			feeTotal: days * priceDaily,
		};
	}

	/** 按天计费：不足1天按1天 */
	_calcDays(startTs, endTs) {
		return Math.max(1, Math.ceil((endTs - startTs) / DAY_MS));
	}

	/** 存柜码：6位数字随机，存柜阶段内查重，重试最多5次 */
	async _makeStorageCode() {
		for (let i = 0; i < 5; i++) {
			let code = String(Math.floor(100000 + Math.random() * 900000));
			let dup = await StorageModel.getOne({
				STORAGE_CODE: code,
				STORAGE_STATUS: ['in', StorageModel.CODE_ACTIVE]
			}, 'STORAGE_ID');
			if (!dup) return code;
		}
		this.AppError('存柜码生成失败，请重试');
	}

	/** 排队号：存取柜当天全局序号（存柜登记/取柜缴费确认各分配一次；事务计数器防并发撞号） */
	static async makeStorageNo(now) {
		let day = timeUtil.timestamp2Time(now, 'Y-M-D');
		return await new BaseService().nextDayNo('STORAGE_NO', now, async () => {
			return await StorageModel.count({
				STORAGE_QUEUE_TIME: ['>=', timeUtil.time2Timestamp(day + ' 00:00:00')]
			});
		});
	}

	_fmtMoney(amount) {
		return (Number(amount || 0) / 100).toFixed(2);
	}

	_formatStorageItem(item, ahead = 0) {
		if (!item) return null;

		item.statusDesc = StorageModel.getDesc('STATUS', item.STORAGE_STATUS);
		item.ahead = ahead;
		item.typeName = item.STORAGE_STATUS <= StorageModel.STATUS.STORED ? '存柜' : '取柜';
		item.company = Number(item.STORAGE_COMPANY) === 1 ? 1 : 0;
		item.companyDesc = StorageModel.getDesc('COMPANY', item.company);
		item.noCharge = item.company === 1;
		item.addTimeText = item.STORAGE_ADD_TIME ? timeUtil.timestamp2Time(item.STORAGE_ADD_TIME) : '';
		item.queueTimeText = item.STORAGE_QUEUE_TIME ? timeUtil.timestamp2Time(item.STORAGE_QUEUE_TIME) : '';
		item.callTimeText = item.STORAGE_CALL_TIME ? timeUtil.timestamp2Time(item.STORAGE_CALL_TIME) : '';
		item.grabTimeText = item.STORAGE_FORKLIFT_GRAB_TIME ? timeUtil.timestamp2Time(item.STORAGE_FORKLIFT_GRAB_TIME) : '';
		item.finishTimeText = item.STORAGE_FINISH_TIME ? timeUtil.timestamp2Time(item.STORAGE_FINISH_TIME) : '';
		item.fetchTimeText = item.STORAGE_FETCH_TIME ? timeUtil.timestamp2Time(item.STORAGE_FETCH_TIME) : '';
		item.fetchDoneTimeText = item.STORAGE_FETCH_DONE_TIME ? timeUtil.timestamp2Time(item.STORAGE_FETCH_DONE_TIME) : '';
		item.payTimeText = item.STORAGE_PAY_TIME ? timeUtil.timestamp2Time(item.STORAGE_PAY_TIME) : '';
		item.payConfirmTimeText = item.STORAGE_PAY_CONFIRM_TIME ? timeUtil.timestamp2Time(item.STORAGE_PAY_CONFIRM_TIME) : '';
		item.cancelTimeText = item.STORAGE_CANCEL_TIME ? timeUtil.timestamp2Time(item.STORAGE_CANCEL_TIME) : '';

		item.forkliftName = item.STORAGE_FORKLIFT_NAME || '';
		item.grabTypeDesc = item.STORAGE_FORKLIFT_ID ? StorageModel.getDesc('GRAB_TYPE', item.STORAGE_FORKLIFT_GRAB_TYPE) : '';
		item.feeTotal = Number(item.STORAGE_FEE_TOTAL) || 0;
		item.feeTotalText = this._fmtMoney(item.feeTotal);
		item.priceDailyText = this._fmtMoney(item.STORAGE_PRICE_DAILY);
		item.payStatusDesc = StorageModel.getDesc('PAY_STATUS', item.STORAGE_PAY_STATUS);
		item.payMode = Number(item.STORAGE_PAY_MODE) === 1 ? 1 : 0;
		item.payModeDesc = StorageModel.getDesc('PAY_MODE', item.payMode);

		return item;
	}

	_getHistoryTime(item) {
		return item.STORAGE_FETCH_DONE_TIME || item.STORAGE_CANCEL_TIME || item.STORAGE_EDIT_TIME || item.STORAGE_ADD_TIME || 0;
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

module.exports = StorageService;
