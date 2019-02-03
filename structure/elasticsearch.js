const elasticsearch = require('elasticsearch');
const postgres = require('./postgres')
const cfg = require("../config");

const conn = elasticsearch.Client(cfg.elasticsearch);

module.exports = {
    checkIndices: async function (index) {
        console.log("checkIndices");
        if (!conn.indices.exists({ index: index })) { //se esiste l'indice sennò lo creo
        console.log("createIndices");
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
    checkBulk: async function (index, type, query) {
        console.log("checkBulk");
        if (!conn.exists({ index: index, type: type, id: '1' })) { //document exist sennò lo creo
            await postgres.query(query, async (err, result) => {
                console.log("createBulk")
                let myBody = [];
                for (let i = 0; index < result.length; i++) {
                    myBody.push({ index: { _index: index, _type: type, _id: i, timeout: '30m' } }, result[i]);
                };
                console.log(myBody)
                await conn.bulk({
                    body: myBody
                });
            });
        }
    },
    search: async function (index, type, search) {
        conn.search({
            index: index,
            type: type,
            body: {
                query: {
                  multi_match: {
                    query: search,
                    fields: ['username','description', "title", "original_name"]
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
    deleteBulk: async function (index, type, id){
        await   client.deleteByQuery({
            index: index,
            type: type,
            body: {
               query: {
                   match: { }
               }
            }
        }, function (error, response) {
            console.log(response);
      });
    },
    deleteIndex: async function (index){
        client.indices.delete({
            index: index});
    }
}

