//渲染引擎
// var debug = require('debug')('http');
var nodeAssert = require('assert');
var nodePath = require('path');
var nodeFs = require('fs');
var nodeUtil = require('util');

var http = require('http');
var qs = require('querystring');
var reg_module = /<(module\:([a-z,A-Z,0-9,\-,\_,\/]+))([^\/]*?)(?:(?:>([\s\S]*)<\/module>)|(?:\/>))/gi;
// var reg_module = /<(module\:([a-z,A-Z,0-9,\-,\_,\/]+))([^\/]*?)(?:(?:>([\s\S]*)<\/\1>)|(?:\/>))/gi;
var reg_module_attrs = /(\w+)=['"]?([^"'\s]+)['"]?/ig;
var reg_def = /<def:([a-z,A-Z,0-9,\-,\_]+)[\s]*?>([\s\S]*?)<\/def>/ig;
var reg_point = /<point:([a-z,A-Z,0-9,\-,\_]+)[\s]*?\/?>/ig;
var reg_scope = /<scope:([^>]+)>/ig;
var art = require('./arttemplate');
var TPLCACHE = {};
var COMPONENTSCACHE = {};
//同步获取静态资源列表



/**
 * [renderPage description]
 * @param  {String}   pageName 页面名称 home,list/shop.html
 * @param  {[type]}   options  [description]
 * @param  {Function} callback [description]
 * @return {[type]}            [description]
*/
function renderPage(pageName, options, callback) {
    var ext = nodePath.extname(pageName);

    // var filePath = nodePath.join(options.settings.views, nodePath.dirname(pageName), file,  file + ext);
    options.pageName = pageName.replace(new RegExp(ext + '$'), '');

    var $cfg = options.settings.$config;

    var data = options,
        cfg = {
            cptDir: $cfg.webCom,
            // 是否开启模板缓存
            cache: $cfg.cache,
            pageName: options.pageName
        };
    try {
        var fileData = {
            syncAssets: [],
            tagCount: 0
        };
        // 文件不存在，则返回异常
        if (!cfg.cptDir) {
            throw new Error('未设置组件目录')
            return;
        }
        cfg.autoAsset = $cfg.autoAsset;
        cfg.projectName = $cfg.name;
        cfg.cdn = $cfg.globalVariables.cdn || '';
        cfg.ver = $cfg.globalVariables.ver || '';
        cfg.assetsUrl = $cfg.globalVariables.assetsUrl || $cfg.globalVariables.cdn;
        var pageObj = getPageInfo(pageName, options, cfg, fileData);
        if (!pageObj) {
            callback(new Error(filePath + ' is not found'), null);
            return;
        }

        // 缓存已过期
        data.$g = $cfg.globalVariables;
        data.$tpldata = fileData;
        data.$ver = $cfg.staticVersion;
        if (cfg.ver) {
            if ((typeof cfg.ver) == 'function') {
                data.$ver = cfg.ver();
            } else {
                data.$ver = cfg.ver;
            }
        }
        //如果有设置了缓存key，则缓存
        // return tpl.code(data);
        //渲染之前 获取静态资源计数器重置

        var tempTpl = pageObj.tpl(data);
        //循环获取静态资源列表
        var syncAssets = data.$tpldata.syncAssets;
        var fnList = [];
        for (var i = 0; i < syncAssets.length; i++) {
            var list = syncAssets[i].data.split(',');
            var type = list.shift();
            fnList.push(getAssets(type, '/'+options.pageName, syncAssets[i].tag, cfg));
        }

        Promise.all(fnList).then(function(result) {
            if (result) {
                for (var i = 0; i < result.length; i++) {
                    if (!result[i].error) {
                        tempTpl = tempTpl.replace(result[i].tag, result[i].data);
                    } else {
                        tempTpl = tempTpl.replace(result[i].tag, "无法获取" + result[i].data);
                    }

                }
                callback(null, tempTpl);
            }

        });

    } catch (err) {
        console.error('Pandora.engine.renderPage:', err);
        callback(err, '模板渲染异常');
    }
}
/**
 * 生成请求函数
 */
function getAssets(type, path, tag, cfg) {

    var promise = new Promise(function(resolve) {
        //建立post请求，比较复杂，todo修改为node组件
        var data = {
            'project': cfg.projectName,
            'type': type,
            'path': path,
            'v': cfg.v
        };

        data = qs.stringify(data);
        //解析静态资源服务器地址
        var reg_cdn = /http:\/\/([^:]*):(\d*)/;
        var group = cfg.assetsUrl.match(reg_cdn);
        var hostName = group[1];
        var port;
        if(group.length<3){
            port = 80;
        }else{
            port = group[2];
        }
        //console.log(group[1]);
        var options = {
            hostname: hostName,
            port: port,
            path: '/get-assets',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
                "Content-Length": data.length
            }
        };
        var req = http.request(options, function(res) {
            res.setEncoding('utf8');
            if (res.statusCode == 200) {
                var body = "";
                res.on('data', function(data) {
                    var req = {
                        tag: tag,
                        data: data
                    }
                    resolve(req);
                }).on('end', function() {

                });
            } else {
                res.on('data', function(data) {
                    resolve(null);
                }).on('end', function() {

                });
            }
        }).on('error', function(e) {
            var req = {
                tag: tag,
                data: path,
                error: e
            };
            resolve(req);
        });
        req.write(data + "\n");
        req.end();

    });
    return promise;
}
// 
/**
 * 检查是否过期
 * @param  {String} filePath 检查文件
 * @return {Boolean} 如果已过期，则返回true
 */
