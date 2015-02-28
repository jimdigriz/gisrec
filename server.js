const express = require("express");
const app = express();
const http = require("http");
const server = http.createServer(app);
const ws = require("ws");
const net = require("net");
const WebSocketServer = require("ws").Server;
const wss = new WebSocketServer({ server: server }); 
const es = require("event-stream");
const fs = require("fs");
const mkdirp = require('mkdirp');

const KNOTS_TO_METRES_PER_SECOND = 0.51444444444;

app.use("/", express.static(__dirname + "/www"));

wss.on("connection", function (ws) {
		ws.on("message", function(message) {
		console.log("received: %s", message);
	});
	ws.send("something");
});

// http://aprs.gids.nl/nmea/#rmc
const reGPRMC = /^\$GPRMC,([0-9]{6}(?:\.[0-9]+)?),([AV]),([0-9]+(?:\.[0-9]+)?),([NS]),([0-9]+(?:\.[0-9]+)?),([EW]),([0-9]+(?:\.[0-9]+)?),([0-9]+(?:\.[0-9]+)?),([0-9]{6}),([0-9]+(?:\.[0-9]+)?),([EW])\*([0-9]+)$/;

// http://www.yourgps.de/marketplace/products/documents/xexun/User-Manual-XT-009.pdf
const reXEXUN = /^([0-9]{12}),(\+?[0-9]+),(GPRMC,.*),,,[A-Z](\*[0-9]+),([FL]),([^,]*), ?imei:([0-9]*),([0-9]*),([0-9]+(?:\.[0-9]+)?),([FL]):([0-9]+(?:\.[0-9]+)?)V,([01]),([0-9]+),([0-9]+),([0-9]+),([0-9]+),([0-9A-F]+),([0-9A-F]+)$/;

var gis = net.createServer(function(client) {
	var	remoteAddress = client.remoteAddress,
		remotePort = client.remotePort;
	console.log("["+remoteAddress+"]:"+remotePort+": connected");

	client.on("close", function(client) {
		console.log("["+remoteAddress+"]:"+remotePort+": disconnected");
	});
	client.pipe(es.split()).pipe(es.map(function (data) {
		var meta = {
			id: null,
			raw: data,
			source: { address: remoteAddress, port: remotePort },
			recvts: (new Date()).toISOString(),
		};

		switch (true) {
		case data === "":
			break;
		case reXEXUN.test(data):
			console.log("["+remoteAddress+"]:"+remotePort+": converting xexun");

			meta.xexun		= {};
			meta.protocol		= 'xexun';

			var match = reXEXUN.exec(data);
			meta.xexun.serial	= match[1];	// gps date + gps time
			meta.xexun['admin-tel']	= match[2];
			data			= "$"+match[3]+",000.00,E"+match[4];
			meta.xexun['gps-fix']	= ( match[5] === "F" ) ? 1 : 0;
			meta.xexun.message	= match[6];
			meta.xexun.imei		= match[7];
			meta.xexun.satellites	= parseInt(match[8]);
			meta.xexun.altitude	= parseFloat(match[9]);
			meta.xexun.battery	= {
				charged: ( match[10] === "F" ) ? 1 : 0,
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
			console.log("["+remoteAddress+"]:"+remotePort+": recording gprmc");
			processGPRMC(meta, data);
			break;
		default:
			console.log("["+remoteAddress+"]:"+remotePort+": unknown format");
			client.end();
		}
	}));
});

server.listen(process.env.PORT_HTTP || 27270, "::");
gis.listen(process.env.PORT_GIS || 27271, "::");

function processGPRMC(payload, data) {
	if (payload.id === null) {
		console.log("'id' is not set, unable to save data");
		return;
	}

	var match = reGPRMC.exec(data);
	var	time = match[1],
		validity = ( match[2] === "A" ) ? 1 : 0,
		latitude = parseFloat(match[3]),	hemisphere = match[4],
		longitude = parseFloat(match[5]),	handedness = match[6],
		speed = parseFloat((match[7]*KNOTS_TO_METRES_PER_SECOND).toPrecision(3)),
		cmg = parseFloat(match[8]),
		date = match[9],
		magvar = parseFloat(match[10]),		maghandedness = match[11],
		checksum = parseInt(match[12]);

	var	dateParts = /([0-9]{2})([0-9]{2})([0-9]{2})/.exec(date);
	var	d = dateParts[1], m = dateParts[2] - 1, y = "20"+dateParts[3];
	var	timeParts = /([0-9]{2})([0-9]{2})([0-9]{2})(?:\.([0-9]{3}))/.exec(time);
	var	H = timeParts[1], M = timeParts[2], S = timeParts[3], ms = timeParts[4] || 0;

	var	isoDate = (new Date(y, m, d, H, M, S, ms)).toISOString();

	payload.ts	= isoDate;
	payload.data	= {
		"coords":		[ GPRMC2Degrees(latitude, hemisphere), GPRMC2Degrees(longitude, handedness) ],
		"speed":		speed,
		"course-made-good":	cmg,
		"magnetic-variance":	GPRMC2Degrees(magvar, maghandedness),
		"checksum":		checksum,
	};

	mkdirp.sync("data/"+payload.id);
	fs.writeFileSync("data/"+payload.id+"/"+isoDate+".json", JSON.stringify(payload));
}

function GPRMC2Degrees (value, direction) {
	// http://www.mapwindow.org/phorum/read.php?3,16271
	var d = ((value/100) | 0) + (value - (((value/100) | 0) * 100)) / 60;

	if (direction === "S" || direction === "W")
		d *= -1;

	// http://en.wikipedia.org/wiki/Decimal_degrees#Precision
	return parseFloat(d.toPrecision(5));
}
