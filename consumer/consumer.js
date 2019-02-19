const postgres = require('../structure/postgres');
const s3 = require('../structure/s3');
const rabbit = require('../structure/rabbit');
const request = require('request');
const sharp = require('sharp');

rabbit.reciveToQueue('url', function (url) {
    var uri = url.content.toString();
    var baseUrl = 'https://d2yaijk2mdn651.cloudfront.net/photocontest/';
    var filename = uri.replace(baseUrl, '');
    request.get({ uri, encoding: null }, function (err, res, body) {
        sharp(body)
            .resize(286, 220)
            .toBuffer()
            .then((data) => {
                s3.writeFile("min" + filename, data, { ACL: 'public-read' }).then(function () {
                    var thumbnail = baseUrl + "min" + filename;
                    postgres.query('UPDATE "tsac18Rosada".photos SET thumbnail=$1 WHERE url=$2', [thumbnail, uri], (err, rows) => {
                        if (err) { console.log(err) };
                    });
                });
            });
    });
}, { noAck: true });
