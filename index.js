const app = require('express')();
const cors = require('cors');
const bodyParser = require('body-parser');
const cfg = require('./config');
const postgres = require('./structure/postgres.js');
const redis = require('./structure/redis.js');
const rabbit = require('./structure/rabbit.js');
const s3Upload = require('./structure/s3upload.js');
const elasticSearch = require('./structure/elasticsearch.js');
const bcrypt = require('bcrypt-nodejs');
const jwt = require('jsonwebtoken');
const verifyToken = require("./auth/verifyToken");
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const consumer = require("./consumer/consumer");

app.use(cors());
app.use(bodyParser.json());

app.get('/ranking/photos', verifyToken, function (req, res) {
    redis.get('photosRanking', async (err, reply) => {
        if (reply) {
            res.send(reply);
        }
        else {
            postgres.query(`SELECT u.username, p."ID", p.nvotes, p.sumvotes, p.url, p.thumbnail,  ($1 * p.sumvotes / p.nvotes) + ($2 *  p.nvotes) as ranking
            FROM "tsac18Rosada".photos p JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID")
            WHERE nvotes>0 ORDER BY ranking DESC LIMIT 20`, [2, 1], (err, result) => {
                    if (err) { res.end(err) };

                    redis.setex("photosRanking", 14400, JSON.stringify(result.rows)); //reload every 4 hours
                    res.send(result.rows);

                });
        }
    });
});

app.get('/ranking/users', verifyToken, function (req, res) {
    redis.get('usersRanking', async (err, reply) => {
        if (reply) {
            res.send(reply);
        }
        else {
            postgres.query(`SELECT u.username, SUM(p.nvotes) as nvotes, SUM(p.sumvotes) as sumvotes, COUNT(p."ID") as nphotos, 
            ($1 * SUM(p.sumvotes) /  SUM(p.nvotes)) + ($2 *  SUM(p.nvotes))+ ($3 * COUNT(p."ID")) as ranking
            FROM "tsac18Rosada".photos p JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID") WHERE p.nvotes>0
            GROUP BY u.username, u.email ORDER BY ranking DESC LIMIT 20`, [10, 3, 1], (err, result) => {
                    if (err) { res.end(err) };
                    redis.setex("usersRanking", 14400, JSON.stringify(result.rows)); //reload every 4 hours
                    res.send(result.rows);
                });
        }
    });
});

app.post('/photos', verifyToken, function (req, res) {
    let user_id = req.body.userid;
    postgres.query(`SELECT v."ID_photo" as voteIdPhoto, v."ID_user" as voteIdUser, p."ID", p.url, p."ID_user", 
    p.sumvotes, p.nvotes, p.thumbnail, u.username FROM "tsac18Rosada".photos p 
    LEFT JOIN "tsac18Rosada".votes v ON (p."ID" = v."ID_photo" AND v."ID_user"=$1) 
    JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID")
    ORDER BY p."ID"`, [user_id], (err, result) => {
            if (err) { res.send(err); }
            res.send(result.rows);
        });
});

app.post('/photo', verifyToken, function (req, res) {
    let photo_id = req.body.idphoto;
    postgres.query(`SELECT p.url, p.sumvotes, p.nvotes, p.description, p.title, p.original_name, u.username, u.email FROM "tsac18Rosada".photos p 
    JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID")
    WHERE p."ID"=$1`, [photo_id], (err, result) => {
            if (err) { res.send(err); }
            res.send(result.rows);
        });
});


app.post('/login', function (req, res) {
    let username = req.body.username;
    let password = req.body.password;
    postgres.query('SELECT * FROM "tsac18Rosada"."user" WHERE username=$1;', [username], (err, result) => {
        if (err) {
            res.status(500).json({
                message: "Unable to provide a valid token, internal error",
                token: null
            });
        }
        if (!result.rows[0] || !bcrypt.compareSync(password, result.rows[0].password)) {
            return res.status(401).json({
                message: "Invalid password or username",
                token: null
            });
        }

        var token = jwt.sign({
            id: result.rows[0].ID,
            username: result.rows[0].username,
        }, cfg.secret, {
                expiresIn: 4 * 60 * 60 //duration 4 hours
            });

        res.status(200).json({
            id: result.rows[0].ID,
            username: result.rows[0].username,
            email: result.rows[0].email,
            token: token
        });
    });
});


