var _ = require('underscore');
var config = require('../../config');
var elastic = require('../elastic')(config);

function fullTextItemSearch (user, query, paging, callback) {
	if (!query) {
		return callback(null, { data: [], nextPage: false });
	}

	var page = paging.page || 1;

	elastic.search({
		index: 'items',
		from: (page - 1) * paging.pageSize,
		size: paging.pageSize,
		body: {
			query: {
				filtered: {
					query: {
						common: {
							_all: {
								query: query,
								cutoff_frequency: 0.002,
								minimum_should_match: 2,
								low_freq_operator: 'and'
							}
						}
					},
					filter: {
						term: {
							user: user.email
						}
					}
				}
			},
			highlight: {
				fields: {
					description: { },
					title: { },
					source: { }
				}
			}
		}
	}, function (err, resp) {
		if (err) {
			return callback(err);
		}

		var items = resp.hits.hits.map(function (hit) {
			return _.omit(_.extend(hit._source, transform(hit.highlight)), 'userData');
		});

		callback(null, {data: items, nextPage: items.length === paging.pageSize});
	});

	function transform(highlight) {
		var transformed = {};

		if (highlight && highlight.description && highlight.description.length > 0) {
			transformed.descriptionHtml = highlight.description[0];
		}

		if (highlight && highlight.title && highlight.title.length > 0) {
			transformed.titleHtml = highlight.title[0];
		}

		if (highlight && highlight.source && highlight.source.length > 0) {
			transformed.sourceHtml = highlight.source[0];
		}

		return transformed;
	}
}

module.exports = {
	items: fullTextItemSearch
};
