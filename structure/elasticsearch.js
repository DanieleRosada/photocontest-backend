const elasticsearch = require('elasticsearch');
const postgres = require('./postgres')
const cfg = require("../config");

const conn = elasticsearch.Client(cfg.elasticsearch);

module.exports = {
    checkIndices: function (index) {
        console.log("checkIndices")
        conn.indices.exists({ index: index }, function (r, q) { //se esiste l'indice sennò lo creo 
        console.log(q)
            if (!q) {
                console.log("createIndices");
                conn.indices.create({
                    index: index
                }, function (err, resp, status) {
                    if (err) {
                        console.log(err);
                    }
                    else {
                        console.log("create", resp);
                    }
                });
            }
        });
    },
    checkBulk: function (index, type, query) {
        console.log("checkBulk");
        if (conn.count({ index: index, type: type }) == 0) { //document exist sennò lo creo
            postgres.query(query, async (err, result) => {
                console.log("createbulk");
                let myBody = [];
                for (let i = 0; i < result.rowCount; i++) {
                    myBody.push({ index: { _index: index, _type: type, _id: i, _ttl: "30m" } }, result.rows[i]);
                };
                conn.bulk({
                    body: myBody
                });
            });
        }
    },
    search: function (index, type, search) {
        console.log("search")
        conn.msearch({
            index: index,
            type: type,
            body: {
                query: {
                    match: {
                        query: search,
                        fields: ['username', 'description', "title", "original_name"]
                    }
                }
            }
        }, function (error, response, status) {
            if (error) {
                console.log("search error: " + error)
            }
            else {
                console.log("--- Response ---");
                console.log(response);
                console.log("--- Hits ---");
                response.hits.hits.forEach(function (hit) {
                    console.log(hit);
                })
            }
        });
    },
    deleteBulk: async function (index, type, id) {
        await client.deleteByQuery({
            index: index,
            type: type,
            body: {
                query: {
                    match: {}
                }
            }
        }, function (error, response) {
            console.log(response);
        });
    },
    deleteIndex: async function (index) {
        conn.indices.delete({
            index: index
        });
    }
}

