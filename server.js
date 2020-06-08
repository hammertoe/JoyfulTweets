require('dotenv').config();

var express = require('express');
var passport = require('passport');
var Strategy = require('passport-twitter').Strategy;
var Twit = require('twit');
var axios = require('axios');
var throttleAdapterEnhancer = require('axios-extensions').throttleAdapterEnhancer;

tone_url = process.env['TONE_URL'];

// Configure the Twitter strategy for use by Passport.
//
// OAuth 1.0-based strategies require a `verify` function which receives the
// credentials (`token` and `tokenSecret`) for accessing the Twitter API on the
// user's behalf, along with the user's profile.  The function must invoke `cb`
// with a user object, which will be set at `req.user` in route handlers after
// authentication.
passport.use(new Strategy({
    consumerKey: process.env['TWITTER_CONSUMER_KEY'],
    consumerSecret: process.env['TWITTER_CONSUMER_SECRET'],
    callbackURL: 'https://joyfultweets-daring-wildebeest-eq.eu-gb.mybluemix.net/oauth/callback',
    proxy: true
  },
  function(token, tokenSecret, profile, cb) {
      // In this example, the user's Twitter profile is supplied as the user
      // record.  In a production-quality application, the Twitter profile should
      // be associated with a user record in the application's database, which
      // allows for account linking and authentication with other identity
      // providers.

      // save the API tokens from twitter for later use
      profile.token = token;
      profile.tokenSecret = tokenSecret;
      
    return cb(null, profile);
  }));


// Configure Passport authenticated session persistence.
//
// In order to restore authentication state across HTTP requests, Passport needs
// to serialize users into and deserialize users out of the session.  In a
// production-quality application, this would typically be as simple as
// supplying the user ID when serializing, and querying the user record by ID
// from the database when deserializing.  However, due to the fact that this
// example does not have a database, the complete Twitter profile is serialized
// and deserialized.
passport.serializeUser(function(user, cb) {
  cb(null, user);
});

passport.deserializeUser(function(obj, cb) {
  cb(null, obj);
});


// Create a new Express application.
var app = express();

// Configure view engine to render EJS templates.
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');

// Use application-level middleware for common functionality, including
// logging, parsing, and session handling.
app.use(require('morgan')('combined'));
app.use(require('body-parser').urlencoded({ extended: true }));
app.use(require('express-session')({ secret: 'keyboard cat', resave: true, saveUninitialized: true }));

// Initialize Passport and restore authentication state, if any, from the
// session.
app.use(passport.initialize());
app.use(passport.session());


// Define routes.
app.get('/',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    res.render('home', { user: req.user });
  });

app.get('/login',
  function(req, res){
    console.log('ENV');
    console.log(process.env);
    console.log('Headers:');
    console.log(req.headers)
    res.render('login');
  });

app.get('/login/twitter',
  passport.authenticate('twitter'));

app.get('/oauth/callback',
  passport.authenticate('twitter', { failureRedirect: '/login' }),
  function(req, res) {
    res.redirect('/');
  });

app.get('/profile',
  require('connect-ensure-login').ensureLoggedIn(),
  function(req, res){
    res.render('profile', { user: req.user });
  });

app.get('/tweets',
        require('connect-ensure-login').ensureLoggedIn(),
        function(req, res) {

            var T = new Twit({
                consumer_key: process.env['TWITTER_CONSUMER_KEY'],
                consumer_secret: process.env['TWITTER_CONSUMER_SECRET'],
                access_token: req.user.token,
                access_token_secret: req.user.tokenSecret,
                timeout_ms:           60*1000,  // optional HTTP request timeout to apply to all requests.
                strictSSL:            true,     // optional - requires SSL certificates to be valid.
            })

	    // Fetch the tweets
            T.get('statuses/home_timeline', { count: 50,
                                              tweet_mode: 'extended' },
                  async (err, tweets, response) => {

		      // create an agent to contact our tone service
                      const agent = axios.create({
                          timeout: 5000,
                      });

		      // get the actual full texts for teach tweet
		      let texts = tweets.map(tweet => {
			  let status = tweet.retweeted_status || tweet;
                          let text = status.full_text;

			  return text;
		      });

		      // POST to our tone analyser service
		      try {
                          let resp = await agent.post(tone_url, {texts: texts});
			  let tones = resp.data.tones;
			  console.log(tones);

			  for (i=0; i < tweets.length; i++) {
			      tweets[i].tones = tones[i];
			  }
                      } catch (error) {
                          console.error(error);
                      }


		      // Filter just the tweets that are joyful
		      let joy_tweets = tweets.filter(tweet => {
			  if(tweet.user.protected) {
                              return false;
                          }

                          if (tweet.tones) {
			      if (tweet.tones.anger > 0.5) {
				  return false;
			      }

			      if (tweet.tones.joy > 0.7) {
				  return true;
			      }
			  }

			  return false;
		      });
                      res.json({'tweets': joy_tweets});
                  })
        });

app.listen(process.env['PORT'] || 8080);
