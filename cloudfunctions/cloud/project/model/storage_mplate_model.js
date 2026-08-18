/**
 * Notes: 存取柜月付车牌池实体
 * 月付（月结）客户录入月付司机的车牌，取柜登记时按取柜司机车牌自动匹配，
 * 命中则本单免现场缴费（费用记公司月结）；池内每个车牌条目单次有效：
 * 取柜登记时锁定(CLAIMED) → 取柜完成时消去(CONSUMED)；中途取消自动释放回池(ACTIVE)。
 */

const BaseModel = require('./base_model.js');

class StorageMplateModel extends BaseModel {}

StorageMplateModel.CL = 'ax_storage_mplate';

StorageMplateModel.DB_STRUCTURE = {
	_pid: 'string|true',
	MPLATE_ID: 'string|true',

	MPLATE_PLATE: 'string|true|comment=车牌(大写，取柜识别用)',
	MPLATE_CUSTOMER_ID: 'string|true|comment=录入客户账号ID(ax_user,USER_ROLE=customer)',
	MPLATE_CUSTOMER_NAME: 'string|true|comment=录入客户名快照',

	MPLATE_STATUS: 'int|true|default=0|comment=状态 0=有效(池中),1=已占用(取柜登记锁定),2=已消去(取柜完成使用)',
	MPLATE_STORAGE_ID: 'string|false|comment=占用的存取柜记录ID',
	MPLATE_CLAIM_TIME: 'int|true|default=0|comment=占用时间',
	MPLATE_CONSUME_TIME: 'int|true|default=0|comment=消去时间(取柜完成)',

	MPLATE_ADD_TIME: 'int|true',
	MPLATE_EDIT_TIME: 'int|true',
	MPLATE_ADD_IP: 'string|false',
	MPLATE_EDIT_IP: 'string|false',
};

StorageMplateModel.FIELD_PREFIX = 'MPLATE_';

/** 状态 */
StorageMplateModel.STATUS = {
	ACTIVE: 0,
	CLAIMED: 1,
	CONSUMED: 2
};

StorageMplateModel.STATUS_DESC = {
	ACTIVE: '有效',
	CLAIMED: '使用中',
	CONSUMED: '已使用'
};

module.exports = StorageMplateModel;
