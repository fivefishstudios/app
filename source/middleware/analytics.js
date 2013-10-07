var analytics = require('../utils/analytics');
var logger = require('../utils/logger');

function track(event, data) {
	return function (req, res, next) {
		if (data && data.param) {
			data[data.param] = req.params[data.param];
			delete data.param;
		}

		if (data && data.query) {
			data[data.query] = req.query[data.query];
			delete data.query;
		}

		analytics(event, data, function (err) {
			if (err) {
				logger.error({message: 'analytics event post error', err: err});
			}
		});

		next();
	};
}

module.exports = {
	track: track
};