const elasticsearch = require('elasticsearch');
const postgres = require('./postgres')
const cfg = require("../config");

const conn = elasticsearch.Client(cfg.elasticsearch);

module.exports = {
    checkIndices: function (index) {
        return new Promise((resolve, reject) => {
            conn.indices.exists({ index: index }, (r, q) => {
                if (!q) {
                    conn.indices.create({
                        index: index
                    });
                    resolve();
                }
                else resolve();
            });
        });
    },
    checkBulk: function (index, type, query) {
        return new Promise((resolve, reject) => {
            conn.count({ index: index, type: type }, (r, q) => {
                if (q.count < 1) {
                    postgres.query(query, (err, result) => {
                        let myBody = [];
                        for (let i = 0; i < result.rowCount; i++) {
                            myBody.push({ index: { _index: index, _type: type, _id: i + 1, _ttl: "30m" } }, result.rows[i]);
                        };
                        conn.bulk({
                            refresh: "true",
                            body: myBody
                        });
                        resolve();
                    });
                }
                else resolve();
            });
        });
    },
    search: function (index, type, search) {
        return new Promise((resolve, reject) => {
            conn.search({
                index: index,
                type: type,
                body: {
                    query: {
                        multi_match: {
                            query: search,
                            fields: ['username', 'description', "title", "original_name"]
                        }
                    }
                }
            }, function (error, response, status) {
                let result = []
                response.hits.hits.forEach(element => {
                    result.push(element._source.key)
                });
                resolve(result);
            });
        });
    }
}

