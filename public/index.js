var debug = $('#debug').hasClass('active');
$('#debug').click(function ( event ){
	$(this).button('toggle');

	debug = $(this).hasClass('active');
});

var xhr = {};

var map = L.map('map').fitWorld().zoomIn();
L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
	attribution: "Map data &copy; <a href='http://osm.org/copyright'>OpenStreetMap</a> contributors"
}).addTo(map);
var sidebar = L.control.sidebar('sidebar').addTo(map);

function gisrec(){
	var tag = 0;
	var channel = { };

	var connection = new WebSocket('ws://' + location.host);
	connection.onopen = function(){
		function log(m){
			if (debug)
				console.log('GISrec:ws: '+m);
		}

		log('connected');

		connection.onclose = function(e){ log('disconnected: '+e); };
		connection.onmessage = function(e){
			log("message: "+e.data);

			var message = JSON.parse(e.data);

			switch (message.type){
			case 'error':
				break;
			case 'realtime':
				if (message.channel === null) {
					message.channel = message.geojson.properties.id;
					channel[message.channel] = '';

					$('#devicelist-unreg > tbody').append('<tr id="'+message.channel+'"><th>'+message.channel+'</th><td id="add"><i class="fa fa-plus"></i></td><td id="delete"><i class="fa fa-trash"></i></td></tr>');
				}

				if (channel[message.channel] === undefined) {
					connection.send(JSON.stringify({tag: tag++, type: 'error', text: "unsolicited realtime message for channel '"+message.channel+"', leaving"}));
					connection.send(JSON.stringify({tag: tag++, type: 'leave', channel: message.channel}));
					break;
				}

				if (typeof channel[message.channel] === 'object') {
					channel[message.channel].clearLayers();
					channel[message.channel].addData(message.geojson);
				} else
					channel[message.channel] = L.geoJson(message.geojson).addTo(map)
				break;
			}
		};
	
		$('#devicelist-refresh').click(function ( event ){
			function cleanup (){
				$('#devicelist-refresh i').toggleClass('fa-spin');
				delete xhr['devicelist-refresh'];
			}

			if (xhr['devicelist-refresh'] !== undefined){
				xhr['devicelist-refresh'].abort();
				cleanup();
				return;
			}

			$('> i').toggleClass('fa-spin');

			xhr['devicelist-refresh'] = $.ajax({
				dataType: 'jsonp',
				jsonp: 'callback',
				url: '/data?callback=?',                    
				success: function(data){
					var p = {};
					$('#devicelist tr[id]').map(function() { p[this.id] = 1; });

					data.devices.filter(function(i) { return p[i] === undefined }).forEach(function ( id ){
						$('#devicelist > tbody').append('<tr id="'+id+'"><th>'+id+'</th><td id="location"><i class="fa fa-location-arrow gisrec-inactive"></i></td><td id="history"><i class="fa fa-history gisrec-inactive"></i></td><td id="delete"><i class="fa fa-trash"></i></td></tr>');
						p[id] = 1;
					});

					Object.keys(p).filter(function(i) { return data.devices.indexOf(i) === -1 }).forEach(function ( i ){
						$('#devicelist #'+i).remove();
						if (channel[i] !== undefined) {
							map.removeLayer(channel[i]);
							delete channel[i];
							connection.send(JSON.stringify({tag: tag++, type: 'leave', channel: i}));
						}
					});
					cleanup();
				},
				error: function(data){
					cleanup();
				}
			});
		});

		$('#devicelist-plus').click(function ( event ){
			$('#devicelist-plus').toggleClass('gisrec-inactive');
			$('#devicelist-unreg-section').toggle();

			if ($('#devicelist-plus').hasClass('gisrec-inactive')) {
				connection.send(JSON.stringify({tag: tag++, type: 'leave', channel: null}));
				$('#devicelist-unreg tr[id]').map(function() {
					map.removeLayer(channel[this.id]);
					delete channel[this.id];
					$(this).remove();
				});
			} else {
				connection.send(JSON.stringify({tag: tag++, type: 'join', channel: null}));
			}
		});

		$('#devicelist').click(function ( event ){
			var i = $(event.target).closest('tr').attr('id');
			var a = $(event.target).closest('td').attr('id');

			switch (a) {
			case "location":
				var e = $('#devicelist #'+i+' #'+a+' i')
				e.toggleClass('gisrec-inactive');

				if (channel[i] !== undefined) {
					map.removeLayer(channel[i]);
					delete channel[i];
				}

				if (e.hasClass('gisrec-inactive')) {
					connection.send(JSON.stringify({tag: tag++, type: 'leave', channel: i}));
				} else {
					connection.send(JSON.stringify({tag: tag++, type: 'join', channel: i}));
					channel[i] = '';
				}
				break;
			case "history":
				$('#devicelist #'+i+' #'+a+' i').toggleClass('gisrec-inactive');
				break;
			case "delete":
				$('#devicelist #'+i).remove();
				if (channel[i] !== undefined) {
					map.removeLayer(channel[i]);
					delete channel[i];
					connection.send(JSON.stringify({tag: tag++, type: 'leave', channel: i}));
				}
				connection.send(JSON.stringify({tag: tag++, type: 'unregister', channel: i}));
				break;

			}
		});

		$('#devicelist-refresh').click();
	};
}
