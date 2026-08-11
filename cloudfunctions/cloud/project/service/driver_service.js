/**
 * Notes: 司机登录模块业务逻辑
 * Date: 2021-03-15 19:20:00
 * Update: 2026-08-10 微信登录+注册
 */

const BaseService = require('./base_service.js');
const UserModel = require('../model/user_model.js');
const timeUtil = require('../../framework/utils/time_util.js');

class DriverService extends BaseService {

	/**
	 * 微信登录：根据 openid 查找或创建用户，返回注册状态
	 * @param {*} openId 微信 openid
	 */
	async wxLogin(openId) {
		let user = await UserModel.getOne({
			USER_MINI_OPENID: openId,
			USER_ROLE: 'driver'
		}, 'USER_NAME,USER_MOBILE,USER_STATUS,USER_LOGIN_CNT,USER_IDCARD,USER_LICENSE_PLATE');

		if (!user) {
			// 首次使用 → 自动创建用户记录（状态=待审核）
			let newUserId = await UserModel.insert({
				USER_MINI_OPENID: openId,
				USER_ROLE: 'driver',
				USER_STATUS: UserModel.STATUS.UNUSE,
				USER_LOGIN_CNT: 1,
				USER_LOGIN_TIME: timeUtil.time(),
				USER_NAME: '',
				USER_MOBILE: '',
			});
			return {
				registered: false,
				token: newUserId,
				id: newUserId,
				name: '',
				phone: '',
				role: 'driver',
				driverInfo: null
			};
		}

		// 更新登录次数和时间
		let cnt = (user.USER_LOGIN_CNT || 0) + 1;
		await UserModel.edit(user._id, {
			USER_LOGIN_CNT: cnt,
			USER_LOGIN_TIME: timeUtil.time()
		});

		// 是否已完成注册：状态正常且有身份证号
		let registered = (user.USER_STATUS === UserModel.STATUS.COMM && !!user.USER_IDCARD);

		return {
			registered,
			token: user._id,
			id: user._id,
			name: user.USER_NAME || '',
			phone: user.USER_MOBILE || '',
			role: 'driver',
			driverInfo: registered ? {
				name: user.USER_NAME,
				phone: user.USER_MOBILE,
				idCard: user.USER_IDCARD,
				licensePlate: user.USER_LICENSE_PLATE,
			} : null
		};
	}

	/**
	 * 司机注册：保存个人信息+三证
	 * @param {*} openId 微信 openid
	 * @param {*} input  { name, phone, idCard, licensePlate, driverLicenseImg, vehicleRegImg, idCardImg }
	 */
	async register(openId, input) {
		let user = await UserModel.getOne({
			USER_MINI_OPENID: openId,
			USER_ROLE: 'driver'
		});

		if (!user) this.AppError('用户不存在，请重新登录');

		// 已注册检查
		if (user.USER_STATUS === UserModel.STATUS.COMM && user.USER_IDCARD) {
			this.AppError('您已注册，请勿重复提交');
		}

		// 车牌号格式校验
		let plate = input.licensePlate.toUpperCase();
		let plateRegex = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]$|^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,5}领$/;
		if (!plateRegex.test(plate)) {
			this.AppError('车牌号格式不正确，请输入正确的车牌号');
		}

		await UserModel.edit(user._id, {
			USER_NAME: input.name,
			USER_MOBILE: input.phone,
			USER_IDCARD: input.idCard,
			USER_LICENSE_PLATE: plate,
			USER_DRIVER_LICENSE_IMG: input.driverLicenseImg,
			USER_VEHICLE_REG_IMG: input.vehicleRegImg,
			USER_IDCARD_IMG: input.idCardImg,
			USER_PHONE_VERIFIED: 1,
			USER_STATUS: UserModel.STATUS.COMM,
		});

		return { success: true };
	}

	/**
	 * 微信手机号 code 换取真实手机号
	 * @param {*} code 前端 getPhoneNumber 按钮返回的 code
	 */
	async getPhoneNumber(code) {
		try {
			const cloud = require('wx-server-sdk');
			let result = await cloud.getPhoneNumber({ code });
			return { success: true, phoneNumber: result.phoneNumber };
		} catch (err) {
			this.AppError('手机号获取失败，请重新授权：' + err.message);
		}
	}

	/**
	 * 司机修改个人信息（所有字段可选，只更新传入的）
	 * @param {*} openId
	 * @param {*} input
	 */
	async updateInfo(openId, input) {
		let user = await UserModel.getOne({
			USER_MINI_OPENID: openId,
			USER_ROLE: 'driver'
		});

		if (!user) this.AppError('用户不存在');

		let data = {};
		if (input.name) data.USER_NAME = input.name;
		if (input.phone) data.USER_MOBILE = input.phone;
		if (input.idCard) data.USER_IDCARD = input.idCard;
		if (input.licensePlate) {
			let plate = input.licensePlate.toUpperCase();
			let plateRegex = /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,5}[A-HJ-NP-Z0-9挂学警港澳]$|^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤川青藏琼宁][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,5}领$/;
			if (!plateRegex.test(plate)) this.AppError('车牌号格式不正确');
			data.USER_LICENSE_PLATE = plate;
		}
		if (input.driverLicenseImg) data.USER_DRIVER_LICENSE_IMG = input.driverLicenseImg;
		if (input.vehicleRegImg) data.USER_VEHICLE_REG_IMG = input.vehicleRegImg;
		if (input.idCardImg) data.USER_IDCARD_IMG = input.idCardImg;

		if (Object.keys(data).length === 0) this.AppError('没有需要更新的信息');

		await UserModel.edit(user._id, data);
		return { success: true };
	}

	/**
	 * 获取司机详情
	 * @param {*} userId openid
	 */
	async getMyDetail(userId) {
		let where = {
			USER_MINI_OPENID: userId
		};
		let fields = 'USER_MOBILE,USER_NAME,USER_CITY,USER_TRADE,USER_WORK,USER_STATUS,USER_IDCARD,USER_LICENSE_PLATE,USER_DRIVER_LICENSE_IMG,USER_VEHICLE_REG_IMG,USER_IDCARD_IMG,USER_PHONE_VERIFIED';
		return await UserModel.getOne(where, fields);
	}

}

module.exports = DriverService;
