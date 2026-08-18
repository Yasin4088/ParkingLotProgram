/**
 * Notes: 预约后台管理
 * Ver : CCMiniCloud Framework 2.0.1 ALL RIGHTS RESERVED BY www.code3721.com
 * Date: 2022-12-08 07:48:00 
 */

const BaseAdminService = require('./base_admin_service.js');
const timeUtil = require('../../../framework/utils/time_util.js');

const MeetModel = require('../../model/meet_model.js');
const JoinModel = require('../../model/join_model.js');
const UserModel = require('../../model/user_model.js');

const DataService = require('./../data_service');
const QueueService = require('./../queue_service.js');
const AdminStorageService = require('./admin_storage_service.js');

// 导出报名数据KEY
const EXPORT_JOIN_DATA_KEY = 'join_data';

// 导出用户数据KEY
const EXPORT_USER_DATA_KEY = 'user_data';

// 导出装卸月报KEY
const EXPORT_QUEUE_MONTH_KEY = 'queue_month_';

// 导出存取柜月报KEY
const EXPORT_STORAGE_MONTH_KEY = 'storage_month_';

class AdminExportService extends BaseAdminService {
	// #####################导出报名数据
	/**获取报名数据 */
	async getJoinDataURL() {
		let dataService = new DataService();
		return await dataService.getExportDataURL(EXPORT_JOIN_DATA_KEY);
	}

	/**删除报名数据 */
	async deleteJoinDataExcel() {
		let dataService = new DataService();
		return await dataService.deleteDataExcel(EXPORT_JOIN_DATA_KEY);
	}

	// 根据表单提取数据
	_getValByForm(arr, mark, title) {
		for (let k in arr) {
			if (arr[k].mark == mark) return arr[k].val;
			if (arr[k].title == title) return arr[k].val;
		}

		return '';
	}

	/**导出报名数据 */
	async exportJoinDataExcel({
		meetId,
		startDay,
		endDay,
		status
	}) {
		this.AppError('此功能暂不开放，如有需要请加作者微信：cclinux0730');

	}


	// #####################导出用户数据

	/**获取用户数据 */
	async getUserDataURL() {
		let dataService = new DataService();
		return await dataService.getExportDataURL(EXPORT_USER_DATA_KEY);
	}

	/**删除用户数据 */
	async deleteUserDataExcel() {
		let dataService = new DataService();
		return await dataService.deleteDataExcel(EXPORT_USER_DATA_KEY);
	}

	/**导出用户数据 */
	async exportUserDataExcel(condition) {

		this.AppError('此功能暂不开放，如有需要请加作者微信：cclinux0730');

	}


	// ##################### 装卸月报 #####################

	/**获取月报下载地址 */
	async getQueueMonthURL(yearMonth) {
		let dataService = new DataService();
		return await dataService.getExportDataURL(EXPORT_QUEUE_MONTH_KEY + yearMonth);
	}

	/**导出月度经营报表（该月已完成/已取消记录） */
	async exportQueueMonthExcel(yearMonth) {
		let queueService = new QueueService();
		let history = await queueService.historyList(yearMonth);
		let list = history.list || [];

		let header = [
			'状态', '排队号', '车牌号', '业务类型', '货物名称', '备注', '手机号',
			'叉车司机', '接单方式', '费用明细', '总费用(元)', '支付状态',
			'创建日期', '取消原因'
		];

		let rows = [header];
		let feeTotal = 0;
		let paidTotal = 0;
		let accountTotal = 0;

		for (let item of list) {
			let feeText = (item.fees || []).map(f => f.name + '¥' + f.amountText + '(' + f.typeDesc + ')').join('；');
			rows.push([
				item.statusDesc || '',
				item.QUEUE_NO || '',
				item.QUEUE_PLATE || '',
				item.QUEUE_ACTION_NAME || '',
				item.QUEUE_CARGO_NAME || '',
				item.QUEUE_REMARK || '',
				item.QUEUE_PHONE || '',
				item.forkliftName || '',
				item.grabTypeDesc || '',
				feeText,
				item.feeTotalText || '0.00',
				item.payStatusDesc || '',
				item.QUEUE_ADD_TIME ? timeUtil.timestamp2Time(item.QUEUE_ADD_TIME, 'Y-M-D') : '',
				item.QUEUE_CANCEL_REASON || ''
			]);
			feeTotal += Number(item.feeTotal) || 0;
			if (Number(item.QUEUE_PAY_STATUS) === 1) paidTotal += Number(item.feeTotal) || 0;
			if (Number(item.QUEUE_PAY_STATUS) === 3) accountTotal += Number(item.feeTotal) || 0;
		}

		let empty = ['', '', '', '', '', '', '', '', ''];
		rows.push(empty.concat(['', '合计费用(元)', (feeTotal / 100).toFixed(2), '']).concat(['']));
		rows.push(empty.concat(['', '已支付(元)', (paidTotal / 100).toFixed(2), '']).concat(['']));
		rows.push(empty.concat(['', '记账(元)', (accountTotal / 100).toFixed(2), '']).concat(['']));

		let dataService = new DataService();
		return await dataService.exportDataExcel(
			EXPORT_QUEUE_MONTH_KEY + yearMonth,
			'装卸经营月报' + yearMonth,
			list.length,
			rows
		);
	}


