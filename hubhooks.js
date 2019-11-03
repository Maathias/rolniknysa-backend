const crypto = require('crypto'),
	secret = require('./config').hubhooks.secret
	
module.exports = function verifyPostData(req, res, next) {
	const payload = JSON.stringify(req.body)
	if (!payload) {
		return next('Request body empty')
	}

	const hmac = crypto.createHmac('sha1', secret)
	const digest = 'sha1=' + hmac.update(payload).digest('hex')
	const checksum = req.get('X-Hub-Signature')
	if (!checksum || !digest || checksum !== digest) {
		return next(`Request body digest did not match signature`)
	}
	return next()
}