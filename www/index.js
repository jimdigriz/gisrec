var map = L.map("map").setView([51.505, -0.09], 13);

L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
	attribution: 'Map data &copy; <a href="http://osm.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

/*
var realtime = L.realtime({
	url: "https://wanderdrone.appspot.com/",
	crossOrigin: true,
	type: "json"
}, {
	interval: 3 * 1000
}).addTo(map);

realtime.on("update", function() {
    map.fitBounds(realtime.getBounds(), {maxZoom: 3});
});
*/

var connection = new WebSocket("ws://127.0.0.1:27270");
connection.onopen = function () {connection.send("The time is " + new Date().getTime());};
connection.onmessage = function (e) {document.getElementById("capture").innerHTML = e.data;};
connection.onclose = function(event) {console.log(event);};
