/**
 * Notes: 路由配置文件
 * User: CC
 * Date: 2020-10-14 07:00:00
 */

module.exports = {
	'queue/options': 'queue_controller@options',
	'queue/create': 'queue_controller@create',
	'queue/my_current': 'queue_controller@myCurrent',
	'queue/checkin': 'queue_controller@checkin',
	'queue/subscribe': 'queue_controller@subscribe',
	'queue/confirm': 'queue_controller@confirm',

	'driver/wxlogin': 'driver_controller@wxLogin',
	'driver/register': 'driver_controller@register',
	'driver/getphonenumber': 'driver_controller@getPhoneNumber',
	'driver/getinfo': 'driver_controller@getMyDetail',
	'driver/updateinfo': 'driver_controller@updateInfo',

	'forklift/login': 'forklift_controller@login',
	'forklift/my_task': 'forklift_controller@myTask',
	'forklift/my_tasks': 'forklift_controller@myTasks',
	'forklift/complete': 'forklift_controller@complete',

	'admin/login': 'admin/admin_home_controller@adminLogin',
	'admin/check_setup': 'admin/admin_home_controller@checkSetup',
	'admin/home': 'admin/admin_home_controller@adminHome',
	'admin/clear_cache': 'admin/admin_home_controller@clearCache',
	'admin/queue_list': 'admin/admin_queue_controller@list',
	'admin/queue_call': 'admin/admin_queue_controller@callSelected',
	'admin/queue_call_next': 'admin/admin_queue_controller@callNext',
	'admin/queue_detail': 'admin/admin_queue_controller@detail',
	'admin/queue_edit': 'admin/admin_queue_controller@edit',
	'admin/queue_cancel': 'admin/admin_queue_controller@cancel',
	'admin/queue_finish': 'admin/admin_queue_controller@finish',
	'admin/forklift_list': 'admin/admin_queue_controller@forkliftList',

	'admin/user_list': 'admin/admin_user_controller@getUserList',
	'admin/user_detail': 'admin/admin_user_controller@getUserDetailById',
	'admin/user_insert': 'admin/admin_user_controller@insertUser',
	'admin/user_edit': 'admin/admin_user_controller@editUser',
	'admin/user_del': 'admin/admin_user_controller@delUser',

	'admin/setup': 'admin/admin_mgr_controller@setupAdmin',
	'admin/admin_list': 'admin/admin_mgr_controller@getAdminList',
	'admin/admin_detail': 'admin/admin_mgr_controller@getAdminDetail',
	'admin/admin_insert': 'admin/admin_mgr_controller@insertAdmin',
	'admin/admin_edit': 'admin/admin_mgr_controller@editAdmin',
	'admin/admin_del': 'admin/admin_mgr_controller@delAdmin',
	'admin/admin_change_pwd': 'admin/admin_mgr_controller@changePwd',
	'admin/admin_reset_pwd': 'admin/admin_mgr_controller@resetPwd',
};
