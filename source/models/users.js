var config = require('../../config');
var db = require('../db')(config);

var ObjectId = require('mongojs').ObjectId;

function findById (id, callback) {
	if (typeof id === 'string') {
		id = new ObjectId(id);
	}

	db.users.findOne({ _id: id }, function (err, user) {
		if (err) {
			return callback(err);
		}

		callback(null, user);
	});
}

function findByEmail (email, callback) {
	db.users.findOne({ email: email }, function (err, user) {
		if (err) {
			return callback(err);
		}

		if (!user) {
			return callback({message: 'User not found', status: 404});
		}

		callback(null, user);
	});
}

function findByRequestToken (requestToken, callback) {
	db.users.findOne({ twitterRequestToken: requestToken }, function (err, user) {
		if (err) {
			return callback(err);
		}

		if (!user) {
			return callback({message: 'User not found', status: 404});
		}

		callback(null, user);
	});
}

function updateUser(email, attributes, callback) {
	db.users.findAndModify({
		query: { email: email },
		update: { $set: attributes },
		'new': true
	}, callback);
}

function deactivate(email, callback) {
	db.users.findAndModify({
		query: { email: email },
		update: { $set: { deactivated: true } },
		'new': true
	}, callback);
}

module.exports = {
	findById: findById,
	findByEmail: findByEmail,
	update: updateUser,
	findByRequestToken: findByRequestToken,
	deactivate: deactivate
};