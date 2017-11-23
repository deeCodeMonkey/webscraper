
var app = require('./app');
var PORT = process.env.PORT || 8080;


var server = app.listen(PORT, function () {
    console.log('App listening on PORT ' + PORT);
});


