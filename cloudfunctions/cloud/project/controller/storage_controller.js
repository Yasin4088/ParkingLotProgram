/**
 * Notes: 存取柜司机端控制器
 */

const BaseController = require('./base_controller.js');
const StorageService = require('../service/storage_service.js');

class StorageController extends BaseController {

	async options() {
		let service = new StorageService();
		return await service.getOptions();
	}

	/** 司机登记存柜 */
	async storeRegister() {
		let rules = {
			plate: 'must|string|min:3|max:20|name=车牌号',
			phone: 'must|mobile|name=手机号',
			cabinetId: 'must|string|name=柜型',
			cabinetNo: 'must|string|max:20|name=柜号',
			doorProof: 'must|string|name=柜门照片',
			company: 'int|name=公司(0=挚力,1=其他)',
		};
		let input = this.validateData(rules);

		let driver = await this.getDriverId();
		let service = new StorageService();
		return await service.registerStore(driver._id, this._userId, input.phone, input.plate, input.cabinetId, input.cabinetNo, input.doorProof, input.company);
	}

	/** 取柜费用预览 */
	async fetchCalc() {
		let rules = {
			code: 'must|string|name=存柜码',
			plate: 'string|max:20|name=取柜车牌',
		};
		let input = this.validateData(rules);

		let service = new StorageService();
		return await service.fetchCalc(input.code, input.plate);
	}

	/** 司机登记取柜（锁定费用，进入待缴费；取柜车牌命中月付池则免现场缴费直接入队） */
	async fetchRegister() {
		let rules = {
			code: 'must|string|name=存柜码',
			phone: 'must|mobile|name=手机号',
			payMode: 'int|name=支付方式',
			plate: 'string|max:20|name=取柜车牌',
		};
		let input = this.validateData(rules);

		let service = new StorageService();
		return await service.registerFetch(this._token, this._userId, input.phone, input.code, input.payMode, input.plate);
	}

	/** 在线支付下单 */
	async pay() {
		let rules = {
			id: 'must|string|name=存取柜记录',
		};
		let input = this.validateData(rules);

		let service = new StorageService();
		return await service.pay(this._token, input.id);
	}

	async myCurrent() {
		let driver = await this.getDriverId();
		let service = new StorageService();
		return await service.myCurrent(driver._id);
	}
}

module.exports = StorageController;
