var axios = require('axios');
require('dotenv').config();

// get credentials
tone_url = process.env['TONE_URL'] + '/v3/tone?version=2017-09-21';
apikey = process.env['TONE_KEY'];

async function get_tones() {

    const agent = axios.create({
	timeout: 1000,
	auth: {username: 'apikey',
	       password: apikey}
    });

    let data = [{"text": "I love the world!"},
		{"text": "I hate the world!"}];

    let tweets = await Promise.all(data.map(async tweet => {
	let text = tweet.text;
	let tones = await agent.post(tone_url, {text: text});
	tweet.tones = tones.data.document_tone.tones;
	return tweet;
    }))

    tweets = tweets.filter(tweet => {
	for (let i=0; i<tweet.tones.length; i++) {
	    if(tweet.tones[i].tone_id == 'joy') {
		return true;
	    }
	}
    })

    console.log(JSON.stringify(tweets, null, 4));
}

get_tones();
