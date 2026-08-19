/**
 * Notes: 注册登录模块业务逻辑
 * Ver : CCMiniCloud Framework 2.0.1 ALL RIGHTS RESERVED BY cclinux@qq.com
 * Date: 2020-11-14 07:48:00
 */

const BaseBiz = require('./base_biz.js');
const AdminBiz = require('./admin_biz.js');
const setting = require('../setting/setting.js');
const dataHelper = require('../helper/data_helper.js');
const cloudHelper = require('../helper/cloud_helper.js');
const cacheHelper = require('../helper/cache_helper.js');
const constants = require('../biz/constants.js');

class PassportBiz extends BaseBiz {

	/**
	 * 页面初始化 分包下使用
	 */
	static async initPage({
		skin,
		that,
		isLoadSkin = false,
		tabIndex = -1,
		isModifyNavColor = true
	}) {

		if (isModifyNavColor) {
			wx.setNavigationBarColor({
				backgroundColor: skin.NAV_BG,
				frontColor: skin.NAV_COLOR,
			});
		}

		if (tabIndex > -1) {
			wx.setNavigationBarTitle({
				title: skin.MENU_ITEM[tabIndex]
			});
		}

		skin.IS_SUB = setting.IS_SUB;
		if (isLoadSkin) {
			skin.newsCateArr = dataHelper.getSelectOptions(skin.NEWS_CATE);
			skin.meetTypeArr = dataHelper.getSelectOptions(skin.MEET_TYPE);
			that.setData({ skin });
		}
	}

	/**
	 * 司机登录
	 */
	static async driverLogin(phone, pwd, that) {
		let params = { phone, pwd };
		let opt = { title: '登录中' };

		try {
			await cloudHelper.callCloudSumbit('driver/login', params, opt).then(res => {
				if (res && res.data) {
					// 缓存用户信息
					cacheHelper.set(constants.CACHE_TOKEN, res.data, setting.ADMIN_TOKEN_EXPIRE);
					wx.showToast({ title: '登录成功', icon: 'success' });
					setTimeout(() => {
						wx.redirectTo({ url: '/driver/biz_select' });
					}, 800);
				}
			});
		} catch (e) {
			console.log(e);
		}
	}

	/**
	 * 管理员登录
	 */
	static async adminLogin(name, pwd, that) {
		if (name.length < 2 || name.length > 30) {
			wx.showToast({
				title: '账号输入错误(2-30位)',
				icon: 'none'
			});
			return;
		}

		if (pwd.length < 4 || pwd.length > 30) {
			wx.showToast({
				title: '密码输入错误(4-30位)',
				icon: 'none'
			});
			return;
		}

		let params = { name, pwd };
		let opt = { title: '登录中' };

		try {
			await cloudHelper.callCloudSumbit('admin/login', params, opt).then(res => {
				if (res && res.data && res.data.name) {
					AdminBiz.adminLogin(res.data);
					wx.reLaunch({
						url: '/pages/admin/index/home/admin_home',
					});
				}
			});
		} catch (e) {
			console.log(e);
		}
	}

	/**
	 * 清除所有登录态
	 */
	static clearToken() {
		cacheHelper.remove(constants.CACHE_TOKEN);
		cacheHelper.remove(constants.CACHE_ADMIN);
	}

	/**
	 * 获取当前司机登录信息
	 */
	static getDriverToken() {
		return cacheHelper.get(constants.CACHE_TOKEN);
	}

}

module.exports = PassportBiz;
