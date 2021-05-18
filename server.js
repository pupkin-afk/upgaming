const express = require('express')
const app = express()

const http = require('http').createServer(app)

const mongodb = require('mongodb')
const mongoClient = mongodb.MongoClient
const ObjectId = mongodb.ObjectID

const bcrypt = require('bcrypt')
const fs = require('fs')

const jwt = require('jsonwebtoken')
const accessTokenSecret = 'secretToken'

const PORT = process.env.PORT || 3000

var bodyParser = require('body-parser');

//app.use("/public", express.static(__dirname + '/public'))
app.use(express.static(__dirname + '/public'));
app.set('view engine', 'ejs')

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const mainURL = 'http:/localhost:3000'

const authenticateJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;

    if (authHeader) {
        const token = authHeader.split(' ')[2];
        jwt.verify(token, accessTokenSecret, (err, user) => {
            if (err) {
                return res.sendStatus(403);
            }

            req.user = user;
            next();
        });
    } else {
        res.sendStatus(401);
    }
};

function validateEmail(email) {
    const re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(email);
}

let _db_config = {
    name: 'admin',
    password: 'Io9hjoYqYoJE5yEL'
}

// Socket 
const io = require('socket.io')(http)

io.on('connection', (socket) => {
    console.log('Connected...')

    socket.on('disconnect', () => {
        console.log('Disconnected')
    })
})

let url = `mongodb+srv://${_db_config.name}:${_db_config.password}@cluster0.mw63n.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`

http.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)

    mongoClient.connect(url, (err, client) => {
        var database = client.db('database')
        console.log('Database connected')

        var users = database.collection('users')

        /*
        database.collection('users').insertOne({
            "user": "true"
        }, (error, data) => {
            
        })
        */

        app.get('/', (req, res) => {
            res.render('start')
        })

        app.get('/login', (req, res) => {
            res.render('login')
        })

        app.get('/signup', (req, res) => {
            res.render('register')
        })

        app.get('/home', (req, res) => {
            res.render('home')
        })

        app.post('/api/testfunc', authenticateJWT, (req, res) => {
            res.send({
                "email": req.user.email
            })
        })

        app.post('/api/signup', (req, res) => {
            let email = req.body.email
            let password = req.body.password
            let nickname = req.body.nickname

            if (email || password || nickname) {
                if (password.length < 6) {
                    return res.send({
                        status: "failed",
                        errorCode: "api/weak-password"
                    })
                }


                if (nickname.length <= 3) {
                    return res.send({
                        status: "failed",
                        errorCode: "api/nickname-min-chars"
                    })
                } else if (nickname.length >= 10) {
                    return res.send({
                        status: "failed",
                        errorCode: "api/nickname-max-chars"
                    })
                } else {
                    let v = !/[^a-zA-Z_^1-9]/.test(nickname)
                    if (v === false) {
                        return res.send({
                            status: "failed",
                            errorCode: "api/invalid-nickname"
                        })
                    }
                }

                email = email.toLowerCase()
                if (validateEmail(email)) {
                    users.findOne({
                        $or: [
                            {email: email.toLowerCase()},
                            {nickname: nickname.toLowerCase()}
                        ]
                    }).then((data, err) => {
                        if (!err) {
                            if (!data) {
                                bcrypt.hash(password, 10).then((hashed, err) => {
                                    database.collection('users').insertOne({
                                        email: email.toLowerCase(),
                                        nickname: nickname.toLowerCase(),
                                        originalNickname: nickname,
                                        password: hashed,
                                        notifications: [],
                                    }, (error, data) => {
                                        if (error) {
                                            console.log('%error_signup_2%:', error)
                                            res.send({
                                                status: "failed",
                                                errorCode: "api/database-error"
                                            }).status(200)
                                            return
                                        }

                                        var authKey = jwt.sign({
                                            email: email
                                        }, accessTokenSecret)

                                        res.send({
                                            status: "success",
                                            authKey: authKey
                                        }).status(200)
                                    })
                                })
                            }
                            else {
                                res.send({
                                    status: "failed",
                                    errorCode: "api/user-already-exists"
                                }).status(200)
                            }
                        }
                        else {
                            console.log('%error_signup%:', err)
                            res.send({
                                status: "failed",
                                errorCode: "api/database-error"
                            }).status(200)
                        }
                    })
                }
                else {
                    res.send({
                        status: "failed",
                        errorCode: "api/invalid-email"
                    }).status(200)
                }
            } else {
                res.send({
                    status: "failed",
                    errorCode: "api/incorrect-syntax"
                }).status(200)
            }
        })


        app.post('/api/login', (req, res) => {
            let email = req.body.email
            let password = req.body.password

            if (email || password) {
                if (!validateEmail(email)) {
                    return res.send({
                        status: "failed",
                        errorCode: "api/invalid-email"
                    }).status(200)
                }
                users.findOne({
                    email: email.toLowerCase()
                }).then((data, err) => {
                    if (!err) {
                        if (data) {
                            bcrypt.compare(password, data.password).then((verify, err) => {
                                if (err) {
                                    res.send({
                                        status: "failed",
                                        errorCode: "api/check-error"
                                    }).status(200)
                                    return
                                }
                                if (verify) {
                                    var authKey = jwt.sign({
                                        email: email
                                    }, accessTokenSecret)
                                    res.send({
                                        status: "success",
                                        authKey: authKey
                                    }).status(200)
                                } else {
                                    res.send({
                                        status: "failed",
                                        errorCode: "api/incorrect-password"
                                    }).status(200)
                                }
                            })
                        } else {
                            res.send({
                                status: "failed",
                                errorCode: "api/not-exists-user"
                            }).status(200)
                        }
                    } else {
                        console.log('Error(x01):', err)
                        res.send({
                            status: "failed",
                            errorCode: "api/database-error"
                        }).status(200)
                    }
                })
            } else {
                res.send({
                    status: "failed",
                    errorCode: "api/incorrect-syntax"
                }).status(200)
            }
        })
    })
})