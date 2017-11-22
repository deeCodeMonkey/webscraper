const cheerio = require('cheerio');
const express = require('express');
const exphbs = require('express-handlebars');
const mongoose = require('mongoose');
const request = require('request');
const bodyParser = require('body-parser');
const path = require('path');


var app = express();
var PORT = process.env.PORT || 8080;

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
//delete article 
//add note to article
//review note
//remove note

var url = 'http://www.cnn.com/us'

//db.Article.remove({}, function (err) {
//    console.log('Article collection removed')
//});

//db.Note.remove({}, function (err) {
//    console.log('Note collection removed')
//});

//reformat link
app.formatLink = function (link, rootAddress) {
    if (link && link.indexOf(rootAddress) < 0) {
        link = rootAddress + link;
    }
    return link;
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
                //console.log('URL: ' + results.link);
                //console.log(results);       

            });

            //console.log('results=============' + results);
            resolve(results);


        });
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
        .then((articles) => {
            console.log(JSON.stringify(articles));
            res.render('articles', { 'articles': articles });
        })
        .catch((err) => {
            res.json(err)
        });
});




app.saveArticle = function (headline, link) {
    let art = new db.Article();
    art.headline = headline;
    art.link = link;

    return art.save();
    //// Create a new Article using the `result` object built from scraping
    //db.Article
    //    .create(results)
    //    .then(function (dbArticle) {
    //        // If we were able to successfully scrape and save an Article, send a message to the client
    //        console.log('complete============================ ' + dbArticle);
    //    })
    //    .catch(function (err) {
    //        // If an error occurred, send it to the client
    //        console.log('error===============================' + err);
    //    });
    
};

app.deleteArticle = function (id) {
    db.Article.findById(id, function (err, doc) {
        if (!err) {
            doc.remove();
            doc.save(function (err) {
                console.log('deleted ' + id);
            });
        }
    });
};



// Display saved Articles from the db
app.get("/articles", function (req, res) {
    // Grab every document in the Articles collection
    db.Article
        .find({})
        .then(function (dbArticle) {
            // If we were able to successfully find Articles, send them back to the client
            res.json(dbArticle);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            res.json(err);
        });
});



// Route for grabbing a specific Article by id, populate it with it's note
app.get("/articles/:id", function (req, res) {
    // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
    db.Article
        .findOne({ _id: req.params.id })
        // ..and populate all of the notes associated with it
        .populate("note")
        .then(function (dbArticle) {
            // If we were able to successfully find an Article with the given id, send it back to the client
            res.json(dbArticle);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            res.json(err);
        });
});



// Route for saving/updating an Article's associated Note
app.post("/articles/:id", function (req, res) {
    // Create a new note and pass the req.body to the entry
    db.Note
        .create(req.body)
        .then(function (dbNote) {
            // If a Note was created successfully, find one Article with an `_id` equal to `req.params.id`. Update the Article to be associated with the new Note
            // { new: true } tells the query that we want it to return the updated User -- it returns the original by default
            // Since our mongoose query returns a promise, we can chain another `.then` which receives the result of the query
            return db.Article.findOneAndUpdate({ _id: req.params.id }, { note: dbNote._id }, { new: true });
        })
        .then(function (dbArticle) {
            // If we were able to successfully update an Article, send it back to the client
            res.json(dbArticle);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            res.json(err);
        });
});




// Start the server
var server = app.listen(PORT, function () {
    console.log("App running on port " + PORT + ".");
});

app.close = function () {
    server.close();
};

module.exports = app;