'use strict';

var fs = require('fs');
var path = require('path');
var express = require('express');
var extend = require('extend');
var Q = require('q');
var jade = require('jade');



var defaults = {
	configId: 'mvc',
	ctrlFileName: 'ctrl.js',
	viewFileName: 'view.jade',
	reqParamsAttr: 'mvcParams',
	paramPrefix: '-'
};



var defaultConfig = {
	path: './mvc',
	baseRoute: '/'
};

module.exports = function() {

	var that = this;


	this.config(function(router) {
		router.engine('.jade', jade.__express);
	});




	if( this._config[defaults.configId] ) {
		var config = this._config[defaults.configId];


		// Walk config and create api-routes for each item
		Object.keys(config).forEach(function(item) {

			that.run(function(router, extend, inject) {

				var args = extend(true, {}, defaultConfig, config[item]);

				var apiPath = path.resolve( that.cwd(), args.path);

				inject( dir2router(apiPath) ).then(function(apiRouter) {
					router.use(args.baseRoute, apiRouter);
				}, function(err) {
					console.log(err.message.red);
				});

			});

		});

	}

};




function dir2router(dir) {

	return function(inject) {
		var router = express.Router();
		var subFolders = [];
		var controller = {};

		fs.readdirSync(dir).forEach(function(item) {
			if(item.substr(0, 1) !== '.') {
				var itemPath = path.join(dir, item);
				var stat = fs.statSync(itemPath);

				if(stat.isDirectory()) {
					if(item.substr(0, 1) === defaults.paramPrefix) {
						subFolders.push(itemPath);
					} else {
						subFolders.unshift(itemPath);
					}
				}
			}
		});


		var ctrlFile = path.join(dir, defaults.ctrlFileName);
		if( fs.existsSync( ctrlFile ) ) {
			extend(true, controller, require( ctrlFile ));
		}


		function createCtrlHander(method, route, handler) {
			if(handler) {
				router[method].apply(router, [route, function(req, res, next) {

					inject( handler , {
						req: req,
						res: res,
						params: req[defaults.reqParamsAttr]
					}).then(function(result) {

						resolvePromiseObject(result || {})
						.then(function(scope) {
							req.scope = req.scope || {};
							extend(true, req.scope, scope);
							next();
						});

					});

				}]);
			}
		}

		function createViewHandler(method, route, handler, viewFile) {
			viewFile = viewFile || ((handler) ? (handler.view || defaults.viewFileName) : defaults.viewFileName);
			viewFile = path.join(dir, viewFile);

			if( fs.existsSync(viewFile) ) {
				router[method].apply(router, [route, function(req, res) {
					res.render( viewFile, req.scope );
				}]);
			}
		}


		createCtrlHander('all', '/', controller.all);
		createCtrlHander('get', '/', controller.get);
		createCtrlHander('put', '/', controller.put);
		createCtrlHander('post', '/', controller.post);
		createCtrlHander('delete', '/', controller.delete);

		createCtrlHander('all', '/', controller.all);
		createViewHandler('get', '/', controller.get);
		createViewHandler('put', '/', controller.put);
		createViewHandler('post', '/', controller.post);
		createViewHandler('delete', '/', controller.delete);


		// Create subRouters and use them in router

		subFolders.forEach(function(dir) {
			var resourceName = path.basename(dir);


			if(resourceName.substr(0, 1) === defaults.paramPrefix) {
				var paramName = resourceName.substr(1);
				resourceName = ':' + paramName;

				router.param(paramName, function(req, res, next, value) {
					req[defaults.reqParamsAttr] = req[defaults.reqParamsAttr] || {};

					req[defaults.reqParamsAttr][paramName] = value;

					next();
				});
			}

			router.use('/' + resourceName, dir2router(dir)(inject));
		});

		return router;
	};

};





function resolvePromiseObject(object) {

	var promises = [];

	Object.keys(object).forEach(function(key) {

		var item = object[key];

		var promise = Q.when( item )
		.then(function(value) {
			return {
				key: key,
				value: value
			};
		});

		promises.push( promise );
	});

	return Q.allSettled(promises)
	.then(function(results) {

		var scope = {};
		results.forEach(function(result) {
			scope[result.value.key] = result.value.value;
		});

		return scope;
	});

}


