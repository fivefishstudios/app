define(function (require) {
	'use strict';

	require('ngRoute');
	require('ngAnimate');
	require('ngDialog');
	require('./services/services');
	require('./controllers/controllers');
	require('./directives/directives');

	var angular = require('angular');
	var app = angular.module('likeastore', ['ngRoute', 'ngAnimate', 'ngDialog', 'services', 'controllers', 'directives']);

	app.init = function () {
		angular.bootstrap(document, ['likeastore']);
	};

	app.config(['$routeProvider', '$locationProvider', '$httpProvider',
		function ($routeProvider, $locationProvider, $httpProvider) {
			$httpProvider.interceptors.push('httpInterceptor');

			$routeProvider
				.when('/', { templateUrl: 'partials/dashboard', controller: 'dashboardController' })
				.when('/all', { templateUrl: 'partials/dashboard', controller: 'dashboardController' })
				.when('/inbox', { templateUrl: 'partials/dashboard', controller: 'inboxController' })
				.when('/facebook', { templateUrl: 'partials/dashboard', controller: 'facebookController' })
				.when('/github', { templateUrl: 'partials/dashboard', controller: 'githubController' })
				.when('/vimeo', { templateUrl: 'partials/dashboard', controller: 'vimeoController' })
				.when('/youtube', { templateUrl: 'partials/dashboard', controller: 'youtubeController' })
				.when('/dribbble', { templateUrl: 'partials/dashboard', controller: 'dribbbleController' })
				.when('/behance', { templateUrl: 'partials/dashboard', controller: 'behanceController' })
				.when('/twitter', { templateUrl: 'partials/dashboard', controller: 'twitterController' })
				.when('/stackoverflow', { templateUrl: 'partials/dashboard', controller: 'stackoverflowController' })
				.when('/search', { templateUrl: 'partials/dashboard', controller: 'searchController' })
				.when('/settings', { templateUrl: 'partials/settings', controller: 'settingsController' })
				.when('/ooops', { templateUrl: 'partials/dashboard', controller: 'errorController' })
				.otherwise({ redirectTo: '/' });

			$locationProvider.html5Mode(true);
		}
	]);

	app.run(function ($window, auth, user, intercom) {
		auth.setAuthorizationHeaders();
		user.initialize();
		intercom.boot();
	});

	return app;
});