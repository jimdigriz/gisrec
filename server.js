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

app.use("/", express.static(__dirname + "/www"));

wss.on("connection", function (ws) {
		ws.on("message", function(message) {
		console.log("received: %s", message);
	});
	ws.send("something");
});

// http://aprs.gids.nl/nmea/#rmc
const reGPRMC = /^\$GPRMC,([0-9]{6}(?:\.[0-9]+)?),([AV]),([0-9]+(?:\.[0-9]+)?),([NS]),([0-9]+(?:\.[0-9]+)?),([EW]),([0-9]+(?:\.[0-9]+)?),([0-9]+(?:\.[0-9]+)?),([0-9]{6}),(([0-9]+(?:\.[0-9]+)?))?,([ES])?/;

const reXEXUN = /^([0-9]{12}),(\+?[0-9]+),(GPRMC,.*),[A-Z],, imei:([0-9]*),/;

var gis = net.createServer(function(client) {
	var	remoteAddress = client.remoteAddress,
		remotePort = client.remotePort;
	console.log("["+remoteAddress+"]:"+remotePort+": connected");

	client.on("close", function(client) {
		console.log("["+remoteAddress+"]:"+remotePort+": disconnected");
	});
	client.pipe(es.split()).pipe(es.map(function (data) {
		var ts = new Date().getTime();

		switch (true) {
		case data === "":
			break;
		case reXEXUN.test(data):
			console.log("["+remoteAddress+"]:"+remotePort+": converting xexun");
			var match = reXEXUN.exec(data);
			var extra = { serial: match[1], admintel: match[2], imei: match[4] };
			data = "$"+match[3];
		case reGPRMC.test(data):
			console.log("["+remoteAddress+"]:"+remotePort+": recording gprmc");
			processGPRMC(ts, client, data, extra);
			break;
		default:
			console.log("["+remoteAddress+"]:"+remotePort+": unknown format");
			client.end();
		}
	}));
});

server.listen(process.env.HTTP_PORT || 27270, "::");
gis.listen(process.env.GIS_PORT || 27271, "::");

function processGPRMC(ts, client, data, extra) {
	var	id = extra.serial;

	var match = reGPRMC.exec(data);
	var	time = match[1], validity = match[2], latitude = match[3],
		hemisphere = match[4], longitude = match[5], handedness = match[6],
		speed = match[7], cmg = match[8], date = match[9], magvar = match[10],
		maghandedness = match[11];

	var	dateParts = /([0-9]{2})([0-9]{2})([0-9]{2})/.exec(date);
	var	d = dateParts[1], m = dateParts[2] - 1, y = "20"+dateParts[3];
	var	timeParts = /([0-9]{2})([0-9]{2})([0-9]{2})(?:\.([0-9]{3}))/.exec(time);
	var	H = timeParts[1], M = timeParts[2], S = timeParts[3], ms = timeParts[4] || 0;
	var	isoDate = (new Date(y, m, d, H, M, S, ms)).toISOString()

	var payload = {
		ts: isoDate,
		recvts: ts,
		coords: [ GPRMC2Degrees(latitude, hemisphere), GPRMC2Degrees(longitude, handedness) ],
		speed: (speed*0.51444444444).toFixed(3),	// knots to meters per seconds
		extra: extra,
	};

	mkdirp.sync("data/"+id);
	fs.writeFileSync("data/"+id+"/"+isoDate+".json", JSON.stringify(payload));
}

function GPRMC2Degrees (value, direction) {
	// http://www.mapwindow.org/phorum/read.php?3,16271
	var d = ((value/100) | 0) + (value - (((value/100) | 0) * 100)) / 60;

	if (direction == "S" || direction == "W")
		d *= -1;

	// http://en.wikipedia.org/wiki/Decimal_degrees#Precision
	return d.toFixed(5);
}
