/**
 * Notes: 装卸排队记录实体
 */

const BaseModel = require('./base_model.js');

class QueueModel extends BaseModel {}

QueueModel.CL = 'ax_queue';

QueueModel.DB_STRUCTURE = {
	_pid: 'string|true',
	QUEUE_ID: 'string|true',

	QUEUE_USER_ID: 'string|true|comment=司机用户记录ID(待认领时为空串)',
	QUEUE_OPENID: 'string|true|comment=司机微信openid(待认领时为空串)',
	QUEUE_PHONE: 'string|false|comment=司机手机号',
	QUEUE_PLATE: 'string|false|comment=车牌号',

	QUEUE_LOT_ID: 'string|true|comment=停车场ID',
	QUEUE_LOT_NAME: 'string|true|comment=停车场名称',
	QUEUE_ACTION: 'string|true|comment=业务类型 load=装货,unload=卸货',
	QUEUE_ACTION_NAME: 'string|true|comment=业务类型名称',
	QUEUE_PROOF: 'string|false|comment=预约单证图片fileID',
	QUEUE_CARGO_NAME: 'string|false|comment=货物名称',
	QUEUE_REMARK: 'string|false|comment=备注(客户文本信息)',
	QUEUE_CREATE_TYPE: 'int|true|default=0|comment=创建方式 0=管理员创建,1=司机自助(预留)',

	QUEUE_FEES: 'array|false|comment=费用条目[{name,amount,type}] amount单位分 type 0=预估,1=现场',
	QUEUE_FEE_TOTAL: 'int|true|default=0|comment=总费用(分)，服务端重算',

	QUEUE_FORKLIFT_ID: 'string|false|comment=叉车司机用户ID(抢单或派单，空串=未接单)',
	QUEUE_FORKLIFT_NAME: 'string|false|comment=叉车司机姓名',
	QUEUE_FORKLIFT_GRAB_TIME: 'int|true|default=0|comment=叉车接单时间',
	QUEUE_FORKLIFT_GRAB_TYPE: 'int|true|default=0|comment=叉车接单方式 0=抢单,1=管理员派单',
	QUEUE_DRIVER_CONFIRMED: 'int|true|default=0|comment=司机是否已确认收到叫号 0=未确认,1=已确认',

	QUEUE_NO: 'string|false|comment=排队号',
	QUEUE_STATUS: 'int|true|default=0|comment=状态 0=待认领,1=已预约,2=排队中,3=已叫号,4=执行中,5=待结算,6=待支付,9=已完成,10=已取消',
	QUEUE_SUBSCRIBE: 'int|true|default=0|comment=是否点击订阅叫号通知',

	QUEUE_CHECKIN_LAT: 'float|false|comment=签到纬度',
	QUEUE_CHECKIN_LNG: 'float|false|comment=签到经度',
	QUEUE_CHECKIN_TIME: 'int|true|default=0|comment=签到时间',
	QUEUE_CALL_TIME: 'int|true|default=0|comment=叫号时间',
	QUEUE_CONFIRM_TIME: 'int|true|default=0|comment=进入执行中时间',
	QUEUE_FINISH_PROOF: 'string|false|comment=完成现场照片fileID',
	QUEUE_FINISH_BILL_PROOF: 'string|false|comment=完成单据照片fileID',
	QUEUE_FINISH_TIME: 'int|true|default=0|comment=作业完成时间',

	QUEUE_PAY_STATUS: 'int|true|default=0|comment=支付状态 0=未支付,1=已支付,2=免支付',
	QUEUE_PAY_OUT_TRADE_NO: 'string|false|comment=商户订单号',
	QUEUE_PAY_TRANSACTION_ID: 'string|false|comment=微信支付单号',
	QUEUE_PAY_TIME: 'int|true|default=0|comment=支付成功时间',
	QUEUE_PAY_AMOUNT: 'int|true|default=0|comment=实付金额(分)',
	QUEUE_SETTLE_TIME: 'int|true|default=0|comment=结算时间',
	QUEUE_SETTLE_OPERATOR: 'string|false|comment=结算操作人',
	QUEUE_DONE_TIME: 'int|true|default=0|comment=完成离场时间',

	QUEUE_CANCEL_TIME: 'int|true|default=0|comment=取消时间',
	QUEUE_CANCEL_REASON: 'string|false|comment=取消原因',
	QUEUE_CANCEL_OPERATOR: 'string|false|comment=取消操作人',

	QUEUE_ADD_TIME: 'int|true',
	QUEUE_EDIT_TIME: 'int|true',
	QUEUE_ADD_IP: 'string|false',
	QUEUE_EDIT_IP: 'string|false',
};

QueueModel.FIELD_PREFIX = 'QUEUE_';

QueueModel.STATUS = {
	CLAIM_PENDING: 0,
	BOOKED: 1,
	WAITING: 2,
	CALLED: 3,
	EXECUTING: 4,
	FINISHED: 5,
	TO_PAY: 6,
	DONE: 9,
	CANCEL: 10
};

QueueModel.STATUS_DESC = {
	CLAIM_PENDING: '待认领',
	BOOKED: '已预约',
	WAITING: '排队中',
	CALLED: '已叫号',
	EXECUTING: '执行中',
	FINISHED: '待结算',
	TO_PAY: '待支付',
	DONE: '已完成',
	CANCEL: '已取消'
};

/** 费用条目类型 */
QueueModel.FEE_TYPE = {
	ESTIMATE: 0,
	SCENE: 1
};

QueueModel.FEE_TYPE_DESC = {
	ESTIMATE: '预估',
	SCENE: '现场'
};

/** 支付状态 */
QueueModel.PAY_STATUS = {
	UNPAID: 0,
	PAID: 1,
	FREE: 2
};

QueueModel.PAY_STATUS_DESC = {
	UNPAID: '未支付',
	PAID: '已支付',
	FREE: '免支付'
};

/** 叉车接单方式 */
QueueModel.GRAB_TYPE = {
	GRAB: 0,
	ASSIGN: 1
};

QueueModel.GRAB_TYPE_DESC = {
	GRAB: '抢单',
	ASSIGN: '派单'
};

module.exports = QueueModel;
