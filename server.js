const WebSocketServer = require('ws').Server
	, http = require('http')
	, express = require('express')
	, app = express()
	, server = http.createServer(app)
	, wss = new WebSocketServer({ server: server })
	, net = require('net')
	, es = require('event-stream')
	, fs = require('fs')
	, rimraf = require('rimraf');

const KNOTS_TO_METRES_PER_SECOND = 0.51444;

var client = {};
var channel = {};

try {
	fs.statSync('data')
} catch(e) {
	try {
		fs.mkdirSync('data');
	} catch (e) { }
}

app.use(express.static(__dirname + '/public'));
app.get('/devices', function(req, res) {
	if (req.query.callback === undefined)
		res.status(400).jsonp({ error: "missing 'callback'" });

	fs.readdir('data', function(err, devices) {	// TODO check err and 'valid' channel names
		res.jsonp({ devices: devices.filter(function(d) { return fs.statSync('data/'+d).isDirectory() }) });
	});
});
app.get('/channels', function(req, res) {
	if (req.query.callback === undefined)
		res.status(400).jsonp({ error: "missing 'callback'" });

	fs.readdir('data', function(err, channels) {	// TODO check err and 'valid' chanel names
		res.jsonp({ channels: channels.filter(function(c) {
			if (fs.statSync('data/'+c).isFile())
				return (/\.json$/.test(c)) ? true : false
			else
				return true;
		}).map(function(c) { return c.replace(/\.json$/, '') }) });
	});
});

var iid = 0;
wss.on('connection', function(ws) {
	var id = iid++;
	client[id] = ws;

	var	remoteAddress = ws._socket.remoteAddress,
		remotePort = ws._socket.remotePort;

	function log(m) {
		console.log('ws: ['+remoteAddress+']:'+remotePort+': '+m);
	}

	log("connected")

	ws.on('close', function() {
		log("disconnected")

		Object.keys(channel).forEach(function(chan) {
			channel[chan].splice(channel[chan].indexOf(id), 1);

			if (channel[chan].length === 0)
				delete channel[chan];
		});

		delete client[id];
	});

	ws.on('message', function(msg) {
		log('message: '+msg);

		var message = JSON.parse(msg);

		if (message.type === 'error') {
			log('error: '+message.text);
			return;
		}

		if (message.tag === undefined) {
			ws.send(JSON.stringify({
				tag:	null,
				type:	'error',
				text:	'missing tag',
			}));
			return;
		}

		message.channel.forEach(function(chan) {
			var c = (chan !== null) ? chan : '';

			switch (message.type) {
			case 'join':
				if (channel[c] === undefined)
					channel[c] = [ id ];
				else
					channel[c].push(id);

				break;
			case 'prune':
				if (channel[c] === undefined)
					break;

				channel[c].splice(channel[c].indexOf(id), 1);

				if (channel[c].length === 0)
					delete channel[c];

				break;
			default:
				ws.send(JSON.stringify({
					tag:	tag,
					type:	'error',
					text:	"unknown command '"+message.type+"'",
				}));
				break;
			}
		});
	});
});

server.listen(process.env.PORT_HTTP || 27270, '::');

// http://aprs.gids.nl/nmea/#rmc
const reGPRMC = /^\$GPRMC,([0-9]{6}(?:\.[0-9]+)?)?,([AV])?,([0-9]+(?:\.[0-9]+)?)?,([NS])?,([0-9]+(?:\.[0-9]+)?)?,([EW])?,([0-9]+(?:\.[0-9]+)?)?,([0-9]+(?:\.[0-9]+)?)?,([0-9]{6})?,([0-9]+(?:\.[0-9]+)?)?,([EW])?\*([0-9A-F]+)$/;

// http://www.yourgps.de/marketplace/products/documents/xexun/User-Manual-XT-009.pdf
const reXEXUN = /^([0-9]+),(\+?[0-9]+),(GPRMC,.*,,),[A-Z](\*[0-9A-F]+),([FL]),([^,]*), ?imei:([0-9]*),([0-9]*),(-?[0-9]+(?:\.[0-9]+)?),([FL]):([0-9]+(?:\.[0-9]+)?)V,([01]),([0-9]+),([0-9]+),([0-9]+),([0-9]+),([0-9A-F]+),([0-9A-F]+)$/;

