var debug = $('#debug').hasClass('active');
$('#debug').click(function ( event ){
	$(this).button('toggle');
	debug = $(this).hasClass('active');
});

var map = L.map('map', {
	zoomControl: false,
}).fitWorld().zoomIn();
L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
	attribution: "Map data &copy; <a href='http://osm.org/copyright'>OpenStreetMap</a> contributors",
}).addTo(map);
L.control.scale().addTo(map);

var gisControl = L.Control.extend({
	initialize: function (options) {
		L.Util.setOptions(this, options);
	},

	onAdd: function (map) {
		return $('<div class="gisrec"><a class="button" title="settings" href="#" data-toggle="modal" data-target="#settings"><i class="fa fa-lg fa-cog"></i></a><a href="#" class="button" title="channels" data-toggle="modal" data-target="#channels"><i class="fa fa-lg fa-location-arrow"></i></a></div>').get(0);
	},
});
map.addControl(new gisControl({ position: 'bottomright' }));

var data = new vis.DataSet();
var layers = {};
data.on('*', function(event, properties, sender) {
	properties.items.forEach(function(id) {
		switch (event) {
		case 'add':
			var d = data.get(id);

			switch (sender) {
			case 'realtime':
				layers[id] = L.geoJson(d['geojson']).addTo(map);
				break;
			}
			break;
		case 'update':
			var d = data.get(id);
			var o = properties.data[i];

			switch (sender) {
			case 'realtime':
				layers[id].clearLayers();
				layers[id].addData(d['geojson']);
				break;
			}
			break;
		case 'remove':
			switch (sender) {
			default:
				map.removeLayer(layers[id]);
				delete layers[id];
			}
			break;
		}
	});
});

var timeline = new vis.Timeline($('#timeline').get(0), data);

var tag = 0;
var channel = { };
var connection = new WebSocket('ws://' + location.host);
connection.onopen = function(){
	function log(m, force){
		if (force || debug)
			console.log('GISrec:ws: '+m);
	}

	function send(m){
		m['tag'] = tag++;
		connection.send(JSON.stringify(m));
		return m['tag'];
	}

	log('connected');

	connection.onclose = function(e){
		log('disconnected: '+e);
	};
	connection.onmessage = function(e){
		log("message: "+e.data);

		var message = JSON.parse(e.data);

		switch (message.type){
		case 'error':
			log("error: "+e.data, true);
			break;
		case 'realtime':
			if (channel[message.channel] === undefined) {
				if (channel[''] === undefined) {
					log("realtime on non-joined channel '"+message.channel+"', leaving");
					send({ type: 'error', text: "unsolicited realtime message for channel '"+message.channel+"', leaving" });
					send({ type: 'prune', channel: [ message.channel ] });
					break;
				}
			}

			data.update({
				id: message.channel,
				text: message.channel,
				start: new Date(message.geojson.properties.time * 1000),
				geojson: message.geojson
			}, 'realtime');
			break;
		default:
			log('unknown message type: '+message.type, true);
		}
	};

	$('#unregistered').click(function ( event ){
		$(this).button('toggle');

		var type;
		if ($(this).hasClass('active')) {
			type = 'join'
			channel[''] = true;
		} else {
			type = 'prune'
			delete channel[''];
		}

		send({
			type: type,
			channel: [ null ],
		});
	})
};
