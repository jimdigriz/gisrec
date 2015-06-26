const WebSocketServer = require('ws').Server
	, http = require('http')
	, express = require('express')
	, app = express()
	, server = http.createServer(app)
	, wss = new WebSocketServer({ server: server })
	, net = require('net')
	, es = require('event-stream')
	, fs = require('fs')
	, rimraf = require('rimraf')
	, url = require('url')
	, compress = require('compression')
	, Promise = require('es6-promise').Promise

const KNOTS_TO_METRES_PER_SECOND = 0.51444

try {
	fs.statSync(__dirname+'/data')
} catch(e) {
	try {
		fs.mkdirSync(__dirname+'/data')
	} catch (e) { }
}

app.use(compress())
app.use(express.static(__dirname+'/public'))
app.use('/lib/font-awesome', express.static(__dirname+'/node_modules/font-awesome'))
app.use('/lib/bootstrap', express.static(__dirname+'/node_modules/bootstrap/dist'))
app.use('/lib/es6-promise', express.static(__dirname+'/node_modules/es6-promise/dist'))
app.use('/lib/openlayers', express.static(__dirname+'/node_modules/openlayers/dist'))
app.use('/lib/ol3-layerswitcher', express.static(__dirname+'/ol3-layerswitcher/src'))
app.use('/lib/vis', express.static(__dirname+'/node_modules/vis/dist'))
app.use('/lib/jquery', express.static(__dirname+'/node_modules/jquery/dist'))

app.all('/channel/:channel?/:file?', function(req, res) {
	channels().then(function(channels) {
		if (req.params.channel === undefined)
			return res.jsonp({ channels: channels })

		if (channels[req.params.channel] === undefined)
			res.status(404).jsonp({ error: 'channel does not exist' })
		else {
			switch (req.method) {
			case 'GET':
				if (req.params.file !== undefined) {
					var opt = { root: __dirname+'/data' }
					res.sendFile(req.params.channel+'/'+req.params.file, opt, function(err){
						if (err)
							res.status(err.status).jsonp({ error: err.code })
					})
				} else {
					list(req.params.channel, req.query.start, req.query.end).then(function(matches) {
						res.jsonp({ files: matches })
					})
				}
				break
			case 'PUT':
				put(res, req.params.channel)
				break
			case 'DELETE':
				rimraf(__dirname+'/data/'+req.params.channel, function(err) {
					if (err)
						res.status(500).jsonp({ error: err })
					else
						res.status(204).jsonp(null)
				})
				break
			default:
				res.status(405).jsonp({ error: 'unsupported method' })
			}
		}
	}, function(err) {
		res.status(500).jsonp({ error: err })
	})

	function put(res, chan) {
		if (fs.statSync(__dirname+'/data/'+chan).isDirectory())
			return res.status(428).jsonp({ error: 'channel already registered' })

		fs.readFile(__dirname+'/data/'+chan, function(err, data) {
			var ts = new Date(JSON.parse(data).properties.time * 1000)

			fs.mkdir(__dirname+'/data/'+chan, function(err) {
				fs.rename(__dirname+'/data/'+chan, __dirname+'/data/'+chan+'/'+ts.toISOString()+'.json', function(err) {
					res.status(204).jsonp(null)
				})
			})
		})
	}
})

function channels() {
	return new Promise(function(resolve, reject) {
		fs.readdir(__dirname+'/data', function(err, files) {
			if (err)
				return reject(err)

			var channels = {}
			files.map(function (c) {
				if (fs.statSync(__dirname+'/data/'+c).isFile() && /\.json$/.test(c))
					channels[c.replace(/\.json$/, '')] = { registered: false }
				else if (fs.statSync(__dirname+'/data/'+c).isDirectory())
					channels[c] = { registered: true }
			})

			resolve(channels)
		})
	})
}

function list(chan, start, end) {
	return new Promise(function(resolve, reject) {
		fs.readdir(__dirname+'/data/'+chan, function(err, files) {
			if (err)
				return reject(err)

			var matches = []
			files.sort().forEach(function(f) {
				var t = new Date(f.replace(/\.json$/, '')).getTime()
				if (start && (new Date()).setTime(start) > t)
					return
				if (end && (new Date()).setTime(end) < t)
					return
				matches.push(f.replace(/\.json$/, ''))
			})

			resolve(matches)
		})
	})
}

var	client = {},
	iid = 0
