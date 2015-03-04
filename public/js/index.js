var debug = $('#debug').hasClass('active');
$('#debug').click(function ( event ){
	$(this).button('toggle');

	debug = $(this).hasClass('active');
});

var xhr = {};

$('#devicelist-refresh').click(function ( event ){
	function cleanup () {
		$('#devicelist-refresh i').toggleClass('fa-spin');
		delete xhr['devicelist-refresh'];
	}

	if (xhr['devicelist-refresh'] !== undefined) {
		xhr['devicelist-refresh'].abort();
		cleanup();
		return;
	}

	$('#devicelist-refresh i').toggleClass('fa-spin');

	xhr['devicelist-refresh'] = $.ajax({
		dataType: 'jsonp',
		jsonp: 'callback',
		url: '/data?callback=?',                    
		success: function(data) {
			cleanup();
		},
		error: function(data) {
			cleanup();
		}
	});
});

var map = L.map('map').fitWorld().zoomIn();
L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
	attribution: "Map data &copy; <a href='http://osm.org/copyright'>OpenStreetMap</a> contributors"
}).addTo(map);
var sidebar = L.control.sidebar('sidebar').addTo(map);

function gisrec() {
	var tag = 0;
	var channel = { };

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

	$('#devicelist').click();
}
