const elasticsearch = require('elasticsearch');
const postgres = require('./postgres')
const cfg = require("../config");

const conn = elasticsearch.Client(cfg.elasticsearch);

module.exports = {
    checkIndices: async (index) => {
        if (!conn.indices.exists({ index: index })) { //se esiste l'indice sennò lo creo
            await conn.indices.create({
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
    },
    checkBulk: async (index, type, query) => {
        if (!conn.exists({ index: index, type: type, id: '1' })) { //document exist sennò lo creo
            await postgres.query(query, async (err, result) => {
                console.log("secondo")
                let myBody;
                for (let i = 0; index < result.length; i++) {
                    myBody += { index: { _index: index, _type: type, _id: i } }, result[i] + ",";
                };
                console.log(myBody)
                await conn.bulk({
                    body: [myBody]
                });
            });
        }
    },
    search: async (index, type, query) => {
        conn.search({
            index: index,
            type: type,
            body: {
                query: query,
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
    }
}