app.post('/sigup', function (req, res) {
    let username = req.body.username;
    postgres.query('BEGIN', (err) => {
        if (err) { res.send(err); }
        postgres.query('SELECT * FROM "tsac18Rosada"."user" WHERE username=$1;', [username], (err, result) => { //check if there is a user with the same username
            if (err) { res.send(err); }
            if (result.length > 0) {
                res.status(409).json({
                    message: "Conflict, user already exists",
                    status: 409
                });
            }
            if (req.body.password.length < 4) {
                res.status(406).json({
                    message: "Not acceptable, password is too short, min: 4",
                    status: 406
                });
            }
            let email = req.body.email
            let password = bcrypt.hashSync(req.body.password, null, null);
            postgres.query('INSERT INTO "tsac18Rosada"."user"(username, password, email) VALUES ($1, $2, $3);', [username, password, email], (err, result) => {
                if (err) { res.send(err); }
                postgres.query('COMMIT', (err) => {
                    if (err) { res.send(err); }
                    res.status(200).send();
                });
            });
        });
    });
});


app.post('/upload', upload.single("photo"), verifyToken, function (req, res) {
    let file = req.file;
    let title = req.body.title;
    let description = req.body.description;
    let user_id = req.body.userid;
    let filename = Date.now() + file.originalname;
    let url = "https://d2yaijk2mdn651.cloudfront.net/photocontest/" + filename;
    s3Upload.writeFile(filename, file.buffer, { ACL: 'public-read' }).then(function () {
        postgres.query(`INSERT INTO "tsac18Rosada".photos(url, "ID_user", nvotes, title, description, original_name, sumvotes) 
        VALUES ($1, $2, 0, $3, $4, $5, 0);`, [url, user_id, title, description, file.originalname], (err, result) => {
                if (err) { res.send(err); }
                res.status(200).send();
                rabbit.sendToQueue('url', url);
            });
    });
});

app.post('/vote', verifyToken, function (req, res) {
    let vote = req.body.vote;
    let id_photo = req.body.idphoto;
    let id_user = req.body.iduser;
    postgres.query('BEGIN', (err) => {
        if (err) { res.end(err); }
        postgres.query('SELECT * FROM "tsac18Rosada".votes WHERE "ID_user"=$1 AND "ID_photo"=$2', [id_user, id_photo], (err, result) => { //vote with 2 profile in the same time
            if (result.rows[0] || err) { res.end(); }
            postgres.query('INSERT INTO "tsac18Rosada".votes("ID_user","ID_photo",vote) VALUES ($1, $2, $3);', [id_user, id_photo, vote], (err, result) => {
                if (err) { res.end(err); };
                postgres.query('UPDATE "tsac18Rosada".photos SET nvotes=nvotes+1, sumvotes=sumvotes+$1 WHERE "ID"=$2', [vote, id_photo], (err, result) => {
                    if (err) { res.end(err); };
                    postgres.query('COMMIT', (err) => {
                        if (err) { res.end(err) };
                        res.status(200).send();
                    });
                });
            });
        });
    });
});

app.post('/owenphotos', verifyToken, function (req, res) {
    let user_id = req.body.userid;
    postgres.query(`SELECT "ID", nvotes, thumbnail, title, sumvotes, url FROM "tsac18Rosada".photos WHERE "ID_user"=$1`, [user_id], (err, result) => {
        if (err) { res.send(err); }
        res.send(result.rows);
    });
});

app.post('/deletephoto', verifyToken, function (req, res) {
    let photo_id = req.body.idphoto;
    postgres.query('BEGIN', (err) => {
        if (err) { res.end(err); }
        postgres.query('DELETE FROM "tsac18Rosada".votes WHERE "ID_photo"=$1', [photo_id], (err, result) => {
            if (err) { res.end(err); };
            postgres.query('DELETE FROM "tsac18Rosada".photos WHERE "ID"=$1', [photo_id], (err, result) => {
                if (err) { res.end(err); };
                postgres.query('COMMIT', (err) => {
                    if (err) { res.end(err) };
                    res.status(200).send();
                });
            });
        });
    });
});

app.post('/search', verifyToken, async function (req, res) {
    let search = req.body.search;
    let user_id = req.body.userid;
    let query = `SELECT p."ID" as key, p.title, p.description, p.original_name, u.username FROM "tsac18Rosada".photos p JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID");`;

    await elasticSearch.checkIndices("photos")
    await elasticSearch.checkBulk("photos", "users", query)
    let wantedPhotos = await elasticSearch.search("photos", "users", search)
    await postgres.query(`SELECT v."ID_photo" as voteIdPhoto, v."ID_user" as voteIdUser, p."ID", p.url, p."ID_user", 
    p.sumvotes, p.nvotes, p.thumbnail, u.username FROM "tsac18Rosada".photos p 
    LEFT JOIN "tsac18Rosada".votes v ON (p."ID" = v."ID_photo" AND v."ID_user"=$1) 
    JOIN "tsac18Rosada".user u ON (p."ID_user" = u."ID") WHERE p."ID" =  ANY ($2)
    ORDER BY p."ID"`, [user_id, wantedPhotos], (err, result) => {
            if (err) { res.end(err); }
            res.send(result.rows);
        });
});

app.get("/user", verifyToken, function (req, res) {
    res.send();
});

app.listen(3000);