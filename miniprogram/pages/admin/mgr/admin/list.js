const AdminBiz = require('../../../../biz/admin_biz.js');
const cloudHelper = require('../../../../helper/cloud_helper.js');
const pageHelper = require('../../../../helper/page_helper.js');
const bizHelper = require('../../../../biz/biz_helper.js');

Page({

    data: {
        isSuperAdmin: false,
    },

    onLoad: function (options) {
        if (!AdminBiz.isAdmin(this)) return;
        wx.setNavigationBarColor({
            backgroundColor: '#3B82E6',
            frontColor: '#ffffff',
        });

        this.setData({
            isSuperAdmin: AdminBiz.isSuperAdmin(),
        });
    },

    onShow: function () {
        let cmpt = this.selectComponent('#adminList');
        if (cmpt) {
            cmpt.reload();
        } else {
            setTimeout(() => {
                let retryCmpt = this.selectComponent('#adminList');
                if (retryCmpt) retryCmpt.reload();
            }, 300);
        }
    },

    bindDelTap: async function (e) {
        if (!AdminBiz.isAdmin(this)) return;

        let id = pageHelper.dataset(e, 'id');
        let callback = async () => {
            try {
                await cloudHelper.callCloudSumbit('admin/admin_del', { id }, { title: '删除中' });
                wx.showToast({ title: '删除成功', icon: 'success' });
                bizHelper.removeCacheList('admin-mgr-admin');
                let cmpt = this.selectComponent('#adminList');
                if (cmpt) cmpt.reload();
            } catch (err) {
                console.log(err);
            }
        };
        pageHelper.showConfirm('确认删除该管理员？', callback);
    },

    bindResetPwdTap: async function (e) {
        if (!AdminBiz.isAdmin(this)) return;

        let id = pageHelper.dataset(e, 'id');
        let name = pageHelper.dataset(e, 'name');
        wx.showModal({
            title: '重置密码',
            content: '将为「' + name + '」重置密码为 123456，确认？',
            success: async res => {
                if (!res.confirm) return;
                try {
                    await cloudHelper.callCloudSumbit('admin/admin_reset_pwd', {
                        id,
                        password: '123456',
                    }, { title: '重置中' });
                    wx.showToast({ title: '密码已重置为123456', icon: 'none', duration: 2000 });
                } catch (err) {
                    console.log(err);
                }
            }
        });
    },

    bindCommListCmpt: function (e) {
        pageHelper.commListListener(this, e);
    },

    bindEditTap: function (e) {
        let id = pageHelper.dataset(e, 'id');
        wx.navigateTo({ url: '/pages/admin/mgr/admin/edit?id=' + id });
    },

    bindAddTap: function () {
        wx.navigateTo({ url: '/pages/admin/mgr/admin/edit' });
    },

});