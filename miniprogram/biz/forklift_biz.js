/**
 * Notes: 叉车/吊柜司机业务（共用登录态；身份由登录返回的 role 区分：forklift=叉车,crane=吊柜）
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

/** 当前登录账号的工作身份：'forklift' 叉车 / 'crane' 吊柜 */
function getWorkRole() {
	let forklift = cacheHelper.get(constants.CACHE_FORKLIFT);
	return (forklift && forklift.role) || '';
}

function clearForkliftToken() {
	cacheHelper.remove(constants.CACHE_FORKLIFT);
}

module.exports = {
	isForklift,
	forkliftLogin,
	getForkliftToken,
	getWorkRole,
	clearForkliftToken
};
