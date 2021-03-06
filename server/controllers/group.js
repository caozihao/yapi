const groupModel = require('../models/group.js');
const yapi = require('../yapi.js');
const baseController = require('./base.js');
const projectModel = require('../models/project.js');
const userModel = require('../models/user.js');
const interfaceModel = require('../models/interface.js');
const interfaceColModel = require('../models/interfaceCol.js');
const interfaceCaseModel = require('../models/interfaceCase.js');

class groupController extends baseController {
    constructor(ctx) {
        super(ctx);
    }

    /**
     * 查询项目分组
     * @interface /group/get
     * @method GET
     * @category group
     * @foldnumber 10
     * @param {String} id 项目分组ID
     * @returns {Object}
     * @example
     */
    async get(ctx) {
        try {
            let params = ctx.request.query;
            if (!params.id) {
                return ctx.body = yapi.commons.resReturn(null, 400, '分组id不能为空');
            }
            let groupInst = yapi.getInst(groupModel);
            let result = await groupInst.getGroupById(params.id);
            result = result.toObject();
            result.role = await this.getProjectRole(params.id, 'group');
            if (result.type === 'private') {
                result.group_name = '个人空间';
            }
            ctx.body = yapi.commons.resReturn(result);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 400, e.message)
        }

    }

    /**
     * 添加项目分组
     * @interface /group/add
     * @method POST
     * @category group
     * @foldnumber 10
     * @param {String} group_name 项目分组名称，不能为空
     * @param {String} [group_desc] 项目分组描述
     * @param {String} [owner_uids]  组长[uid]
     * @returns {Object}
     * @example ./api/group/add.json
     */
    async add(ctx) {
        let params = ctx.request.body;

        params = yapi.commons.handleParams(params, {
            group_name: 'string',
            group_desc: 'string',
            owner_uid: 'number'
        });

        if (this.getRole() !== 'admin') {
            return ctx.body = yapi.commons.resReturn(null, 401, '没有权限');
        }

        if (!params.group_name) {
            return ctx.body = yapi.commons.resReturn(null, 400, '项目分组名不能为空');
        }

        let owners = [];
        if (params.owner_uids) {
            for (let i = 0, len = params.owner_uids.length; i < len; i++) {
                let id = params.owner_uids[i]
                let groupUserdata = await this.getUserdata(id, 'owner');
                if (groupUserdata) {
                    owners.push(groupUserdata)
                }
            }
        }


        let groupInst = yapi.getInst(groupModel);

        let checkRepeat = await groupInst.checkRepeat(params.group_name);

        if (checkRepeat > 0) {
            return ctx.body = yapi.commons.resReturn(null, 401, '项目分组名已存在');
        }

        let data = {
            group_name: params.group_name,
            group_desc: params.group_desc,
            uid: this.getUid(),
            add_time: yapi.commons.time(),
            up_time: yapi.commons.time(),
            members: owners
        };

        try {
            let result = await groupInst.save(data);

            result = yapi.commons.fieldSelect(result, ['_id', 'group_name', 'group_desc', 'uid', 'members', 'type']);
            let username = this.getUsername();
            yapi.commons.saveLog({
                content: `<a href="/user/profile/${this.getUid()}">${username}</a> 新增了分组 <a href="/group/${result._id}">${params.group_name}</a>`,
                type: 'group',
                uid: this.getUid(),
                username: username,
                typeid: result._id
            });
            ctx.body = yapi.commons.resReturn(result);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }

    }

    /**
     * 获取用户数据
     * @param uid
     * @param role
     * @returns {Promise.<*>}
     */

    async getUserdata(uid, role) {
        role = role || 'dev';
        let userInst = yapi.getInst(userModel);
        let userData = await userInst.findById(uid);
        if (!userData) {
            return null;
        }
        return {
            _role: userData.role,
            role: role,
            uid: userData._id,
            username: userData.username,
            email: userData.email
        }
    }

    /**
     * 添加项目分组成员
     * @interface /group/add_member
     * @method POST
     * @category group
     * @foldnumber 10
     * @param {String} id 项目分组id
     * @param {String} member_uids 项目分组成员[uid]
     * @param {String} role 成员角色，owner or dev or guest
     * @returns {Object}
     * @example
     */
    async addMember(ctx) {

        let params = ctx.request.body;
        let groupInst = yapi.getInst(groupModel);
        if (!params.member_uids || !params.member_uids.length) {
            return ctx.body = yapi.commons.resReturn(null, 400, '分组成员uid不能为空');
        }
        if (!params.id) {
            return ctx.body = yapi.commons.resReturn(null, 400, '分组id不能为空');
        }

        params.role = ['owner', 'dev', 'guest'].find(v => v === params.role) || 'dev';
        let add_members = [];
        let exist_members = [];
        let no_members = []
        for (let i = 0, len = params.member_uids.length; i < len; i++) {
            let id = params.member_uids[i];
            let check = await groupInst.checkMemberRepeat(params.id, id);
            let userdata = await this.getUserdata(id, params.role);
            if (check > 0) {
                exist_members.push(userdata)
            } else if (!userdata) {
                no_members.push(id)
            } else {
                userdata.role !== 'admin' && add_members.push(userdata);
                delete userdata._role;
            }
        }

        try {
            let result = await groupInst.addMember(params.id, add_members);
            let username = this.getUsername();
            let rolename = {
                owner: "组长",
                dev: "开发者",
                guest: "访客"
            };
            if (add_members.length) {
                let members = add_members.map((item) => {
                    return `<a href = "/user/profile/${item.uid}">${item.username}</a>`
                })
                members = members.join("、");
                yapi.commons.saveLog({
                    content: `<a href="/user/profile/${this.getUid()}">${username}</a> 新增了分组成员 ${members} 为 ${rolename[params.role]}`,
                    type: 'group',
                    uid: this.getUid(),
                    username: username,
                    typeid: params.id
                });
            }
            ctx.body = yapi.commons.resReturn({
                result,
                add_members,
                exist_members,
                no_members
            });
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }


    /**
     * 修改项目分组成员角色
     * @interface /group/change_member_role
     * @method POST
     * @category group
     * @foldnumber 10
     * @param {String} id 项目分组id
     * @param {String} member_uid 项目分组成员uid
     * @param {String} role 权限 ['owner'|'dev']
     * @returns {Object}
     * @example
     */
    async changeMemberRole(ctx) {
        let params = ctx.request.body;
        let groupInst = yapi.getInst(groupModel);
        if (!params.member_uid) {
            return ctx.body = yapi.commons.resReturn(null, 400, '分组成员uid不能为空');
        }
        if (!params.id) {
            return ctx.body = yapi.commons.resReturn(null, 400, '分组id不能为空');
        }
        var check = await groupInst.checkMemberRepeat(params.id, params.member_uid);
        if (check === 0) {
            return ctx.body = yapi.commons.resReturn(null, 400, '分组成员不存在');
        }
        if (await this.checkAuth(params.id, 'group', 'danger') !== true) {
            return ctx.body = yapi.commons.resReturn(null, 405, '没有权限');
        }

        params.role = ['owner', 'dev', 'guest'].find(v => v === params.role) || 'dev';

        try {
            let result = await groupInst.changeMemberRole(params.id, params.member_uid, params.role);
            let username = this.getUsername();
            let rolename = {
                owner: "组长",
                dev: "开发者",
                guest: "访客"
            };
            let groupUserdata = await this.getUserdata(params.member_uid, params.role);
            yapi.commons.saveLog({
                content: `<a href="/user/profile/${this.getUid()}">${username}</a> 更改了分组成员 <a href="/user/profile/${params.member_uid}">${groupUserdata.username}</a> 的权限为 "${rolename[params.role]}"`,
                type: 'group',
                uid: this.getUid(),
                username: username,
                typeid: params.id
            });
            ctx.body = yapi.commons.resReturn(result);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    /**
     * 获取所有项目成员
     * @interface /group/get_member_list
     * @method GET
     * @category group
     * @foldnumber 10
     * @param {String} id 项目分组id
     * @returns {Object}
     * @example
     */

    async getMemberList(ctx) {
        let params = ctx.request.query;
        if (!params.id) {
            return ctx.body = yapi.commons.resReturn(null, 400, '项目id不能为空');
        }

        try {
            let groupInst = yapi.getInst(groupModel);
            let group = await groupInst.get(params.id);
            ctx.body = yapi.commons.resReturn(group.members);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    /**
     * 删除项目成员
     * @interface /group/del_member
     * @method POST
     * @category group
     * @foldnumber 10
     * @param {String} id 项目分组id
     * @param {String} member_uid 项目分组成员uid
     * @returns {Object}
     * @example
     */

    async delMember(ctx) {
        let params = ctx.request.body;
        let groupInst = yapi.getInst(groupModel);
        if (!params.member_uid) {
            return ctx.body = yapi.commons.resReturn(null, 400, '分组成员uid不能为空');
        }
        if (!params.id) {
            return ctx.body = yapi.commons.resReturn(null, 400, '分组id不能为空');
        }
        var check = await groupInst.checkMemberRepeat(params.id, params.member_uid);
        if (check === 0) {
            return ctx.body = yapi.commons.resReturn(null, 400, '分组成员不存在');
        }
        if (await this.checkAuth(params.id, 'group', 'danger') !== true) {
            return ctx.body = yapi.commons.resReturn(null, 405, '没有权限');
        }

        try {
            let result = await groupInst.delMember(params.id, params.member_uid);
            let username = this.getUsername();
            let rolename = {
                owner: "组长",
                dev: "开发者",
                guest: "访客"
            };
            let groupUserdata = await this.getUserdata(params.member_uid, params.role);
            yapi.commons.saveLog({
                content: `<a href="/user/profile/${this.getUid()}">${username}</a> 删除了分组成员 <a href="/user/profile/${params.member_uid}">${groupUserdata.username}</a>`,
                type: 'group',
                uid: this.getUid(),
                username: username,
                typeid: params.id
            });
            ctx.body = yapi.commons.resReturn(result);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    /**
     * 获取项目分组列表
     * @interface /group/list
     * @method get
     * @category group
     * @foldnumber 10
     * @returns {Object}
     * @example ./api/group/list.json
     */
    async list(ctx) {
        try {
            var groupInst = yapi.getInst(groupModel);
            let projectInst = yapi.getInst(projectModel);
            let userInst = yapi.getInst(userModel);
            let result = await groupInst.list();

            let privateGroup = await groupInst.getByPrivateUid(this.getUid());
            let newResult = [];

            if (!privateGroup) {
                privateGroup = await groupInst.save({
                    uid: this.getUid(),
                    group_name: 'User-' + this.getUid(),
                    add_time: yapi.commons.time(),
                    up_time: yapi.commons.time(),
                    type: 'private'
                })
            }


            if (result && result.length > 0) {
                for (let i = 0; i < result.length; i++) {
                    result[i] = result[i].toObject();
                    result[i].role = await this.getProjectRole(result[i]._id, 'group');
                    if (result[i].role !== 'member') {
                        newResult.unshift(result[i]);
                    } else {
                        let publicCount = await projectInst.countWithPublic(result[i]._id);
                        if (publicCount > 0) {
                            newResult.push(result[i]);
                        } else {
                            let projectCountWithAuth = await projectInst.getProjectWithAuth(result[i]._id, this.getUid());
                            if (projectCountWithAuth > 0) {
                                newResult.push(result[i]);
                            }
                        }

                    }
                }
            }
            if (privateGroup) {
                privateGroup = privateGroup.toObject();
                privateGroup.group_name = '个人空间';
                privateGroup.role = 'owner';
                newResult.unshift(privateGroup);
            }

            ctx.body = yapi.commons.resReturn(newResult);
        } catch (e) {
            ctx.body = yapi.commons.resReturn(null, 402, e.message);
        }
    }

    /**
     * 删除项目分组
     * @interface /group/del
     * @method post
     * @param {String} id 项目分组id
     * @category group
     * @foldnumber 10
     * @returns {Object}
     * @example ./api/group/del.json
     */
    async del(ctx) {
        if (this.getRole() !== 'admin') {
            return ctx.body = yapi.commons.resReturn(null, 401, '没有权限');
        }

        try {
            let groupInst = yapi.getInst(groupModel);
            let projectInst = yapi.getInst(projectModel);
            let interfaceInst = yapi.getInst(interfaceModel);
            let interfaceColInst = yapi.getInst(interfaceColModel);
            let interfaceCaseInst = yapi.getInst(interfaceCaseModel);
            let id = ctx.request.body.id;

            if (!id) {
                return ctx.body = yapi.commons.resReturn(null, 402, 'id不能为空');
            }
            let projectList = await projectInst.list(id, true);
            projectList.forEach(async (p) => {
                await interfaceInst.delByProjectId(p._id)
                await interfaceCaseInst.delByProjectId(p._id)
                await interfaceColInst.delByProjectId(p._id)
            })
            if (projectList.length > 0) {
                await projectInst.delByGroupid(id);
            }

            let result = await groupInst.del(id);
            ctx.body = yapi.commons.resReturn(result);
        } catch (err) {
            console.error(err);
            ctx.body = yapi.commons.resReturn(null, 402, err.message);
        }
    }

    /**
     * 更新项目分组
     * @interface /group/up
     * @method post
     * @param {String} id 项目分组id
     * @param {String} group_name 项目分组名称
     * @param {String} group_desc 项目分组描述
     * @category group
     * @foldnumber 10
     * @returns {Object}
     * @example ./api/group/up.json
     */
    async up(ctx) {

        let groupInst = yapi.getInst(groupModel);
        let id = ctx.request.body.id;
        let data = {};
        if (!id) {
            return ctx.body = yapi.commons.resReturn(null, 402, 'id不能为空');
        }
        if (await this.checkAuth(id, 'group', 'danger') !== true) {
            return ctx.body = yapi.commons.resReturn(null, 405, '没有权限');
        }
        try {
            ctx.request.body = yapi.commons.handleParams(ctx.request.body, {
                id: 'number',
                group_name: 'string',
                group_desc: 'string'
            });
            if (!id) {
                return ctx.body = yapi.commons.resReturn(null, 402, 'id不能为空');
            }
            if (!ctx.request.body.group_name) {
                return ctx.body = yapi.commons.resReturn(null, 402, '分组名称不能为空');
            }

            data.group_name = ctx.request.body.group_name;
            data.group_desc = ctx.request.body.group_desc;

            let result = await groupInst.up(id, data);
            let username = this.getUsername();
            yapi.commons.saveLog({
                content: `<a href="/user/profile/${this.getUid()}">${username}</a> 更新了 <a href="/group/${id}">${data.group_name}</a> 分组`,
                type: 'group',
                uid: this.getUid(),
                username: username,
                typeid: id
            });
            ctx.body = yapi.commons.resReturn(result);
        } catch (err) {
            ctx.body = yapi.commons.resReturn(null, 402, err.message);
        }
    }
}

module.exports = groupController;
