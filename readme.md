
### 模块话的前端开发方案及和Nodejs结合的静态服务器方案

页面 = 模块1 + 模块2 + 。。。 + 页面自身内容

模块 = HTML + Javascript + LESS

页面结构 = 模块1的HTML + 模块2的HTML + 。。。 + 页面本身HTML


### 开发环境
* assets 		`静态资源目录`
* components `模块`
	* footer
		* footer.html
		* footer.js
		* footer.less
* 页面路由	`routes`该页面下的路由会被自动挂载
* tpls		`视图模板`
	* home
		* home.html
		* home.js
		* home.css
	* about
		* about.html
		* about.js
		* about.css

### 资源请求路径
#### 传统方案
	version = 20150826162931
	cdn/version/js/p/home.js
	cdn/version/css/p/home.css
	cdn/version/img/home/bar.png
	cdn/version/img/logo.png

* **导出文件MD5的JSON文件**
* **导出Grunt配置文件** 

#### 动态合并方案
* css<br/>
	{{style mod/header,mod/footer,tpl/home/home }}<br/> -->
	static/api?p=m.etaoshi.com&v=version&css=mod/header,mod/footer,tpl/home/home
	cdn/rel/version/js/j8dkjJjsdf.css	
		
* js<br/>
	cdn/rel/version/img/s1j42kj420f.js -->  ?p=m.etaoshi.com&v=version&js=mod/header,mod/footer,tpl/home/home

* img</br>
	cdn/rel/version
	


### 多项目开发[静态资源服务器]
	var projects = {
		m.etaoshi.com : {
				component:'',		//组件目录
				tpl: '',			//页面目录	
				jsCom: '',		//JS组件目录
				less: '',			//LESS类库目录
				realease: '',		//资源发布目录
		}
	};

	var ast = astro();
	for(var prj in projects){
		ast.configProject(prj, projects[prj]);
	}
	
	ast.listen(3000);
	
#### 静态服务器目录
* routes
	* api.js 提供内网访问的获取图片、CSS、和JS引用路径<br>
	<pre>
		**参数**
		p:项目名称
		v:版本号
		t:img|css|js
		f:文件路径
		**响应**
		?p=tuan&v=<span style="color:red">1</span>&t=img&f=/img/p/home/banner.jpg
		-->/**1**/p/home/banner.jpg
		如果文件无变化，则返回依旧返回上次版本的引用路径
		?p=tuan&v=<span style="color:red">2</span>&t=img&f=/img/p/home/banner.jpg
		-->/**1**/p/home/banner.jpg
		文件有变化
		?p=tuan&v=<span style="color:red">2</span>&t=img&f=/img/p/home/banner.jpg
		-->/**2**/p/home/banner.jpg
		**回滚**
		同理
		
	</pre>

* m.etaoshi.com
	* version
		* 图片资源
		* /css/img/p/banner1.8j4h4h.png
		* /css/img/m/loc.8j4h4h.png
		* 传统方案
		* /js/p/home.j23j4hd.js
		* /css/p/home.8j4h4h.css
		* /css/p/home.8j4h4h.css
		* 动态合并方案
		* tpl
		* component
		* jslib
		* rel
* tuan.etaoshi.com
	* version