	// ##################### 存取柜月报 #####################

	/**获取存取柜月报下载地址 */
	async getStorageMonthURL(yearMonth) {
		let dataService = new DataService();
		return await dataService.getExportDataURL(EXPORT_STORAGE_MONTH_KEY + yearMonth);
	}

	/**导出存取柜月度经营报表（该月已取柜/已取消记录） */
	async exportStorageMonthExcel(yearMonth) {
		let adminStorageService = new AdminStorageService();
		let history = await adminStorageService.historyList(yearMonth);
		let list = history.list || [];

		let header = [
			'状态', '排队号', '存柜码', '车牌号', '柜型', '柜号',
			'存柜完成时间', '取柜登记时间', '计费天数',
			'单价(元/天)', '费用(元)', '支付状态', '月结客户', '吊柜司机', '取柜登记手机号'
		];

		let rows = [header];
		let feeTotal = 0;
		let paidTotal = 0;
		let monthlyTotal = 0;

		for (let item of list) {
			rows.push([
				item.statusDesc || '',
				item.STORAGE_NO || '',
				item.STORAGE_CODE || '',
				item.STORAGE_PLATE || '',
				item.STORAGE_CABINET_NAME || '',
				item.STORAGE_CABINET_NO || '',
				item.STORAGE_FINISH_TIME ? timeUtil.timestamp2Time(item.STORAGE_FINISH_TIME) : '',
				item.STORAGE_FETCH_TIME ? timeUtil.timestamp2Time(item.STORAGE_FETCH_TIME) : '',
				item.STORAGE_DAYS || 0,
				item.priceDailyText || '0.00',
				item.feeTotalText || '0.00',
				item.payStatusDesc || '',
				(Number(item.STORAGE_MONTHLY) === 1 && item.STORAGE_MONTHLY_CUSTOMER_NAME) ? item.STORAGE_MONTHLY_CUSTOMER_NAME : '',
				item.forkliftName || '',
				item.STORAGE_FETCH_PHONE || ''
			]);
			feeTotal += Number(item.feeTotal) || 0;
			if (Number(item.STORAGE_PAY_STATUS) === 1) paidTotal += Number(item.feeTotal) || 0;
			if (Number(item.STORAGE_MONTHLY) === 1) monthlyTotal += Number(item.feeTotal) || 0;
		}

		let empty = ['', '', '', '', '', '', '', '', '', '', '', '', ''];
		rows.push(empty.concat(['', '合计费用(元)', (feeTotal / 100).toFixed(2), '']).concat(['']));
		rows.push(empty.concat(['', '已支付(元)', (paidTotal / 100).toFixed(2), '']).concat(['']));
		rows.push(empty.concat(['', '月结(元)', (monthlyTotal / 100).toFixed(2), '']).concat(['']));

		let dataService = new DataService();
		return await dataService.exportDataExcel(
			EXPORT_STORAGE_MONTH_KEY + yearMonth,
			'存取柜经营月报' + yearMonth,
			list.length,
			rows
		);
	}
}

module.exports = AdminExportService;