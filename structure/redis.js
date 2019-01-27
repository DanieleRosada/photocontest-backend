const redis = require("redis");
const cfg = require("../config");

module.exports = redis.createClient(cfg.redis).on( 'error', function( err ) {});