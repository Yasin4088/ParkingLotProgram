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

	'driver/login': 'queue_controller@driverLogin',

	'admin/login': 'admin/admin_home_controller@adminLogin',
	'admin/queue_list': 'admin/admin_queue_controller@list',
	'admin/queue_call_next': 'admin/admin_queue_controller@callNext',
	'admin/queue_finish': 'admin/admin_queue_controller@finish',

	'admin/user_list': 'admin/admin_user_controller@getUserList',
	'admin/user_detail': 'admin/admin_user_controller@getUserDetailById',
	'admin/user_insert': 'admin/admin_user_controller@insertUser',
	'admin/user_edit': 'admin/admin_user_controller@editUser',
	'admin/user_del': 'admin/admin_user_controller@delUser',
}