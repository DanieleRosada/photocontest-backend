const S3FS = require('s3fs');
const cfg = require("../config");

module.exports = S3FS(cfg.bucketAws, cfg.aws);