define(function (require) {
	'use strict';

	var angular = require('angular');
	var itemsControllerFactory = require('./itemsControllerFactory');
	var inboxController = require('./inboxController');
	var controllers = angular.module('controllers', ['services']);

	// user settings
	controllers.controller('settingsController', require('./settingsController'));

	// items
	controllers.controller('dashboardController', itemsControllerFactory('All Likes'));
	controllers.controller('inboxController', inboxController);
	controllers.controller('githubController', itemsControllerFactory('Github', 'github'));
	controllers.controller('facebookController', itemsControllerFactory('Facebook', 'facebook'));
	controllers.controller('twitterController', itemsControllerFactory('Twitter', 'twitter'));
	controllers.controller('stackoverflowController', itemsControllerFactory('Stackoverflow', 'stackoverflow'));

	// search
	controllers.controller('searchController', require('./searchController'));

	// errors
	controllers.controller('errorController', require('./errorController'));

	return controllers;
});