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

const KNOTS_TO_METRES_PER_SECOND = 0.51444444444;

app.use("/", express.static(__dirname + "/public"));

wss.on("connection", function (ws) {
	ws.on("message", function(message) {
		console.log(message);
	});
});

// http://aprs.gids.nl/nmea/#rmc
const reGPRMC = /^\$GPRMC,([0-9]{6}(?:\.[0-9]+)?)?,([AV])?,([0-9]+(?:\.[0-9]+)?)?,([NS])?,([0-9]+(?:\.[0-9]+)?)?,([EW])?,([0-9]+(?:\.[0-9]+)?)?,([0-9]+(?:\.[0-9]+)?)?,([0-9]{6})?,([0-9]+(?:\.[0-9]+)?)?,([EW])?\*([0-9]+)$/;

// http://www.yourgps.de/marketplace/products/documents/xexun/User-Manual-XT-009.pdf
const reXEXUN = /^([0-9]{12}),(\+?[0-9]+),(GPRMC,.*,,),[A-Z](\*[0-9]+),([FL]),([^,]*), ?imei:([0-9]*),([0-9]*),([0-9]+(?:\.[0-9]+)?),([FL]):([0-9]+(?:\.[0-9]+)?)V,([01]),([0-9]+),([0-9]+),([0-9]+),([0-9]+),([0-9A-F]+),([0-9A-F]+)$/;

try {
	fs.statSync("data")
} catch(e) {
	fs.mkdirSync("data");
}

var gis = net.createServer(function(client) {
	var	remoteAddress = client.remoteAddress,
		remotePort = client.remotePort;
	console.log("["+remoteAddress+"]:"+remotePort+": connected");

	client.on("close", function(client) {
		console.log("["+remoteAddress+"]:"+remotePort+": disconnected");
	});
	client.pipe(es.split()).pipe(es.map(function (data) {
		var meta = {
			"id":		null,
			"raw":		data,
			"source":	{ address: remoteAddress, port: remotePort },
			"recv-time":	(new Date())/1000.0,
			"protocol":	[],
		};

		switch (true) {
		case data === "":
			break;
		case reXEXUN.test(data):
			console.log("["+remoteAddress+"]:"+remotePort+": converting xexun");

			meta.xexun		= {};
			meta.protocol.push("xexun");

			var match = reXEXUN.exec(data);
			meta.xexun.serial	= match[1];	// gps date + gps time
			meta.xexun["admin-tel"]	= match[2];
			data			= "$"+match[3]+match[4];
			meta.xexun["gps-fix"]	= ( match[5] === "F" ) ? 1 : 0;
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
			meta.protocol.push("gprmc");
			var g = processGPRMC(data, meta);
			if (g === undefined)
				client.end();
			break;
		default:
			console.log("["+remoteAddress+"]:"+remotePort+": unknown format");
			client.end();
		}
	}));
});

server.listen(process.env.PORT_HTTP || 27270, "::");
gis.listen(process.env.PORT_GIS || 27271, "::");

function processGPRMC(data, properties) {
	if (properties.id === null) {
		console.log("'id' is not set, unable to save data");
		return;
	}

	var match = reGPRMC.exec(data);
	var	time = match[1],
		validity = ( match[2] === "A" ) ? 1 : 0,
		latitude = parseFloat(match[3]),	hemisphere = match[4],
		longitude = parseFloat(match[5]),	handedness = match[6],
		speed = parseFloat((match[7]*KNOTS_TO_METRES_PER_SECOND).toFixed(3)),
		cmg = parseFloat(match[8]),
		date = match[9],
		magvar = parseFloat(match[10]),		maghandedness = match[11],
		checksum = parseInt(match[12]);

	var	dateParts = /([0-9]{2})([0-9]{2})([0-9]{2})/.exec(date);
	var	d = dateParts[1], m = dateParts[2] - 1, y = "20"+dateParts[3];
	var	timeParts = /([0-9]{2})([0-9]{2})([0-9]{2})(?:\.([0-9]{3}))/.exec(time);
	var	H = timeParts[1], M = timeParts[2], S = timeParts[3], ms = timeParts[4] || 0;

	var	ts = new Date(y, m, d, H, M, S, ms);

	var multipoint = [ {
		latitude:	GPRMC2Degrees(latitude, hemisphere),
		longitude:	GPRMC2Degrees(longitude, handedness),
		time:		parseFloat((ts/1000.0).toFixed(3)),
	} ];

	properties.gprmc			= {};
	properties.gprmc.raw			= data;
	properties.gprmc.speed			= speed;
	properties.gprmc["course-made-good"]	= cmg;
	properties.gprmc["magnetic-variance"]	= GPRMC2Degrees(magvar, maghandedness);
	properties.gprmc.checksum		= checksum

	var g = toGeoJSON(multipoint, properties);

	try {
		fs.statSync("data/"+properties.id)
	} catch(e) {
		console.log("unregistered device: "+properties.id);
		informRealtime("unregistered", g);
		return;
	}

	fs.writeFileSync("data/"+properties.id+"/"+ts.toISOString()+".json", JSON.stringify(g));
	informRealtime(properties.id, g);

	return g;
}

function GPRMC2Degrees(value, direction) {
	// http://www.mapwindow.org/phorum/read.php?3,16271
	var d = ((value/100) | 0) + (value - (((value/100) | 0) * 100)) / 60;

	if (direction === "S" || direction === "W")
		d *= -1;

	// http://en.wikipedia.org/wiki/Decimal_degrees#Precision
	return parseFloat(d.toFixed(5));
}

function toGeoJSON(multipoint, prop) {
	prop.time = [];

	var geojson = {
		type:			"Feature",
		geometry: {
			type:		"MultiPoint",
			coordinates:	[],
		},
		properties:		prop,
	};

	multipoint.forEach(function(m) {
		geojson.geometry.coordinates.push([ m.longitude, m.latitude ]);
		geojson.properties.time.push(m.time);
	});

	return geojson;
}

function informRealtime(id, g) {
	wss.clients.forEach(function(c) {
		c.send(JSON.stringify({ type: "realtime", id: id, geojson: g }));
	});
}