function checkExpire(filePath, cfg) {
    //为设置缓存key或没有缓存，则返回false
    if (!TPLCACHE[filePath] || (TPLCACHE[filePath].mtime - nodeFs.statSync(filePath).mtime != 0)) {
        return true;
    }
    // 依赖的模块对象
    var pageCpts = TPLCACHE[filePath].components;
    var mod;
    var tplPath;
    for (var mname in pageCpts) {
        mod = pageCpts[mname];
        tplPath = nodePath.join(cfg.cptDir, mname,
            nodePath.basename(mname) + '.html');
        // if (mod.mtime - COMPONENTSCACHE[mname].mtime != 0 && ) {
        if (mod.mtime - nodeFs.statSync(tplPath).mtime != 0) {
            return true;
        }
    }
    return true;
}

function getPageInfo(pageName, options, cfg, fileData) {
    var ext = nodePath.extname(pageName);
    var file = nodePath.basename(pageName, ext);

    var filePath = nodePath.join(options.settings.$config.page, nodePath.dirname(pageName), file, file + ext);

    var stat = tryStat(filePath);
    if (!stat || !stat.isFile()) {
        console.error('Page ' + pageName + '(' + filePath + ') is not found!');
        callback(new Error('Page ' + pageName + '(' + filePath + ') is not found!'), null);
        return;
    }
    if (!nodeFs.existsSync(filePath)) {
        return null;
    }
    var pageObj;
    if (cfg.cache == false || checkExpire(filePath, cfg)) {
        var code = processImagePath(nodeFs.readFileSync(filePath).toString(), 'page', cfg.pageName, cfg);
        pageObj = preCompile(code, cfg);
        //设置为自动插入
        if (cfg.autoAsset) {
            //插入静态资源引用标签
            //对componentsList分析
            var pageName = nodePath.basename(filePath, '.html');
            var script = '';
            var css = '';
            //获取模版对应js
            var componentJSList = [];
            for (var i in pageObj.components) {
                componentJSList.push('components/' + i);
            }
            //获取页面js
            componentJSList.push('pages/' + nodePath.basename(filePath, '.html'));
            if (componentJSList.length > 0) {
                for (var i = 0; i < componentJSList.length; i++) {
                    script = script + ' ' + componentJSList[i];
                }
                script = script + '" $$tpldata}}';
            }
            //var jsList = getComponentJs(pageName);
            //在结尾插入引用JS
            pageObj.code = pageObj.code.replace(/{{asset "script"}}/ig, '{{asset "script' + script);
            //在头部尾插入引用css
            pageObj.code = pageObj.code.replace(/{{asset "script"}}/ig, '{{asset "css' + script);
        }

        pageObj.mtime = nodeFs.statSync(filePath).mtime;
        //处理图片的绝对路径
        pageObj.tpl = art.render(processImageAbsPath(pageObj.code, cfg),{
            openTag : options.settings.$config.openTag || '{{',
            closeTag: options.settings.$config.closeTag || '}}'
        });
        TPLCACHE[filePath] = pageObj;
        console.info('noCache', filePath);
    } else {
        pageObj = TPLCACHE[filePath];
        console.info('Cached', filePath);
    }
    return pageObj;
}