var gis = net.createServer(function(sock) {
	var	remoteAddress = sock.remoteAddress,
		remotePort = sock.remotePort;

	function log(m) {
		console.log('gis: ['+remoteAddress+']:'+remotePort+': '+m);
	}

	log('connected');

	sock.on('close', function() {
		log('disconnected');
	});
	sock.pipe(es.split()).pipe(es.map(function (data) {
		var meta = {
			'id':		null,
			'raw':		data,
			'source':	{ address: remoteAddress, port: remotePort },
			'recv-time':	(new Date())/1000.0,
			'protocol':	[],
		};

		switch (true) {
		case data === '':
			break;
		case reXEXUN.test(data):
			log('received Xexun payload, converting to GPRMC');

			meta.xexun		= {};
			meta.protocol.push('xexun');

			var match = reXEXUN.exec(data);
			meta.xexun.serial	= match[1];	// gps date + gps time
			meta.xexun['admin-tel']	= match[2];
			data			= '$'+match[3]+match[4];
			meta.xexun['gps-fix']	= ( match[5] === 'F' ) ? 1 : 0;
			meta.xexun.message	= match[6];
			meta.xexun.imei		= match[7];
			meta.xexun.satellites	= parseInt(match[8]);
			meta.xexun.altitude	= parseFloat(match[9]);
			meta.xexun.battery	= {
				charged: ( match[10] === 'F' ) ? 1 : 0,
				voltage: parseFloat(match[11]),
				charging: parseInt(match[12]),
			};
			meta.xexun.length	= parseInt(match[13]),
			meta.xexun.crc16	= parseInt(match[14]),
			meta.xexun.gsm	= {
				mcc: parseInt(match[15]),
				mnc: parseInt(match[16]),
				lac: match[17],
				cellid: match[18],
			};

			meta.id = meta.xexun.imei;
		case reGPRMC.test(data):
			log('processing GPRMC');
			meta.protocol.push('gprmc');
			processGPRMC(data, meta);
			break;
		default:
			log("received unparsable data: '"+data+"', closing connection");
			sock.end();
		}
	}));

	function processGPRMC(data, properties) {
		if (properties.id === null) {
			log("'id' is not set, unable to save data");
			return;
		}

		var match = reGPRMC.exec(data);
		var	time = match[1],
			validity = ( match[2] === 'A' ) ? 1 : 0,
			latitude = parseFloat(match[3]),	hemisphere = match[4],
			longitude = parseFloat(match[5]),	handedness = match[6],
			speed = parseFloat((match[7]*KNOTS_TO_METRES_PER_SECOND).toFixed(3)),
			cmg = parseFloat(match[8]),
			date = match[9],
			magvar = parseFloat(match[10]),		maghandedness = match[11],
			checksum = parseInt(match[12]);

		var	dateParts = /([0-9]{2})([0-9]{2})([0-9]{2})/.exec(date);
		var	d = dateParts[1], m = dateParts[2] - 1, y = '20'+dateParts[3];
		var	timeParts = /([0-9]{2})([0-9]{2})([0-9]{2})(?:\.([0-9]{3}))/.exec(time);
		var	H = timeParts[1], M = timeParts[2], S = timeParts[3], ms = timeParts[4] || 0;

		var	ts = new Date(y, m, d, H, M, S, ms);

		var point = {
			latitude:	GPRMC2Degrees(latitude, hemisphere),
			longitude:	GPRMC2Degrees(longitude, handedness),
		};

		properties.time				= parseFloat((ts/1000.0).toFixed(3));

		properties.gprmc			= {};
		properties.gprmc.raw			= data;
		properties.gprmc.speed			= speed;
		properties.gprmc['course-made-good']	= cmg;
		properties.gprmc['magnetic-variance']	= GPRMC2Degrees(magvar, maghandedness);
		properties.gprmc.checksum		= checksum

		var g = toGeoJSON(point, properties);

		fs.stat('data/'+properties.id, function(err, stat) {
			var channels = [ properties.id ];
			if (err !== null)
					channels.push('');

			function cb( err ){
				if (err)
					log('unable to save data: '+err);

				channels.forEach(function(chan) {
					if (channel[chan] === undefined)
						return;

					channel[chan].forEach(function(i) {
						log('realtime to client '+i);

						client[i].send(JSON.stringify({
							tag:		null,
							type:		'realtime',
							channel:	properties.id,
							geojson:	g,
						}));
					});
				});
			};

			var name = properties.id;
			if (err === null)
				name = name.concat('/'+ts.toISOString());
			fs.writeFile('data/'+name+'.json', JSON.stringify(g), cb);	// TODO temp file
		}.bind(g));

		return;
	}
});

gis.listen(process.env.PORT_GIS || 27271, '::');

function GPRMC2Degrees(value, direction) {
	// http://www.mapwindow.org/phorum/read.php?3,16271
	var d = ((value/100) | 0) + (value - (((value/100) | 0) * 100)) / 60;

	if (direction === 'S' || direction === 'W')
		d *= -1;

	// http://en.wikipedia.org/wiki/Decimal_degrees#Precision
	return parseFloat(d.toFixed(5));
}

function toGeoJSON(point, prop) {
	var geojson = {
		type:			'Feature',
		geometry: {
			type:		'Point',
			coordinates:	[ point.longitude, point.latitude ],
		},
		properties:		prop,
	};

	return geojson;
}
