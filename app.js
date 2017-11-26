const cheerio = require('cheerio');
const express = require('express');
const exphbs = require('express-handlebars');
const mongoose = require('mongoose');
const request = require('request');
const bodyParser = require('body-parser');
const path = require('path');

var app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.set('views', path.join(__dirname, 'views'));
app.engine('handlebars', exphbs({ defaultLayout: 'main' }));
app.set('view engine', 'handlebars');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// Set mongoose to leverage built in JavaScript ES6 Promises
// Connect to the Mongo DB
mongoose.Promise = Promise;
//database port
mongoose.connect("mongodb://localhost:27017/webScraper", {
    useMongoClient: true
});

//Bring over mongoose constructors
var db = require('./models');

//scrap articles x
//scrap new articles- add to list x
//save article x
//delete article ===== would delete but will not re-direct page, first result was null, second result deleted - all from same click event
//add note to article  x
//review note
//remove note

var url = 'http://www.cnn.com/us'

db.Article.remove({}, function (err) {
    console.log('Article collection removed')
});

db.Note.remove({}, function (err) {
    console.log('Note collection removed')
});

//reformat link
app.formatLink = function (link, rootAddress) {
    if (link && link.indexOf(rootAddress) < 0) {
        link = rootAddress + link;
    }
    return link;
};

app.saveArticle = function (headline, link) {
    let art = new db.Article();
    art.headline = headline;
    art.link = link;
    return art.save();
};

app.deleteArticle = function (id) {
    return new Promise((resolve, reject) => {


        db.Article.findById( id, function (err, doc) {
            if (!err) {
                console.log('Deleting notes: ' + doc.note);
                db.Note.remove({ _id: { "$in": doc.note.map(function (o) { return mongoose.Types.ObjectId(o); }) } });
                db.Article.remove({ _id: id }).then((article) => {
                    console.log('deleteArticle Successful ' + id);
                    resolve(doc);
                }).catch((err1) => {
                    console.log('deleteArticle Error ' + err1);
                    reject(err1);
                });
            } else {
                console.log('deleteArticle Error ' + err);
                reject(err);
            }
        });
    });
};


app.deleteNote = function (id) {
    return new Promise((resolve, reject) => {
        db.Note.findOneAndRemove({ '_id': id }, function (err, doc) {
            if (!err) {
                console.log('deleteNote Successful ' + id);
                resolve(doc);
            } else {
                console.log('deleteNote Error ' + err);
                reject(error);
            }
        });
    });
};


app.getNote = function (articleId) {
    //console.log('app.getNote ' + articleId);
    return db.Article
        .findOne({ _id: articleId })
        .populate("note")
        .exec();

};

app.getNoteById = function (noteId) {
    return db.Note
        .findOne({ _id: noteId });
};

app.getArticleById = function (articleId) {
    return db.Article
        .findOne({ _id: articleId });
};

app.scrapeURL = function (url) {
    return new Promise((resolve, reject) => {
        request(url, (error, response, html) => {
            if (error) {
                reject(error);
            }
            var results = [];
            //console.log('HTML: ' + html);
            let $ = cheerio.load(html);
            let max = 10;

            $('article.cd').each(function (i, element) {

                let title = $(element).find('.cd__headline-text').text();
                let link = $(element).attr('data-vr-contentbox');

                if (title && link) {
                    results.push({
                        headline: title,
                        link: app.formatLink(link, 'http://www.cnn.com')
                    });
                    if (--max === 0) {
                        return false;
                    }
                }
            });
            resolve(results);
        });
    });
};

app.addNote = function (articleId, noteBody) {
    //console.log('addNote ' + articleId);
    // Create a new note and pass the req.body to the entry
    return db.Note
        .create(noteBody)
        .then(function (dbNote) {
            // If a Note was created successfully, find one Article with an `_id` equal to `req.params.id`. Update the Article to be associated with the new Note
            // { new: true } tells the query that we want it to return the updated User -- it returns the original by default
            // Since our mongoose query returns a promise, we can chain another `.then` which receives the result of the query
            return db.Article.findOneAndUpdate({ _id: articleId }, { $push: { note: dbNote._id } }, { new: true });
        });
};



//Routes

//home
app.get("/", function (req, res) {
    res.render('layouts/main', { layout: false });
});

//display scraped articles
app.get("/scrape", function (req, res) {
    app.scrapeURL(url).then((articles) => {
        //console.log('articles==============' + JSON.stringify(articles));
        res.render('index', { 'articles': articles });
    });
});


//save article
app.post("/scrape/save", function (req, res) {
    app.saveArticle(req.body.headline, req.body.link)
        .then(function (dbArticle) {
            res.json(dbArticle);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            console.log('error===============================' + err);
        });
});


//display saved articles
app.get("/scrape/articles", function (req, res) {
    db.Article.find({})
        .populate('note')
        .exec()
        .then((articles) => {
            console.log(JSON.stringify(articles));
            res.render('articles', { 'articles': articles });
        })
        .catch((err) => {
            res.json(err)
        });
});


//delete article
app.delete('/article/delete/:id', (req, res) => {
    app.deleteArticle(req.params.id)
        .then((doc) => {
            res.json(doc);
        });
});


// Route for saving/updating an Article's associated Note
app.post("/article/:articleId", function (req, res) {
    console.log(req.params.articleId);
    console.log(req.body.title);
    console.log(req.body.body);
    app.addNote(req.params.articleId, {
        title: req.body.title,
        body: req.body.body
    })
        .then(function (dbArticle) {
            // If we were able to successfully update an Article, send it back to the client
            res.redirect('/scrape/articles');
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            res.json(err);
        });
});

//remove note in article
app.delete('/note/delete/:id', (req, res) => {
    app.deleteNote(req.params.id)
        .then((doc) => {
            res.json(doc);
        });
});


// Route for grabbing a specific Article by id, populate it with it's note
app.get("/articles/:id", function (req, res) {
    // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
    app.getNote(req.params.id)
        .then(function (dbArticle) {
            // If we were able to successfully find an Article with the given id, send it back to the client
            res.json(dbArticle);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            res.json(err);
        });
});



module.exports = app;