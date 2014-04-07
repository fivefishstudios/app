var schemas = require('../models/schemas');

module.exports = {
	body: function (schema) {
		return function (req, res, next) {
			var result = schemas.validate(req.body, schema);

			if (!result.valid) {
				return res.send(412, result.errors);
			}

			next();
		};
	},
	id: function (param) {
		return function (req, res, next) {
			var result = schemas.validateId(req.params[param]);

			if (!result.valid) {
				return res.send(412, result.errors);
			}

			next();
		};
	}
};