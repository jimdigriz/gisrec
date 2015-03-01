var map = L.map("map").fitWorld().zoomIn();

L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
	attribution: 'Map data &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

var marker = { };

var connection = new WebSocket("ws://" + location.host);
connection.onopen = function () { console.log(open); };
connection.onmessage = function(e) {
	var message = JSON.parse(e.data);

	switch (message.type) {
	case "realtime":
		if (marker[message.id]) {
			marker[message.id].addData(message.geojson);
		} else {
			marker[message.id] = L.geoJson(message.geojson).addTo(map);
		}
		break;
	}
};
connection.onclose = function(e) { console.log(e); };
