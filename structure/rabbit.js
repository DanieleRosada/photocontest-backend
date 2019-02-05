const amqp = require('amqplib/callback_api');
const cfg = require("../config");

module.exports = (function () {
    var sender = null;
    var reciver = null;
    var obj = {
        init: () => {
            return new Promise(function (resolve, reject) {
                amqp.connect(cfg.rabbit, function (err, conn) {
                    if (err) return obj.init();
                    conn.createChannel(function (err, ch) {
                        resolve(ch);
                    });
                });
            });
        },
        sendToQueue: (nameq, param) => {
            if (sender) {
                obj._sendMessage(nameq, param);
            } else {
                obj.init().then(function (ch) {
                    sender = ch;
                    obj._sendMessage(nameq, param);
                })
            }
        },
        reciveToQueue: (nameq, callback) => {
            if (reciver) {
                obj._sendMessage(nameq, param);
            } else {
                obj.init().then(function (ch) {
                    reciver = ch;
                    obj._reciveMessage(nameq, callback);
                })
            }
        },
        _sendMessage: (nameq, param) => {
            sender.assertQueue(nameq, { durable: false });
            sender.sendToQueue(nameq, Buffer.from(param));
        },
        _reciveMessage: (nameq, callback) => {
            reciver.assertQueue(nameq, { durable: false });
            reciver.consume(nameq, callback);
        }
    };
    return obj;
})();