function preCompile(code, cfg) {
    if (!code) {
        throw new Error('Pandora.engine: perCompile param "code" is undefined');
    }
    var count = 0;
    var hasScope = false;
    var componentsList = {};
    while (reg_module.test(code)) {
        if (++count == 1000) {
            console.error('astro.engine-->出现模块相互引用\n' + code)
            return '<div class="mo-error">Module循环引用超过100次</div>';
        }
        code = code.replace(reg_module, function(fullCode, modstr, modName, attrs, modcontent) {
            /*
                <moduel:layout title="title">hello</module:layout>
                ------
                modcode = <moduel:layout title="title">hello</module:layout>
                modstr  = moduel:layout
                modname = layout
                attrs   = title="title"
                modcontent = hello    // <module:header />   ==>> modcontent is undefined
             */
            var retStr = '';
            var modCode;
            var modPath = nodePath.join(cfg.cptDir, modName, nodePath.basename(modName) + '.html');
            if (!nodeFs.existsSync(modPath)) {
                console.error('astro.template-->未找到 ' + modName + ' 模块,' + modPath);
                modCode = '';
            } else {
                modCode = processImagePath(nodeFs.readFileSync(modPath).toString(), 'webCom', modName, cfg);

                COMPONENTSCACHE[modName] = {
                    mtime: nodeFs.statSync(modPath).mtime
                };
                componentsList[modName] = {
                    mtime: COMPONENTSCACHE[modName].mtime,
                    path: modPath
                };
            }
            if (modCode) {
                //不是闭合标签，中间有内容
                var defined = modcontent ? getDefined(modcontent) : {};
                var hasPoint;
                hasScope = false;
                // 实现scope，转换字段指向
                if (reg_module_attrs.test(attrs)) {
                    var attrHash = {};
                    attrs.replace(reg_module_attrs, function(str, name, value) {
                        attrHash[name] = value;
                    });
                    if (attrHash.scope) {
                        hasScope = true;
                        retStr += '{{var ' + attrHash.scope + '}}';
                    }
                }
                // 替换插入点
                retStr += modCode.replace(reg_point, function(str, name) {
                    if (defined[name]) {
                        return defined[name];
                    } else {
                        // 没有实现插入点时，则替换把内容替换到第一个 point中
                        if (isEmpty(defined) && !hasPoint) {
                            hasPoint = true;
                            return modcontent;
                        }
                    }
                    hasPoint = true;
                    return '<!-- error: point:' + name + ' is not defined; modname is' + modName + ' -->';
                });
                //没有插入点，则替换 <point:default>
                var hasDefaultPoint;
                if (!hasPoint) {
                    // retStr += modCode.replace(/<point-default[^>]*?\/?>/ig, function() {
                    //     hasDefaultPoint = true;
                    //     return modcontent || '';
                    // });
                    // if(!hasDefaultPoint){
                    //     console.error('astro.template-->模块' + modname + '没有引用插入点');
                    // }
                }
                if (hasScope) {
                    retStr = retStr + '{{/var}}';
                }
                return retStr;
            } else {
                return '<div class="mo-error">未找到模块:' + modname + '</div>';
            }
        });
    };
    // var scopes = [];
    code = code.replace(/<scope:(\S+=\S+)>/ig, function(a, c) {
        // scopes.push(c);
        return '{{var ' + c + '}}'
    });
    code = code.replace(/<\/scope>/ig, '{{/var}}');
    //

    return {
        code: code,
        components: componentsList
    };
}
//获取模块引用的js
// function getComponentJs(filePath) {
//     //获取模块名
//     var name = nodePath.basename(filePath, '.html');
//     var jsFile = nodePath.join(nodePath.dirname(filePath),name+'.js');
//     //nodePath.relative(from, jsFile);
//     if(nodeFs.existsSync(jsFile)){

//         return jsFile;
//     }else{
//         return false;
//     }
// }



function getDefined(code) {
    var defined = {};
    var blocks = {};
    var gid = Date.now();

    // 匹配 def 标签时，防止出现def中有block，且block中有def的情况
    // <block:b1>
    //  <def:p1>
    //      <block:b2>
    //          <def:p1>
    //          </def>
    //      </block>
    //  </def>
    // </block>
    code = code.replace(reg_module, function(a,b){
        blocks['$__' + ++gid + '__'] = a;
        return '$__' + gid + '__'
    });

    code.replace(reg_def, function(code, name, ctx) {
        defined[name] = ctx.replace(/\$__\d+__/ig, function(a){
            return blocks[a]?blocks[a]:a
        });
        return code;
    });
    return defined
}


function isEmpty(obj) {
    for (var i in obj) {
        return false;
    }
    return true;
}
//自定义模版方法 获取js
art.helper('asset', function(mods, tpldata) {
    var data = {}
    data.tag = '<$asset ' + tpldata.tagCount + '/>';
    data.data = mods;
    tpldata.tagCount++;
    tpldata.syncAssets.push(data);
    return data.tag;
});


var Engine = function(pan) {
    this.pan = pan;
};

module.exports = {
    renderPage: renderPage,
    // renderFile: renderFile,
    getPageInfo: getPageInfo,
    extend: function() {
        art.helper.apply(null, arguments);
    }
};

function tryStat(path) {
    try {
        return nodeFs.statSync(path);
    } catch (e) {
        console.log(e);
        return undefined;
    }
}


function processImageAbsPath(code, cfg) {
    if (!code) {
        return 'null';
    }
    // code = code.replace(/isrc=[\'\"]?(?!http)~(.*?)/g, function(str, imgpath) {
    //     return nodeUtil.format('src="%s%s', cfg.cdn, imgpath);
    // });
    return code
}

function processImagePath(code, type, name, cfg) {
    var m_dir_hash = {
        'page': 'p',
        'webCom': 'webcom',
        'jsCom': 'jscom'
    };
    if (!code) {
        return 'null';
    }
    if (m_dir_hash[type]) {
        /*
         if(name == 'list-items'){
             console.log(type, name);
             console.log(code);
         }
        */ 
        code = code.replace(/\$res\(([^\'\"@]+)\)/g,
            function(str, imgpath) {
                if (imgpath.indexOf('~') == 0) {
                    return nodeUtil.format('%s%s', cfg.cdn, imgpath.substr(1));
                }
                return nodeUtil.format('%s/img/%s/%s/%s', cfg.cdn, m_dir_hash[type], name, imgpath);
            });
    }
    return code;
}