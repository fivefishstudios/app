var _ = require('underscore');
var async = require('async');
var moment = require('moment');

var config = require('../../config');
var db = require('../db')(config);
var elastic = require('../elastic')(config);

var users = require('./users');

var ObjectId = require('mongojs').ObjectId;

var userPickFields = ['_id', 'avatar', 'bio', 'displayName', 'email', 'location', 'name', 'username', 'website'];
var itemOmitFields = ['collections', 'userData'];
var collectionOmitFields = ['items'];
var notifier = require('./notifier');

function transform(collection) {
	var clone = _.clone(collection);
	var count = (collection.items && collection.items.length) || 0;
	var followers = (collection.followers && collection.followers.length) || 0;

	return _.omit(_.extend(clone, {count:  count, followersCount: followers}), collectionOmitFields);
}

function create(user, collection, callback) {
	async.waterfall([
		createCollection,
		notifyFollowers,
		saveToElastic
	], callback);

	function createCollection(callback) {
		collection.user = user.email;
		collection.userData = _.pick(user, userPickFields);
		collection.date = moment().toDate();

		if (!collection.public) {
			collection.public = false;
		}

		db.collections.save(collection, callback);
	}

	function notifyFollowers(collection, callback) {
		if (collection.public) {
			notifier('collection created', user, {collection: collection._id});
		}

		callback(null, collection);
	}

	function saveToElastic(collection, callback) {
		elastic.index({index: 'collections', type: 'collection', id: collection._id.toString(), body: collection}, function (err) {
			// TODO: What about error?

			callback(null, collection);
		});
	}
}

function remove(user, collection, callback) {
	if (!collection) {
		return callback({message: 'missing collection id', status: 412});
	}

	collection = new ObjectId(collection);

	async.waterfall([
		removeCollectionFromItems,
		removeCollection
	], callback);

	function removeCollectionFromItems(callback) {
		db.items.findAndModify({
			query: {user: user.email, collections: {$elemMatch: {id: collection}}},
			update: {$pull: {collections: {id: collection}}}
		}, function (err) {
			callback(err);
		});
	}

	function removeCollection(callback) {
		db.collections.remove({_id: collection}, callback);
	}
}

function find(user, callback) {
	db.collections.find({user: user.email}, function (err, collections) {
		if (err) {
			return callback(err);
		}

		callback(null, collections);
	});
}

function findOne(user, collection, callback) {
	db.collections.findOne({_id: new ObjectId(collection)}, function(err, collection) {
		if (err) {
			return callback(err);
		}

		if (!collection) {
			return callback({message: 'collection not found', status: 404});
		}

		callback(null, collection);
	});
}

function findByUser(userName, callback) {
	users.findByName(userName, function (err, user) {
		if (err) {
			return callback(err);
		}

		if (!user) {
			return callback({message: 'user not found', username: userName, status: 404});
		}

		find(user, function (err, collections) {
			if (err) {
				return callback(err);
			}

			var public = collections.filter(function (c) {
				return c.public === true;
			});

			callback(null, public);
		});
	});
}

function addItem(user, collection, item, callback) {
	if (!collection) {
		return callback({message: 'missing collection id', status: 412});
	}

	if (!item) {
		return callback({message: 'missing item id', status: 412});
	}

	async.waterfall([
		findCollection,
		putCollectionIdToItem,
		putItemToCollection,
		notifyFollowers
	], callback);


	function findCollection(callback) {
		db.collections.findOne({user: user.email, _id: new ObjectId(collection)}, callback);
	}

	function putCollectionIdToItem(collection, callback) {
		db.items.findAndModify({
			query: {_id: new ObjectId(item)},
			update: {$addToSet: {collections: {id: collection._id}}}
		}, function (err, item) {
			if (err) {
				return callback(err);
			}

			callback(err, item, collection);
		});
	}

	function putItemToCollection(item, collection, callback) {
		var exists = _.find(collection.items, function (i) {
			return i._id.equals(item._id);
		});

		if (exists) {
			return callback(null, null, collection);
		}

		var extended = _.extend(item, {added: moment().toDate()});

		var updateCollectionQuery = {
			$addToSet: {items: _.omit(extended, itemOmitFields)}
		};

		if (item.thumbnail && !collection.thumbnail) {
			updateCollectionQuery = _.extend(updateCollectionQuery, {
				$set: {thumbnail: item.thumbnail}
			});
		}

		db.collections.findAndModify({
			query: {user: user.email, _id: collection._id},
			update: updateCollectionQuery
		}, function (err) {
			callback(err, item, collection);
		});
	}

	function notifyFollowers(item, collection, callback) {
		if (item) {
			notifier('collection item added', user, {item: item._id, collection: collection._id});
		}

		callback(null, item, collection);
	}
}

