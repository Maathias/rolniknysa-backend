const express = require('express'),
	path = require('path'),
	bodyParser = require('body-parser'),
	multer = require('multer'),
	upload = multer({ dest: 'uploads/' }),
	logger = require('pretty-log'),
	mongoose = require('mongoose'),
	marked = require('marked'),
	hubhooks = require('./hubhooks'),
	config = require('./config.json'),
	app = express()

logger.templates = {...logger.templates, ...{
	error: "$red"
}}

logger.values = {...logger.values, ...{
	red: "chalk.red(data.data)"
}}

mongoose.connect(`mongodb://${config.db.hostname}/${config.db.name}`, { useNewUrlParser: true, useUnifiedTopology: true });

var db = mongoose.connection;
db.on('error', err => {
	throw err
});
db.once('open', () => {
	logger.log({
		data: "DB Connected",
		action: 'info'
	})
});

var articleSchema = new mongoose.Schema({
	src: String,
	title: String,
	img: Array,
	content: String,
	tags: Array,
	date: Date,
	author: String,
	stats: {
		views: Number
	}
}, { collection: 'articles' }),

	picSchema = new mongoose.Schema({
		src: String,
		original: String,
		mimetype: String,
		path: String,
		size: Number,
		meta: {
			date: Date,
			author: String
		},
		stats: {
			views: Number
		}
	}, { collection: 'images' })

var Article = mongoose.model('Article', articleSchema),
	Pic = mongoose.model('Pic', picSchema);

function friendlySrc(src, max = Infinity){
	src = src.toLowerCase()

	for (let c of [['ą', 'a'], ['ż', 'z'], ['ś', 's'], ['ź', 'z'], ['ę', 'e'], ['ć', 'c'], ['ń', 'c'], ['€', 'u'], ['ó', 'o'], ['ł', 'l']])
		src = src.replace(c[0], c[1])

	src = src.replace(/[^a-zA-Z0-9]/gm, '-')

	while (src.length > max) {
		nsrc = src.slice(0, src.lastIndexOf('-'))
		if (nsrc.length == src.length) break
		src = nsrc
	}

	return src
}

function getArt(src){
	return new Promise((resolve, reject) => {
		Article.findOne({src: src}, function (err, article) {
			if(err) throw err
			if(article === null) reject(null)
			resolve(article)
		})
	})
}

function getArtLast(n){
	return new Promise((resolve, reject) => {
		Article.find().sort('-date').limit(n).exec(function (err, articles) {
			resolve(articles)
		});
	})
}

function getArtByTags(tags){
	return new Promise((resolve, reject) => {
		Article.find({ tags: { $in: tags } }, function (err, articles) {
			if (err) reject(err)
			resolve(articles)
		})
	})
}

function getArtByContent(content){
	return new Promise((resolve, reject) => {
		Article.find({ $text: { $search: content } }, function (err, articles) {
			if (err) reject(err)
			resolve(articles)
		})
	})
}

function getArtPreview(src){
	return new Promise((resolve, reject) => {
		Article.findOne({ src: src }, { content: 1 }, function (err, article) {
			if (err) throw err
			if (article === null) reject(null)
			article.content = article.content.slice(0, config.articleDescriptionLimit) + (article.content.length > config.articleDescriptionLimit ? "..." : "")
			resolve(article)
		})
	})
}

function getArtByQuery(filter, projection = {}) {
	return new Promise((resolve, reject) => {
		Article.find(filter, projection, function (err, articles) {
			if (err) reject(err)
			resolve(articles)
		})
	})
}

app.use(bodyParser.json())
app.set('view engine', 'ejs');
app.locals = {
	...app.locals, ...{
		mark: function(string){
			return marked(string)
		},
		dateFormat: function (date) {
			date = new Date(date),
				hrs = date.getHours(),
				min = date.getMinutes()
			return `${['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'][date.getDay()]} ${date.toLocaleDateString()} ${hrs >= 10 ? hrs : '0' + hrs}:${min >= 10 ? min : '0' + min}`
		},
		articleDescriptionLimit: config.articleDescriptionLimit
	}
}

app.get('/', (req, res) => {
	getArtLast(5)
		.then(articles => res.render(path.join(__dirname, "views", "index.ejs"), {
			articles: articles
		}))
})

app.get('/dashboard', (req, res) => {
	res.render(path.join(__dirname, "views", "dashboard.ejs"))
})

app.get('/dashboard/articles/new', (req, res) => {
	res.render(path.join(__dirname, "views", "upload.ejs"))
})

app.post('/dashboard/articles/upload', upload.single('files'), (req, res) => {
	var title = req.body.title,
		src = friendlySrc(title, 75),
		author = req.body.author,
		file = {
			src: friendlySrc(req.file.originalname),
			original: req.file.originalname,
			mimetype: req.file.mimetype,
			path: req.file.destination + req.file.filename,
			size: req.file.size,
		}

	db.collection('images').insertOne(new Pic({
		src: file.src,
		original: file.original,
		mimetype: file.mimetype,
		path: file.path,
		size: file.size,
		meta: {
			date: new Date,
			author: req.body.author
		},
		stats: {
			views: 0
		}
	}), (err, res) => {
		if (err) logger.log({
			action: 'error',
			data: err
		})
		logger.log({
			action: 'info',
			data: "New Pic"
		})
	})

	db.collection('articles').insertOne(new Article({
		title: title,
		src: src,
		img: ['/img/' + file.src, 'imagedescription'],
		content: marked(req.body.content),
		tags: [],
		date: new Date(),
		author: author,
		stats: {
			views: 0
		}
	}), (err, res) => {
		if(err) logger.log({
			action: 'error',
			data: err
		})
			logger.log({
				action: 'info',
				data: "New Article"
			})
	})
	res.send('ok')
})

app.get('/img/:imgid', (req, res) => {
	Pic.findOne({ src: req.params.imgid }, (err, pic) => {
		if(err || pic === null){
			res.status(404)
			res.end()
			return
		}
		res.contentType(pic.mimetype);
		res.sendFile(path.join(__dirname, pic.path))
	})
})

app.get('/tag/:tags', (req, res) => {
	getArtByTags(tags = req.params.tags.split(',').filter(Boolean))
		.then(articles => res.render(path.join(__dirname, "views", "tags.ejs"), {
			tags: tags,
			articles: articles
		}))
})

app.get('/tag/', (req, res) => {
	getArtLast(10)
		.then(articles => res.render(path.join(__dirname, "views", "tags.ejs"), {
			tags: [],
			articles: articles
		}))
})

app.get('/search', (req, res) => {
	var time = process.hrtime()
	getArtByContent(req.query.q)
		.then(articles => res.render(path.join(__dirname, "views", "search.ejs"), {
			articles: articles,
			meta: {
				results: articles.length,
				time: (function(){
					time = process.hrtime(time)
					return (time[0]+time[1]/1e9).toPrecision(2)
				})(),
				query: req.query.q
			}
		}))
})

app.get('/article/:title', (req, res) => {
	Promise.all([getArt(req.params.title), getArtLast(5)])
		.then(([article, articles]) => {
			article.stats.views++
			article.save()
			res.render(path.join(__dirname, "views", "article.ejs"), {
				article: article,
				articles: articles
			})
		})
		.catch(err => {
			res.status(404)
			res.end()
		})
	
})

app.post('/api/github/webhook', hubhooks, (req, res) => {
	res.end('OK')
})

app.use(express.static(path.join(__dirname, config.root)), express.static('public'))
app.listen(config.port, () => logger.log({
	data: `Listening on port ${config.port}`,
	action: 'info'
}))