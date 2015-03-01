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
