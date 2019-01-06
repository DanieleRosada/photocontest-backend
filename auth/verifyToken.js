var jwt = require('jsonwebtoken');
var cfg = require('../config');


function verifyToken(req, res, next) {
  // check header or url parameters or post parameters for token
  var token = JSON.parse(req.headers['x-access-token']);
  if (!token)
    return res.status(403).send({
      error: {
        status: 403,
        message: 'No token provided'
      }
    });

  // verifies secret and checks exp
  jwt.verify(token.token, cfg.secret, function (err, decoded) {
    if (err)
      return res.status(401).send({
        error: {
          status: 401,
          message: 'Failed to authenticate token'
        }
      });


    req.token = {
      id: decoded.id,
      username: decoded.username,
    };
    next();
  });
};

module.exports = verifyToken;