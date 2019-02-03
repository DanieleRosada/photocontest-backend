const amqp = require('amqplib/callback_api');
const cfg = require("../config");

module.exports = (function () {

    var sender = null;
    var reciver = null
    var obj = {
        init: (channel) => {
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
            if (this.sender) {
                obj._sendMessage(nameq, param);
            } else {
                obj.init(this.sender).then(function () {
                    obj._sendMessage(nameq, param);
                })
            }
        },
        _sendMessage: (nameq, param) => {
            this.sender.assertQueue(nameq, { durable: false });
            this.sender.sendToQueue(nameq, Buffer.from(param));
        },
        _reciveMessage: () => {
            if (this.reciver) {
                return this.reciver;
            }
            else {
                obj.inti(this.reciver);
            }
        }
    };
    return obj;
})();