function removeItem(user, collection, item, callback) {
	if (!collection) {
		return callback({message: 'missing collection id', status: 412});
	}

	if (!item) {
		return callback({message: 'missing item id', status: 412});
	}

	async.waterfall([
		pullItemFromCollection,
		pullCollectionFromItem
	], callback);

	function pullItemFromCollection(callback) {
		db.collections.findAndModify({
			query: {user: user.email, _id: new ObjectId(collection)},
			update: {$pull: {items: {_id: new ObjectId(item)}}}
		}, callback);
	}

	function pullCollectionFromItem(collection) {
		db.items.findAndModify({
			query: {_id: new ObjectId(item)},
			update: {$pull: {collections: {id: collection._id}}}
		}, callback);
	}
}

function findItems(user, collection, paging, callback) {
	if (!collection) {
		return callback({message: 'missing collection id', status: 412});
	}

	var page = paging.page || 1;

	db.collections.aggregate([
		{
			$match: {_id: new ObjectId(collection)}
		},
		{
			$unwind: '$items'
		},
		{
			$project: {
				_id: 0,
				item: '$items',
				collection: {
					_id: '$_id',
					title: '$title',
					description: '$description',
					owner: '$userData'
				}
			}
		},
		{
			$sort: { 'item.added': -1 }
		},
		{
			$skip: paging.pageSize * (page - 1)
		},
		{
			$limit: paging.pageSize
		}
	], function (err, items) {
		items = (items && items.map(function (i) {
			return _.extend(i.item, {collection: i.collection});
		})) || [];

		callback(null, {data: items, nextPage: items.length === paging.pageSize});
	});
}

function update(user, collection, patch, callback) {
	if (!collection) {
		return callback({message: 'missing collection id', status: 412});
	}

	db.collections.findOne({user: user.email, _id: new ObjectId(collection)}, function (err, collection) {
		if (err) {
			return callback(err);
		}

		if (!collection) {
			return callback({message: 'collection not found', status: 404});
		}

		patch = _.extend(collection.properties || {}, patch);

		db.collections.findAndModify({
			query: {user: user.email, _id: collection._id},
			update: {$set: patch},
			'new': true
		}, function (err, collection) {
			if (collection.public) {
				notifier('collection created', user, {collection: collection._id});
			}

			callback(err, collection);
		});
	});
}

function follow(user, collection, callback) {
	if (!collection) {
		return callback({message: 'missing collection id', status: 412});
	}

	async.waterfall([
		checkCollection,
		followCollection,
		updateOwner,
		updateUser,
		notifyOwner
	], callback);

	function checkCollection(callback) {
		db.collections.findOne({_id: new ObjectId(collection)}, function (err, collection) {
			if (err) {
				return callback(err);
			}

			if (!collection) {
				return callback({message: 'collection not found', status: 404});
			}

			if (!collection.public) {
				return callback({message: 'can\'t follow private collection', status: 403 });
			}

			if (collection.user === user.email) {
				return callback({message: 'can\'t follow own collection', status: 403});
			}

			callback(null, collection);
		});
	}

	function followCollection(collection, callback) {
		db.collections.findAndModify({
			query: {_id: collection._id},
			update: { $addToSet: { followers: _.pick(user, userPickFields) }}
		}, function (err, collection) {
			callback(err, collection);
		});
	}

	function updateOwner(collection, callback) {
		db.users.findAndModify({
			query: {_id: collection.userData._id },
			update: { $addToSet: { followed: _.pick(user, userPickFields) }}
		}, function (err) {
			callback(err, collection);
		});
	}

	function updateUser(collection, callback) {
		db.users.findAndModify({
			query: {email: user.email},
			update: {$addToSet: {followCollections: {id: collection._id}}}
		}, function (err, user) {
			callback(err, user, collection);
		});
	}

	function notifyOwner(user, collection, callback) {
		notifier('collection followed', user, {follower: user._id, collection: collection._id}, callback);
	}
}

