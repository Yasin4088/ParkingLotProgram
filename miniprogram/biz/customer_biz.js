/**
 * Notes: 客户账号业务（月付/月结车牌录入）
 */

const cacheHelper = require('../helper/cache_helper.js');
const constants = require('./constants.js');

function isCustomer(that) {
	wx.setNavigationBarColor({
		backgroundColor: '#3B82E6',
		frontColor: '#ffffff',
	});
	let customer = cacheHelper.get(constants.CACHE_CUSTOMER);
	if (!customer || !customer.id) {
		wx.showModal({
			title: '',
			content: '登录已过期，请重新登录',
			showCancel: false,
			confirmText: '确定',
			success: () => {
				wx.reLaunch({ url: '/pages/login/login' });
			}
		});
		return false;
	}
	that.setData({ isCustomer: true });
	return true;
}

function customerLogin(data) {
	cacheHelper.set(constants.CACHE_CUSTOMER, data, 86400);
}

function getCustomerToken() {
	return cacheHelper.get(constants.CACHE_CUSTOMER);
}

function clearCustomerToken() {
	cacheHelper.remove(constants.CACHE_CUSTOMER);
}

module.exports = {
	isCustomer,
	customerLogin,
	getCustomerToken,
	clearCustomerToken
};
