const express = require('express');
const app = express();
const cors = require('cors');
const bodyParser = require('body-parser')
const cfg = require('./config');
const pg = require('pg');
const fs = require('fs');
const S3FS = require('s3fs');
const bcrypt = require('bcrypt-nodejs');
const jwt = require('jsonwebtoken');
const multer = require('multer');

app.use(cors());
app.use(bodyParser.json());

app.post('/home' , function (req, res) {
    user_id = req.body.userid;
    const client = new pg.Client(cfg.db);
    client.connect();
    client.query(`SELECT v."ID_photo" as voteIdPhoto, v."ID_user" as voteIdUser, p."ID", p.url, p."ID_user", 
    p.sumvotes, p.nvotes, u.username FROM "tsac18Rosada".photos p 
    LEFT JOIN "tsac18Rosada".votes v ON (p."ID" = v."ID_photo" AND v."ID_user"=$1) 
    JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID")
    ORDER BY p."ID"`, [user_id], (err, result) => {
            if (err) {
                res.status(500).json({
                    err: err
                });
            }
            res.send(result.rows);
            client.end();
        });
});

app.post('/photo', function (req, res) {
    photo_id = req.body.idphoto;
    const client = new pg.Client(cfg.db);
    client.connect();
    client.query(`SELECT p.url, p.sumvotes, p.nvotes, u.username FROM "tsac18Rosada".photos p 
    JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID")
    WHERE p."ID"= $1`, [photo_id], (err, result) => {
        console.log(result.rows)
            if (err) {
                res.status(500).json({
                    err: err
                });
            }
            res.send(result.rows);
            client.end();
        });
});


app.post('/login', function (req, res) {
    username = req.body.username;
    password = req.body.password;
    const client = new pg.Client(cfg.db);
    client.connect();
    client.query('SELECT * FROM "tsac18Rosada"."user" WHERE username=$1;', [username], (err, result) => {
        if (err)
            res.status(500).json({
                message: "Unable to provide a valid token, internal error",
                token: null
            });

        var token = jwt.sign({
            id: result.rows[0].ID,
            username: result.rows[0].username,
        }, cfg.secret, {
                expiresIn: 60 * 60 * 4
            });

        res.status(200).json({
            id: result.rows[0].ID,
            username: result.rows[0].username,
            token: token
        });
        client.end();
    });
});


app.post('/sigup', function (req, res) {
    const client = new pg.Client(cfg.db);
    client.connect();
    username = req.body.username;
    client.query('SELECT * FROM "tsac18Rosada"."user" WHERE username=$1;', [username], (err, result) => {
        if (err)
            res.status(400).json({
                message: "Bad Requests",
                status: 400
            });
        if (result.length > 0)
            res.status(409).json({
                message: "Conflict, user already exists",
                status: 409
            });
        if (req.body.password.length < 4)
            res.status(406).json({
                message: "Not Acceptable, password is too short, min: 4",
                status: 406
            });

        password = bcrypt.hashSync(req.body.password, null, null);
        email = req.body.email

        client.query('INSERT INTO "tsac18Rosada"."user"(username, password, email) VALUES ($1, $2, $3);', [username, password, email], function (err, rows, fields) {
            if (err)
                res.status(400).json({
                    message: "Bad Requests",
                    status: 400
                });
            res.status(200).send();
        });
        client.end();
    })
});


app.post('/upload', function (req, res) {
    s3fsImpl = new S3FS('tsac18-rosada/photocontest', cfg.aws)
    var Storage = multer.diskStorage({
        destination: function (req, file, cb) {
            cb(null, "./uploads");
        },
        filename: function (req, file, cb) {
            cb(null, Date.now() + "_" + file.originalname);
        }
    });

    var upload = multer({
        storage: Storage
    }).single("photo");

    upload(req, res, function (err) {
        if (err) {
            res.send("Something went wrong!");
        }

        var fileStream = fs.createReadStream(req.file.path);
        return s3fsImpl.writeFile(req.file.filename, fileStream, { ACL: 'public-read' }).then(function () {
            fs.unlink(req.file.path, (err) => {
                if (err) {
                    console.error(err);
                }
            });
            res.status(200).send();
        });
    });
});

app.post('/vote', function (req, res) {
    vote = req.body.vote;
    id_photo = req.body.id_photo;
    id_user = req.body.id_user;
    const client = new pg.Client(cfg.db);
    client.connect();

    client.query('INSERT INTO "tsac18Rosada".votes(vote,"ID_photo", "ID_user") VALUES ($1, $2, $3);', [vote, id_photo, id_user], function (err, rows, fields) {
        if (err) {
            res.status(400).json({
                message: "Bad Requests",
                status: 400
            });
        }
    });
    client.query('UPDATE "tsac18Rosada".photos SET nvotes=nvotes+1, sumvotes=sumvotes+$1 WHERE "ID"=$2', [vote, id_photo], function (err, rows, fields) {
        if (err)
            res.status(400).json({
                message: "Bad Requests",
                status: 400
            });
        res.status(200).send();
        client.end();
    });

});


app.listen(3000);