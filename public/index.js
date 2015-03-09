var debug = $('#debug').hasClass('active');
$('#debug').click(function(event) {
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
	options: {
		position: 'bottomright',
	},

	onAdd: function (map) {
		return $('<div class="gisrec"><a class="button" title="settings" href="#" data-toggle="modal" data-target="#settings"><i class="fa fa-lg fa-cog"></i></a><a href="#" class="button" title="devices" data-toggle="modal" data-target="#devices"><i class="fa fa-lg fa-location-arrow"></i></a></div>').get(0);
	},
});
map.addControl(new gisControl());

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
			var o = properties.data[id];

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

var now = new Date();
var timeline = new vis.Timeline($('#timeline').get(0), data, {
	orientation: 'top',
	type: 'point',
	start: new Date(now.getTime() - 10*60000),
	end: new Date(now.getTime() + 5*60000),
	editable: {
		updateGroup: true,
		remove: true,
	},
});

var xhr = {};
$('#devices #refresh').click(function(event) {
	function cleanup() {
		$('#devices #refresh i').toggleClass('fa-spin');
		delete xhr['devices-refresh'];
	}

	if (xhr['devicelist-refresh'] !== undefined) {
		xhr['devices-refresh'].abort();
		cleanup();
		return;
	}

	$('#devices #refresh i').toggleClass('fa-spin');

	xhr['devices-refresh'] = $.ajax({
		dataType: 'jsonp',
		jsonp: 'callback',
		url: '/devices?callback=?',
		success: function(data) {
			var p = {};
			$('#devicelist tr[id]').map(function() { p[this.id] = 1; });

			var q = {};
			$('#unregdlist tr[id]').map(function() { q[this.id] = 1; });

			data.devices.filter(function(i) { return p[i] === undefined && q[i] == undefined}).forEach(function(id) {
				$('#devicelist > tbody').append('<tr id="'+id+'" class="fa-lg"><th style="width: 100%;">'+id+'</th><td id="location"><a class="button inactive" href="#"><i class="fa fa-location-arrow"></i></a></td><td id="history"><a class="button inactive" href="#"><i class="fa fa-history"></i></a></td><td id="hide"><a class="button inactive" href="#"><i class="fa fa-eye"></i></a></td></td><td id="trash"><a class="button" href="#"><i class="fa fa-trash"></i></a></td></tr>');
				p[id] = 1;
			});

			Object.keys(p).filter(function(i) { return data.devices.indexOf(i) === -1 }).forEach(function(i) {
				$('#devicelist #'+i).remove();
				if (channel[i] !== undefined)
					data.remove(id);
			});

			if (!$('#unregistered').hasClass('active')) {
				cleanup();
				return;
			}

			xhr['devices-refresh'] = $.ajax({
				dataType: 'jsonp',
				jsonp: 'callback',
				url: '/channels?callback=?',
				success: function(data) {
					data.channels.filter(function(i) { return p[i] === undefined && q[i] == undefined}).forEach(function(id) {
						$('#unregdlist > tbody').append('<tr id="'+id+'" class="fa-lg"><th style="width: 100%;">'+id+'</th><td id="location"><a class="button inactive" href="#"><i class="fa fa-location-arrow"></i></a></td><td id="history"><a class="button inactive" href="#"><i class="fa fa-history"></i></a></td><td id="hide"><a class="button inactive" href="#"><i class="fa fa-eye"></i></a></td></td><td id="trash"><a class="button" href="#"><i class="fa fa-trash"></i></a></td></tr>');
						q[id] = 1;
					});

					Object.keys(q).filter(function(i) { return data.channels.indexOf(i) === -1 }).forEach(function(i) {
						$('#unregdlist #'+i).remove();
						if (channel[i] !== undefined)
							data.remove(id);
					});

					cleanup();
				},
				error: function(data) {
					cleanup();
				}
			});
		},
		error: function(data) {
			cleanup();
		}
	});
});
$('#devices #refresh').click();


$('#devicelist').click(function(event){
	var i = $(event.target).closest('tr').attr('id');

	switch ($(event.target).closest('td').attr('id')) {
	case 'view':
		//$('#devicelist > tbody').append('<tr id="'+id+'"><th>'+id+'</th><td id="location"><i class="fa fa-location-arrow inactive"></i></td><td id="history"><i class="fa fa-history inactive"></i></td><td id="delete"><i class="fa fa-trash"></i></td></tr>');
		break;
	}
});

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
				type: 'box',
				content: message.channel,
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
			$('#unregdtable').show();
			type = 'join'
			channel[''] = true;
		} else {
			$('#unregdtable').hide();
			type = 'prune'
			delete channel[''];
		}

		send({
			type: type,
			channel: [ null ],
		});
	});
};
