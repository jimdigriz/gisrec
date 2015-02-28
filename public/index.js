var map = L.map("map").setView([51.505, -0.09], 13);

L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
	attribution: 'Map data &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

var marker = { };

var connection = new WebSocket("ws://" + location.host);
connection.onopen = function () { console.log(open); };
//connection.onmessage = function(e) { document.getElementById("capture").innerHTML = e.data; };
connection.onmessage = function(e) {
	var message = JSON.parse(e.data);
	switch (message.type) {
	case "realtime":
		var point = message.geojson.geometry.coordinates.shift();
		if (marker[message.id]) {
			marker[message.id].setLatLng([ point[1], point[0] ]);
		} else {
			marker[message.id] = L.marker([ point[1], point[0] ]).addTo(map);
		}
		break;
	}
};
connection.onclose = function(e) { console.log(event); };
