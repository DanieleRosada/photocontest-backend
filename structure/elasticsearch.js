const elasticsearch = require('elasticsearch');
const cfg = require("../config");

const conn = elasticsearch.Client(cfg.elasticsearch);

module.exports = {
    checkIndices: function (index) {
        return new Promise((resolve, reject) => {
            conn.indices.exists({ index: index }, (error, q) => {
                if (error) { reject(); };
                if (!q) {
                    conn.indices.create({
                        index: index
                    }, function (error, resp, status) {
                        if (error) { reject(); };
                        resolve();
                    });
                }
                else {
                    resolve();
                }
            });
        });
    },

    createDocument: function (index, type, key, username, title, description, original_name) {
        return new Promise((resolve, reject) => {
            conn.create({
                index: index,
                type: type,
                id: key,
                body: {
                    key: key,
                    username: username,
                    title: title,
                    description: description,
                    original_name: original_name
                }
            }, function (error, resp, status) {
                if (error) { reject(); };
                resolve();
            });
        });
    },

    deleteDocument: function (index, type, id) {
        return new Promise((resolve, reject) => {
            conn.delete({
                index: index,
                type: type,
                id: id
            }, function (error, resp, status) {
                if (error) { reject(); };
                resolve();
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
                if (error) { reject(); };
                let result = [];
                response.hits.hits.forEach(element => {
                    result.push(element._source.key)
                });
                resolve(result);
            });
        });
    }
}

