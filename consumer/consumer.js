const amqp = require('amqplib/callback_api'); //non importo la connessione di rabbitmq perchè ho bisogno di 2 canali
const request = require('request');
const cfg = require('../config');
const sharp = require('sharp');
const postgres = require('../structure/postgres.js');
const s3Upload = require('../structure/s3upload.js');


amqp.connect(cfg.rabbit, function (err, conn) {
    console.log(err);
    conn.createChannel(function (err, ch) {
        var q = 'url';

        ch.assertQueue(q, { durable: false });

        ch.consume(q, function (url) {
            var baseUrl =  'https://d2yaijk2mdn651.cloudfront.net/photocontest/';
            var uri = url.content.toString();
            var filename = uri.replace(baseUrl, '');
            request.get({ uri, encoding: null }, function (err, res, body) {
                sharp(body)
                    .resize(286, 220)
                    .toBuffer()
                    .then((data) => {
                        s3Upload.writeFile("min" + filename, data, { ACL: 'public-read' }).then(function () {
                            var thumbnail = baseUrl + "min" + filename;
                            postgres.query('UPDATE "tsac18Rosada".photos SET thumbnail=$1 WHERE url=$2', [thumbnail, uri], (err, rows) => {
                                if (err) console.log(err);
                            });
                        });
                    });
            });

        }, { noAck: true });
    });
});