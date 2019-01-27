const amqp = require('amqplib/callback_api');
const cfg = require("../config");

module.exports = (function () {

    var channel = null;

    var obj = {
        init: () => {
            var promise = new Promise(function (resolve, reject) {
                amqp.connect(cfg.rabbit, function (err, conn) {
                    conn.createChannel(function (err, ch) {
                        channel = ch;
                        resolve();
                    });
                });
            });
            return promise
        },
        sendToQueue: (nameq, param) => {
            if (channel) {
                obj._sendMessage(nameq, param);
            } else {
                obj.init().then(function () {
                    obj._sendMessage(nameq, param);
                })
            }
        },
        _sendMessage: (nameq, param) => {
            channel.assertQueue(nameq, { durable: false });
            channel.sendToQueue(nameq, Buffer.from(param));
        }
    };
    return obj;
})();





