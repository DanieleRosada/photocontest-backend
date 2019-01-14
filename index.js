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
const redis = require("redis");
const verifyToken = require("./auth/verifyToken");

app.use(cors());
app.use(bodyParser.json());

app.get('/ranking', verifyToken, function (req, res) {
    const Rclient = redis.createClient(cfg.redis);
    Rclient.on("error", function (err) { res.send(err); });
    Rclient.auth (cfg.redisPassword, function (err) {res.send(err); });
    Rclient.get('rating', async (err, reply) => {
        if (reply) {
            Rclient.quit();
            res.send(reply);
        }
        else {
            const client = new pg.Client(cfg.db);
            client.connect();
            client.query(`SELECT u.username, p.nvotes, p."ID", p.sumvotes, p.url,  ($1 * p.sumvotes / p.nvotes) + ($2 *  p.nvotes) as rating
            FROM "tsac18Rosada".photos p JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID")
            WHERE nvotes>0 ORDER BY rating DESC LIMIT 20`, [3, 1], (err, result) => {
                    if (err) { res.end(err) };
                    Rclient.on("error", function (err) { res.send(err); });
                    console.log("qua");
                    Rclient.setex("rating", 14400 ,JSON.stringify(result.rows)); //ogni 4 ore aggiorno la classifica
                    Rclient.quit();
                    client.end();
                    res.send(result.rows);
                });
        };
    });
});

app.get('/userranking', verifyToken, function (req, res) {
    const Rclient = redis.createClient(cfg.redis);
    Rclient.on("error", function (err) { res.send(err); });
    Rclient.auth (cfg.redisPassword, function (err) {res.send(err); });
    Rclient.get('userranking', async (err, reply) => {
        if (reply) {
            Rclient.quit();
            res.send(reply);
        }
        else {
            const client = new pg.Client(cfg.db);
            client.connect();
            client.query(`SELECT u.username, SUM(p.nvotes) as nvotes, SUM(p.sumvotes) as sumvotes, COUNT(p."ID") as nphotos
            FROM "tsac18Rosada".photos p JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID")
            GROUP BY u.username, u.email ORDER BY sumvotes DESC, nvotes DESC LIMIT 20`, (err, result) => {
                    if (err) { res.end(err) };
                    Rclient.on("error", function (err) { res.send(err); });
                    Rclient.setex("userranking", 14400 ,JSON.stringify(result.rows));
                    Rclient.quit();
                    client.end();
                    res.send(result.rows);
                });
        };
    });
});

app.post('/home', verifyToken, function (req, res) {
    user_id = req.body.userid;
    const client = new pg.Client(cfg.db);
    client.connect();
    client.query(`SELECT v."ID_photo" as voteIdPhoto, v."ID_user" as voteIdUser, p."ID", p.url, p."ID_user", 
    p.sumvotes, p.nvotes, u.username FROM "tsac18Rosada".photos p 
    LEFT JOIN "tsac18Rosada".votes v ON (p."ID" = v."ID_photo" AND v."ID_user"=$1) 
    JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID")
    ORDER BY p."ID"`, [user_id], (err, result) => {
            if (err) { res.send(err); }
            res.send(result.rows);
            client.end();
        });
});

app.post('/photo', verifyToken, function (req, res) {
    photo_id = req.body.idphoto;
    const client = new pg.Client(cfg.db);
    client.connect();
    client.query(`SELECT p.url, p.sumvotes, p.nvotes, u.username FROM "tsac18Rosada".photos p 
    JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID")
    WHERE p."ID"= $1`, [photo_id], (err, result) => {
            if (err) { res.send(err); }
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
        if (err) {
            res.status(500).json({
                message: "Unable to provide a valid token, internal error",
                token: null
            });
        }
        if (!result.rows[0])
            return res.status(400).json({
                message: "Unable to found user: " + username,
                token: null
            });
        if (!bcrypt.compareSync(password, result.rows[0].password)) {
            return res.status(401).json({
                message: "No valid Password",
                token: null
            });
        }
        var token = jwt.sign({
            id: result.rows[0].ID,
            username: result.rows[0].username,
        }, cfg.secret, {
                expiresIn: 60 * 60 * 4
            });
        client.end();
        res.status(200).json({
            id: result.rows[0].ID,
            username: result.rows[0].username,
            token: token
        });
    });
});


app.post('/sigup', function (req, res) {
    username = req.body.username;
    const client = new pg.Client(cfg.db);
    client.connect();
    client.query('BEGIN', (err) => {
        if (err) { res.send(err); }
        client.query('SELECT * FROM "tsac18Rosada"."user" WHERE username=$1;', [username], (err, result) => {
            if (err) { res.send(err); }
            if (result.length > 0) {
                res.status(409).json({
                    message: "Conflict, user already exists",
                    status: 409
                });
            }
            if (req.body.password.length < 4) {
                res.status(406).json({
                    message: "Not Acceptable, password is too short, min: 4",
                    status: 406
                });
            }
            email = req.body.email
            password = bcrypt.hashSync(req.body.password, null, null);
            client.query('INSERT INTO "tsac18Rosada"."user"(username, password, email) VALUES ($1, $2, $3);', [username, password, email], (err, result) => {
                if (err) { res.send(err); }
                client.query('COMMIT', (err) => {
                    if (err) { res.send(err); }
                    client.end();
                    res.status(200).send();
                });
            });
        });
    });
});


app.post('/upload', verifyToken, function (req, res) {
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
                if (err) { res.send(err); }
            });
            res.status(200).send();
        });
    });
});

app.post('/vote', verifyToken, function (req, res) {
    vote = req.body.vote;
    id_photo = req.body.id_photo;
    id_user = req.body.id_user;
    const client = new pg.Client(cfg.db);
    client.connect();
    client.query('BEGIN', (err) => {
        if (err) { res.end(err); }
        client.query('SELECT * FROM "tsac18Rosada".votes WHERE "ID_user"=$1 AND "ID_photo"=$2', [id_user, id_photo], (err, result) => { //gestione errore 2 profili aperti che votano la stessa foto
            if (result.rows[0] || err) { res.end(); }
            client.query('INSERT INTO "tsac18Rosada".votes("ID_user","ID_photo",vote) VALUES ($1, $2, $3);', [id_user, id_photo, vote], (err, result) => {
                if (err) { res.end(err); };
                client.query('UPDATE "tsac18Rosada".photos SET nvotes=nvotes+1, sumvotes=sumvotes+$1 WHERE "ID"=$2', [vote, id_photo], (err, result) => {
                    if (err) { res.end(err); };
                    client.query('COMMIT', (err) => {
                        if (err) { res.end(err) };
                        client.end();
                        res.status(200).send();
                    });
                });
            });
        });
    });
});

app.listen(3000);