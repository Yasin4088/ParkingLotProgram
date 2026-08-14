/**
 * Notes: 存取柜记录实体
 */

const BaseModel = require('./base_model.js');

class StorageModel extends BaseModel {}

StorageModel.CL = 'ax_storage';

StorageModel.DB_STRUCTURE = {
	_pid: 'string|true',
	STORAGE_ID: 'string|true',

	STORAGE_CODE: 'string|true|comment=存柜码(6位数字,取柜凭证)',
	STORAGE_NO: 'string|false|comment=排队号(存柜登记时/取柜缴费确认时生成)',
	STORAGE_STATUS: 'int|true|default=0|comment=状态 0=待叫号(存柜),1=已叫号(存柜),2=存柜执行中,3=已存柜,4=取柜待缴费,5=取柜待叫号,6=已叫号(取柜),7=取柜执行中,8=已取柜,9=已取消',

	// 存柜登记
	STORAGE_USER_ID: 'string|true|comment=存柜登记司机用户ID',
	STORAGE_OPENID: 'string|true|comment=存柜登记司机openid',
	STORAGE_PHONE: 'string|false|comment=存柜登记手机号',
	STORAGE_PLATE: 'string|false|comment=车牌号',
	STORAGE_CABINET_ID: 'string|true|comment=柜型ID(关联ax_storage_cabinet)',
	STORAGE_CABINET_NAME: 'string|true|comment=柜型名称快照',
	STORAGE_CABINET_NO: 'string|true|comment=柜号',
	STORAGE_CABINET_DOOR_PROOF: 'string|true|comment=柜门照片fileID(存柜登记必传)',
	STORAGE_PRICE_DAILY: 'int|true|default=0|comment=每日单价快照(分)',
	STORAGE_QUEUE_TIME: 'int|true|default=0|comment=进入待叫号排队时间(排序/计数基准)',

	// 存柜执行
	STORAGE_FORKLIFT_ID: 'string|false|comment=吊柜司机用户ID(空=未接单)',
	STORAGE_FORKLIFT_NAME: 'string|false|comment=吊柜司机姓名',
	STORAGE_FORKLIFT_GRAB_TIME: 'int|true|default=0|comment=吊柜接单时间',
	STORAGE_FORKLIFT_GRAB_TYPE: 'int|true|default=0|comment=吊柜接单方式 0=抢单,1=管理员派单',
	STORAGE_CALL_TIME: 'int|true|default=0|comment=叫号时间',
	STORAGE_FINISH_TIME: 'int|true|default=0|comment=存柜完成时间(计费起点)',
	STORAGE_EXEC_PROOF: 'string|false|comment=存柜完成照片fileID',

	// 取柜登记
	STORAGE_FETCH_USER_ID: 'string|false|comment=取柜登记司机用户ID(可与存柜人不同)',
	STORAGE_FETCH_OPENID: 'string|false|comment=取柜登记司机openid',
	STORAGE_FETCH_PHONE: 'string|false|comment=取柜登记手机号',
	STORAGE_FETCH_TIME: 'int|true|default=0|comment=取柜登记时间',
	STORAGE_DAYS: 'int|true|default=0|comment=计费天数(不足1天按1天)',
	STORAGE_FEE_TOTAL: 'int|true|default=0|comment=取柜费用(分)，服务端重算',
	STORAGE_FETCH_DONE_TIME: 'int|true|default=0|comment=取柜完成时间',
	STORAGE_FETCH_PROOF: 'string|false|comment=取柜完成照片fileID',

	// 支付
	STORAGE_PAY_MODE: 'int|true|default=0|comment=支付方式 0=现场支付,1=小程序在线支付',
	STORAGE_PAY_STATUS: 'int|true|default=0|comment=支付状态 0=未支付,1=已支付(在线),2=免支付(存柜),3=已确认收款(现场)',
	STORAGE_PAY_OUT_TRADE_NO: 'string|false|comment=商户订单号',
	STORAGE_PAY_TRANSACTION_ID: 'string|false|comment=微信支付单号',
	STORAGE_PAY_TIME: 'int|true|default=0|comment=在线支付成功时间',
	STORAGE_PAY_AMOUNT: 'int|true|default=0|comment=实付金额(分)',
	STORAGE_PAY_CONFIRM_TIME: 'int|true|default=0|comment=管理员确认收款时间',
	STORAGE_PAY_CONFIRM_OPERATOR: 'string|false|comment=确认收款操作人',

	STORAGE_CANCEL_TIME: 'int|true|default=0|comment=取消时间',
	STORAGE_CANCEL_REASON: 'string|false|comment=取消原因',
	STORAGE_CANCEL_OPERATOR: 'string|false|comment=取消操作人',

	STORAGE_ADD_TIME: 'int|true',
	STORAGE_EDIT_TIME: 'int|true',
	STORAGE_ADD_IP: 'string|false',
	STORAGE_EDIT_IP: 'string|false',
};

StorageModel.FIELD_PREFIX = 'STORAGE_';

StorageModel.STATUS = {
	STORE_WAITING: 0,
	STORE_CALLED: 1,
	STORE_EXECUTING: 2,
	STORED: 3,
	FETCH_TO_PAY: 4,
	FETCH_WAITING: 5,
	FETCH_CALLED: 6,
	FETCH_EXECUTING: 7,
	FETCHED: 8,
	CANCEL: 9
};

StorageModel.STATUS_DESC = {
	STORE_WAITING: '待叫号·存柜',
	STORE_CALLED: '已叫号·存柜',
	STORE_EXECUTING: '存柜执行中',
	STORED: '已存柜',
	FETCH_TO_PAY: '取柜待缴费',
	FETCH_WAITING: '取柜待叫号',
	FETCH_CALLED: '已叫号·取柜',
	FETCH_EXECUTING: '取柜执行中',
	FETCHED: '已取柜',
	CANCEL: '已取消'
};

/** 支付状态 */
StorageModel.PAY_STATUS = {
	UNPAID: 0,
	PAID: 1,
	FREE: 2,
	CONFIRMED: 3
};

StorageModel.PAY_STATUS_DESC = {
	UNPAID: '未支付',
	PAID: '已支付',
	FREE: '免支付',
	CONFIRMED: '已确认收款'
};

/** 支付方式 */
StorageModel.PAY_MODE = {
	ONSITE: 0,
	ONLINE: 1
};

StorageModel.PAY_MODE_DESC = {
	ONSITE: '现场支付',
	ONLINE: '在线支付'
};

/** 吊柜接单方式 */
StorageModel.GRAB_TYPE = {
	GRAB: 0,
	ASSIGN: 1
};

StorageModel.GRAB_TYPE_DESC = {
	GRAB: '抢单',
	ASSIGN: '派单'
};

/** 看板展示状态(不含已取柜/已取消) */
StorageModel.BOARD_STATUS = [0, 1, 2, 3, 4, 5, 6, 7];

/** 存柜阶段进行中状态 */
StorageModel.STORE_ACTIVE = [0, 1, 2, 3];

/** 取柜阶段进行中状态 */
StorageModel.FETCH_ACTIVE = [4, 5, 6, 7];

/** 存柜码查重状态(存柜阶段未取出) */
StorageModel.CODE_ACTIVE = [0, 1, 2, 3];

module.exports = StorageModel;
