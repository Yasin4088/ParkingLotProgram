/**
 * Notes: 叉车司机业务
 */

const cacheHelper = require('../helper/cache_helper.js');
const constants = require('./constants.js');

function isForklift(that) {
	wx.setNavigationBarColor({
		backgroundColor: '#E67E22',
		frontColor: '#ffffff',
	});
	let forklift = cacheHelper.get(constants.CACHE_FORKLIFT);
	if (!forklift || !forklift.id) {
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
	that.setData({ isForklift: true });
	return true;
}

function forkliftLogin(data) {
	cacheHelper.set(constants.CACHE_FORKLIFT, data, 86400);
}

function getForkliftToken() {
	return cacheHelper.get(constants.CACHE_FORKLIFT);
}

function clearForkliftToken() {
	cacheHelper.remove(constants.CACHE_FORKLIFT);
}

module.exports = {
	isForklift,
	forkliftLogin,
	getForkliftToken,
	clearForkliftToken
};