function unfollow(user, collection, callback) {
	if (!collection) {
		return callback({message: 'missing collection id', status: 412});
	}

	async.waterfall([
		checkUser,
		unfollowCollection,
		updateOwner,
		updateUser
	], callback);

	function checkUser(callback) {
		db.collections.findOne({_id: new ObjectId(collection)}, function (err, collection) {
			if (err) {
				return callback(err);
			}

			if (!collection) {
				return callback({message: 'collection not found', status: 404});
			}

			if (collection.user === user.email) {
				return callback({message: 'can\'t unfollow own collection', status: 403});
			}

			callback(null, collection);
		});
	}

	function unfollowCollection(collection, callback) {
		db.collections.findAndModify({
			query: {_id: collection._id},
			update: { $pull: { followers: _.pick(user, userPickFields) }}
		}, function (err, collection) {
			callback(err, collection);
		});
	}

	function updateOwner(collection, callback) {
		db.users.findAndModify({
			query: {_id: collection.userData._id },
			update: { $pull: { followed: _.pick(user, userPickFields) }}
		}, function (err) {
			callback(err, collection);
		});
	}

	function updateUser(collection, callback) {
		db.users.findAndModify({
			query: {email: user.email},
			update: {$pull: {followCollections: {id: collection._id}}}
		}, callback);
	}
}

function followedBy(user, name, callback) {
	users.findByName(name, function (err, user) {
		if (err) {
			return callback(err);
		}

		var follows = user.followCollections;

		if (!follows || follows.length === 0) {
			return callback(null, []);
		}

		var ids = follows.map(function (f) {
			return f.id;
		});

		db.collections.find({_id: {$in: ids}}, function (err, collections) {
			if (err) {
				return callback(err);
			}

			callback(null, collections);
		});
	});
}

function popular(user, callback) {
	var collections = [
		// promoted in promo-w29
		new ObjectId('539e0ac5e45b300f00000037'),
		new ObjectId('53ab2bba43fa2f1200000001'),
		new ObjectId('53369916d195760e00000015'),
		new ObjectId('533e78ce84bb1c0c0000000a'),
		new ObjectId('534faf1b83902b140000000c'),

		// promoted in promo-w30
		new ObjectId('53a03c550648690f00000001'),
		new ObjectId('5355252fedce3c0c00000001'),
		new ObjectId('5387808d9f86a70e00000008'),
		new ObjectId('535123356c39511000000001'),
		new ObjectId('535e0b4ebc7cb00e0000000d'),

		// promoted in promo-31

		new ObjectId('53cfc734378cd61000000001'),
		new ObjectId('53ccc26bcf3c83120000000f'),
		new ObjectId('53b837bac1d2e81000000016'),
		new ObjectId('533902f1d195760e0000001e'),
		new ObjectId('5357bc507e21761000000002'),

		// promoted in promo-32

		new ObjectId('53cddd71cf3c831200000012'),
		new ObjectId('53db70d791f4860c00000002'),
		new ObjectId('531ae57979fd7b0d0000002b'),
		new ObjectId('5336995fd195760e00000017'),
		new ObjectId('53a93c10aa267c0d00000003'),

		// promoted in promo-33

		new ObjectId('53e92b90b00d0a0f00000013'),
		new ObjectId('53e5ee9cb00d0a0f00000011'),
		new ObjectId('53e1353728a92e0f00000003'),
		new ObjectId('535a31e7813b3a0f00000004'),
		new ObjectId('53aa778b4727030d00000006'),

		// promoted in promo-34

		new ObjectId('53f1416c0b0e941400000012'),
		new ObjectId('53ee08d50b0e941400000003'),
		new ObjectId('53552540edce3c0c00000002'),
		new ObjectId('531f870049e12d0d0000000f'),
		new ObjectId('539819f5e45b300f00000026'),

		// promoted in promo-35
		new ObjectId('53a93bebaa267c0d00000001'),
		new ObjectId('531e32859a9b500c00000078'),
		new ObjectId('531ae71679fd7b0d0000002c'),
		new ObjectId('539ea335e45b300f00000039'),
		new ObjectId('534399aa19979c0b00000026')
	];

	db.collections.find({_id: {$in: collections}}, function (err, collections) {
		if (err) {
			return callback(err);
		}

		collections = _.sortBy(collections, function (collection) {
			return collection.followers && collection.followers.length * (-1);
		});

		callback(null, collections);
	});
}

function resolve(ids, callback) {
	db.collections.find({_id: {$in: ids}}, function (err, collections) {
		if (err) {
			return callback(err);
		}

		collections = collections.map(transform);

		callback(null, collections);
	});
}

module.exports = {
	create: create,
	remove: remove,
	find: find,
	findOne: findOne,
	findByUser: findByUser,
	addItem: addItem,
	removeItem: removeItem,
	findItems: findItems,
	update: update,
	follow: follow,
	unfollow: unfollow,
	followedBy: followedBy,
	popular: popular,
	resolve: resolve,
	transform: transform
};
