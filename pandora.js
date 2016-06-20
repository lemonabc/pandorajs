var nodePath = require('path');
var nodeFs = require('fs');
var bodyParser = require('body-parser');

var engine = require('./lib/engine');
var util = require('lang-utils');
// 页面缓存
module.exports = function() {
    return new pan();
}

var pan = function(argument) {
    this.$data = {};
};
pan.prototype = {
    set: function(name, val) {
        this.$data[name] = val;
    },
    get: function(name, val) {
        return this.$data[name];
    },
    /**
     * 初始化App
     * @param  {Express} app    
     * @param  {String|Object} 站点根目录或配置
     * @return {[type]}         [description]
     */
    init: function(app, options) {
        var self = this;
        if(typeof options == 'string')
        {
            var root = options;
            options = require(nodePath.join(root, 'config', 'site'));
            options.root = root;
        }
        if(!options.root){
            throw new Error('pandora.init: please set site root');
        }
        var defaultCfg = {
            root: options.root,
            routes: nodePath.join(options.root, 'routes'),
            openTag:'{{',
            closeTag:'}}',
            cache: true,
            globalVariables: {},
            autoAsset: false,
            webCom: nodePath.join(options.root, 'components'),
            page: nodePath.join(options.root, 'pages'),
            assets: nodePath.join(options.root, 'assets'),
            jsCom: nodePath.join(options.root, 'assets', 'jslib'),
            lessLib: nodePath.join(options.root, 'assets', 'less'),
            staticVersion: ''
        };

        var $projectConfig = Object.assign(defaultCfg, options);

        //是否自动插入静态资源引用

        app.engine('html', self.render);
        app.set('view engine', 'html');
        app.set('views', $projectConfig.page);
        app.set('$config', $projectConfig);

        //TODO remove
        app.use(function(req, response, next){
            app.set('hostname', req.hostname);
            next();
        });

        setViewLookUp(app);

        //post相关处理
        // for parsing application/json
        // app.use(bodyParser.json()); 
        // for parsing application/x-www-form-urlencoded
        // app.use(bodyParser.urlencoded({ extended: true })); 
        // for parsing multipart/form-data

        var _plugin = {};
        this.plugin = function(type, action, cbl) {
            var plugs = util.getObjValue(_plugin, [type, action].join(".")) || [];
            if (util.isArray(type)) {
                this.plugin.apply(this, type);
                return;
            }
            if (arguments.length > 2) {
                plugs.push(cbl);
                util.setObjValue(_plugin, [type, action].join("."), plugs)
                return;
            }
            return (function(type, action) {
                return function() {
                    var plugs = util.getObjValue(_plugin, [type, action].join(".")) || [];
                    var self = this,
                        args = arguments;
                    var ret = args[args.length - 1];
                    plugs.forEach(function(plug, index){
                        ret = plug.apply(self, args);
                        args[args.length - 1] = ret
                        if (util.isUndefined(ret)) {
                            console.warn(nodeUtil.format('********\nplugin.%s.%s detail:\n%s\n********', type, action, plug.toString()));
                        }
                    });
                    return ret;
                }
            }(type, action));
        }

        // 绑定路由
        useMiddleware(app, $projectConfig.routes);
    },
    render: function(pageName, options, callback) {
        /* this object is:
            { 
                defaultEngine: 'html',
                ext: '.html',
                name: 'index',
                root: './pages',
                engine: [Function],
                path: '/Users/tick/Documents/2.Projects/express-astro/pages/index/index.html' 
            }
        */
        //TODO remove
        //未设置CDN时，自动设置静态资源服务器地址
        if(!options.settings.$config.globalVariables.cdn){
            options.settings.$config.$autoCdn = true;
        }
        if(options.settings.$config.$autoCdn){
            var stCfg = require(nodePath.join(options.settings.$config.root,
                'config', 'static.js'));

            options.settings.$config.globalVariables.cdn = 'http://' + options.settings.hostname + ':' +
                stCfg.port+(stCfg.cdnPrefix?stCfg.cdnPrefix:'');

        }

        engine.renderPage(pageName, options, callback);
    },
    engine: engine
}

function setViewLookUp(app) {
    var v = app.get('view');
    //绑定 视图的查找模板事件
    var lookup = v.prototype.lookup;
    v.prototype.lookup = function(name) {
        return name; //
        /*        
                var path = lookup.apply(this, [name]);
                if (!path) {
                    var roots = [].concat(this.root);
                    // debug('lookup "%s"', name);
                    for (var i = 0; i < roots.length && !path; i++) {
                        var root = roots[i];

                        // resolve the path
                        var loc = nodePath.resolve(root, name);
                        var dir = nodePath.dirname(loc);
                        var file = nodePath.basename(loc, this.ext);
                        // resolve the file
                        path = nodePath.join(dir, file, file+ this.ext);
                        var stat = tryStat(path);

                        if (stat && stat.isFile()) {
                            return path;
                        }
                    }
                }
                return path;
        */
    };
}

/**
 * 绑定页面路由
 * @param  {Express} app express实例
 * @param  {string} dir  路由文件所在目录
 */
function useMiddleware(app, dir) {
    var fileList = [],
        folderList = [];
    // 获取pages目录下文件夹列表
    var files = nodeFs.readdirSync(dir);
    // 遍历每个文件
    files.forEach(function(file) {
        var filePath = nodePath.join(dir, file);
        if (nodeFs.statSync(filePath).isDirectory()) {
            // 遍历目录
            useMiddleware(app, filePath);
        } else if (nodePath.extname(filePath) == '.js') {
            // 获取JS文件
            try {
                //存在对应js文件判断为可用页面，挂在到总路由
                app.use(require(filePath));
            } catch (err) {
                console.error('\npandorajs: load route error','\n',
                    'file:\t'+filePath,'\nerror:\t',err);
            }
        }
    });
}

function tryStat(path) {
    try {
        return nodeFs.statSync(path);
    } catch (e) {
        return undefined;
    }
}