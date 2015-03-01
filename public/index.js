var map = L.map('map').fitWorld().zoomIn();

L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
	attribution: "Map data &copy; <a href='http://osm.org/copyright'>OpenStreetMap</a> contributors"
}).addTo(map);

var sidebar = L.control.sidebar('sidebar').addTo(map);

var marker = { };

var tag = 0;
var connection = new WebSocket('ws://' + location.host);
connection.onconnection = function() {
	connection.onclose = function(e) { console.log(e); };
	connection.onmessage = function(e) {
		var message = JSON.parse(e.data);
		switch (message.type) {
		case 'error':
			console.log("GISrec ws error: "+message.text);
			break;
		case 'realtime':
			var id = message.geojson.properties.id;
			if (marker.id === undefined) {
				marker.id = L.geoJson(message.geojson).addTo(map);
			} else {
				marker.id.addData(message.geojson);
			}
			break;
		}
	};
};

document.getElementById('unreg').onclick = function() {
	connection.send(JSON.stringify({
		tag:		tag++,
		type:		(this.checked) ? 'join' : 'leave',
		channel:	null
	}));
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

		li.appendChild(deviceListCheckbox(id, 'location-arrow'));
		li.appendChild(deviceListCheckbox(id, 'history'));
		li.appendChild(document.createTextNode(id));

		ul.appendChild(li);
	}
}

function deviceListCheckbox(id, type) {
	var form = document.createElement('form');

	var input = document.createElement('input');
	input.setAttribute('id', id+' '+type);
	input.setAttribute('type', 'checkbox');
	input.setAttribute('name', id+' '+type);
	form.appendChild(input);

	var label = document.createElement('label');
	label.setAttribute('for', id+' '+type);
	form.appendChild(label);

	var box = document.createElement('i');
	box.setAttribute('class', 'fa fa-'+type);
	label.appendChild(box);

	return form;
}