wss.on('connection', function(ws) {
	var id = iid++
	client[id] = {
		ws: ws,
		subs: []
	}

	var	remoteAddress = ws._socket.remoteAddress,
		remotePort = ws._socket.remotePort

	function log(m) {
		console.log('ws: ['+remoteAddress+']:'+remotePort+': '+m)
	}

	log('connected')

	ws.on('close', function() {
		log('disconnected')
		delete client[id]
	})

	ws.on('message', function(msg) {
		log('message: '+msg)

		var message = JSON.parse(msg)

		if (message.type === 'error') {
			log('error: '+message.text)
			return
		}

		if (message.tag === undefined) {
			ws.send(JSON.stringify({
				tag:	null,
				type:	'error',
				text:	'missing tag',
			}))
			return
		}

		switch (message.type) {
		case 'realtime':
			channels().then(function(channels) {
				var file;
				if (!channels[message.channel]) {
					ws.send(JSON.stringify({
						tag: message.tag,
						type: 'error',
						text: 'no such channel'
					}))
					return
				} else if (channels[message.channel].registered) {
					list(message.channel).then(function(files) {
						var file = __dirname+'/data/'+message.channel+'/'+files.pop()+'.json'
						ws.send(JSON.stringify({
							tag:		message.tag,
							type:		'realtime',
							channel:	message.channel,
							geojson:	JSON.parse(fs.readFileSync(file))
						}))
					})
				} else {
					var file = __dirname+'/data/'+message.channel+'.json'
					ws.send(JSON.stringify({
						tag:		message.tag,
						type:		'realtime',
						channel:	message.channel,
						geojson:	JSON.parse(fs.readFileSync(file))
					}))
				}
			})
			break
		case 'subscribe':
			var rules = []
			try {
				message.rules.forEach(function(re) {
					rules.push(new RegExp(re))
				})
				client[id].subs = rules
			}
			catch (e) {
				ws.send(JSON.stringify({
					tag:	message.tag,
					type:	'error',
					text:	'invalid regex: '+e,
				}))
			}
			break
		default:
			ws.send(JSON.stringify({
				tag:	message.tag,
				type:	'error',
				text:	"unknown command '"+message.type+"'",
			}))
			break
		}
	})
})

server.listen(process.env.PORT_HTTP || 27270, '::')

// http://aprs.gids.nl/nmea/#rmc
const reGPRMC = /^\$GPRMC,([0-9]{6}(?:\.[0-9]+)?)?,([AV])?,([0-9]+(?:\.[0-9]+)?)?,([NS])?,([0-9]+(?:\.[0-9]+)?)?,([EW])?,([0-9]+(?:\.[0-9]+)?)?,([0-9]+(?:\.[0-9]+)?)?,([0-9]{6})?,([0-9]+(?:\.[0-9]+)?)?,([EW])?\*([0-9A-F]+)$/

// http://www.yourgps.de/marketplace/products/documents/xexun/User-Manual-XT-009.pdf
const reXEXUN = /^([0-9]+),(\+?[0-9]+),(GPRMC,.*,,),[A-Z](\*[0-9A-F]+),([FL]),([^,]*), ?imei:([0-9]*),([0-9]*),(-?[0-9]+(?:\.[0-9]+)?),([FL]):([0-9]+(?:\.[0-9]+)?)V,([01]),([0-9]+),([0-9]+),([0-9]+),([0-9]+),([0-9A-F]+),([0-9A-F]+)$/

