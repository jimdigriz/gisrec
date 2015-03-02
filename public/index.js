var debug = false;

var map = L.map('map').fitWorld().zoomIn();

L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
	attribution: "Map data &copy; <a href='http://osm.org/copyright'>OpenStreetMap</a> contributors"
}).addTo(map);

var sidebar = L.control.sidebar('sidebar').addTo(map);

var channel = { };

var tag = 0;
var connection = new WebSocket('ws://' + location.host);
connection.onopen = function() {
	function log(m) {
		if (debug)
			console.log('GISrec:ws: '+m);
	}

	log('connected');

	connection.onclose = function(e) { log('disconnected: '+e); };
	connection.onmessage = function(e) {
		log("message: "+e.data);

		var message = JSON.parse(e.data);

		switch (message.type) {
		case 'error':
			break;
		case 'realtime':
			if (channel[message.channel] === undefined) {
				channel[message.channel] = L.geoJson(message.geojson).addTo(map);
			} else {
				channel[message.channel].addData(message.geojson);
			}
			break;
		}
	};
};

function jsonpRequest(url) {
	var script = document.createElement("script");
	script.src = url;
	script.onload = function(e) {
		document.body.removeChild(this);
	};
	document.body.appendChild(script);
}
jsonpRequest("/data")

function deviceList(payload) {
	var ul = document.getElementById('device-list');
	for (var d in payload.devices) {
		var id = payload.devices[d];

		var li = document.createElement('li');
		li.setAttribute('id', id);

		li.appendChild(document.createTextNode(id));
		li.appendChild(deviceListCheckbox(id, 'location-arrow'));
		li.appendChild(deviceListCheckbox(id, 'history'));

		ul.appendChild(li);
	}
}

function deviceListCheckbox(id, type) {
	var form = document.createElement('form');

	var input = document.createElement('input');
	input.setAttribute('id', type+' '+id);
	input.setAttribute('type', 'checkbox');
	input.setAttribute('onclick', 'javascript:check(this)');
	form.appendChild(input);

	var label = document.createElement('label');
	label.setAttribute('for', type+' '+id);
	form.appendChild(label);

	var box = document.createElement('i');
	box.setAttribute('class', 'fa fa-'+type);
	label.appendChild(box);

	return form;
}

function check(element) {
	var type = element.id.split(' ')[0];
	var chan = element.id.split(' ')[1] || null;

	switch (type) {
	case "debug":
		debug = (element.checked) ? true : false;
		break;
	case "location-arrow":
		connection.send(JSON.stringify({
			tag:		tag++,
			type:		(element.checked) ? 'join' : 'leave',
			channel:	chan,
		}));

		if (!element.checked && channel[chan] !== undefined) {
			channel[chan].removeFrom(map);
			delete channel[chan];
		}
		break;
	}
}