var gis = net.createServer(function(sock) {
	var	remoteAddress = sock.remoteAddress,
		remotePort = sock.remotePort

	function log(m) {
		console.log('gis: ['+remoteAddress+']:'+remotePort+': '+m)
	}

	log('connected')

	sock.on('close', function() {
		log('disconnected')
	})
	sock.pipe(es.split()).pipe(es.map(function(data) {
		var meta = {
			'id':		null,
			'raw':		data,
			'source':	{ address: remoteAddress, port: remotePort },
			'recv-time':	(new Date())/1000.0,
			'protocol':	[],
		}

		switch (true) {
		case data === '':
			break
		case reXEXUN.test(data):
			log('received Xexun payload, converting to GPRMC')

			meta.xexun		= {}
			meta.protocol.push('xexun')

			var match = reXEXUN.exec(data)
			meta.xexun.serial	= match[1]	// gps date + gps time
			meta.xexun['admin-tel']	= match[2]
			data			= '$'+match[3]+match[4]
			meta.xexun['gps-fix']	= ( match[5] === 'F' ) ? 1 : 0;
			meta.xexun.message	= match[6]
			meta.xexun.imei		= match[7]
			meta.xexun.satellites	= parseInt(match[8])
			meta.xexun.altitude	= parseFloat(match[9])
			meta.xexun.battery	= {
				charged: ( match[10] === 'F' ) ? 1 : 0,
				voltage: parseFloat(match[11]),
				charging: parseInt(match[12]),
			}
			meta.xexun.length	= parseInt(match[13]),
			meta.xexun.crc16	= parseInt(match[14]),
			meta.xexun.gsm	= {
				mcc: parseInt(match[15]),
				mnc: parseInt(match[16]),
				lac: match[17],
				cellid: match[18],
			}

			meta.id = meta.xexun.imei
		case reGPRMC.test(data):
			log('processing GPRMC')
			meta.protocol.push('gprmc')
			processGPRMC(data, meta)
			break
		default:
			log("received unparsable data: '"+data+"', closing connection")
			sock.end()
		}
	}))

	function processGPRMC(data, properties) {
		if (properties.id === null) {
			log("'id' is not set, unable to save data")
			return
		}
		if (!/^[0-9a-zA-Z]+$/.test(properties.id)) {
			log("'id' is not valid, unable to save data")
			return
		}

		var match = reGPRMC.exec(data)
		if (!match) {
			log("reGPRMC does not match")
			return
		}

		var	time = match[1],
			validity = ( match[2] === 'A' ) ? 1 : 0,
			latitude = parseFloat(match[3]),	hemisphere = match[4],
			longitude = parseFloat(match[5]),	handedness = match[6],
			speed = parseFloat((match[7]*KNOTS_TO_METRES_PER_SECOND).toFixed(3)),
			cmg = parseFloat(match[8]),
			date = match[9],
			magvar = parseFloat(match[10]),		maghandedness = match[11],
			checksum = parseInt(match[12])

		var	dateParts = /([0-9]{2})([0-9]{2})([0-9]{2})/.exec(date)
		var	d = dateParts[1], m = dateParts[2] - 1, y = '20'+dateParts[3]
		var	timeParts = /([0-9]{2})([0-9]{2})([0-9]{2})(?:\.([0-9]{3}))/.exec(time)
		var	H = timeParts[1], M = timeParts[2], S = timeParts[3], ms = timeParts[4] || 0

		var	ts = new Date(y, m, d, H, M, S, ms)

		var point = {
			latitude:	GPRMC2Degrees(latitude, hemisphere),
			longitude:	GPRMC2Degrees(longitude, handedness),
		}

		properties.time				= parseFloat((ts/1000.0).toFixed(3))

		properties.gprmc			= {}
		properties.gprmc.raw			= data
		properties.gprmc.speed			= speed
		properties.gprmc['course-made-good']	= cmg
		properties.gprmc['magnetic-variance']	= GPRMC2Degrees(magvar, maghandedness)
		properties.gprmc.checksum		= checksum

		var g = toGeoJSON(point, properties)
		Object.keys(client).forEach(function(id) {
			client[id].subs.forEach(function(re) {
				if (!re.test(properties.id))
					return

				log('realtime to client '+id)

				client[id].ws.send(JSON.stringify({
					tag:		null,
					type:		'realtime',
					channel:	properties.id,
					geojson:	g,
				}))
			})
		})

		fs.stat(__dirname+'/data/'+properties.id, function(err, stat) {
			var name = properties.id
			if (err === null)
				name = name.concat('/'+ts.toISOString())
			fs.writeFile(__dirname+'/data/'+name+'.json', JSON.stringify(g), cb)

			function cb(err) {
				if (err)
					log('unable to save data: '+err)
			}
		})

		return
	}
})

gis.listen(process.env.PORT_GIS || 27271, '::')

function GPRMC2Degrees(value, direction) {
	// http://www.mapwindow.org/phorum/read.php?3,16271
	var d = ((value/100) | 0) + (value - (((value/100) | 0) * 100)) / 60

	if (direction === 'S' || direction === 'W')
		d *= -1

	// http://en.wikipedia.org/wiki/Decimal_degrees#Precision
	return parseFloat(d.toFixed(5))
}

function toGeoJSON(point, prop) {
	var geojson = {
		type:			'Feature',
		geometry: {
			type:		'Point',
			coordinates:	[ point.longitude, point.latitude ],
		},
		properties:		prop,
	}

	return geojson
}
