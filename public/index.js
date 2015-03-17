var debug = $('#debug').hasClass('active')
$('#debug').click(function(event) {
	$(this).button('toggle')
	debug = $(this).hasClass('active')
})

var map = L.map('map', {
	zoomControl: false,
}).fitWorld().zoomIn()
L.tileLayer('http://{s}.tile.osm.org/{z}/{x}/{y}.png', {
	attribution: "Map data &copy; <a href='http://osm.org/copyright'>OpenStreetMap</a> contributors",
}).addTo(map)
L.control.scale().addTo(map)

var gisControl = L.Control.extend({
	options: {
		position: 'bottomright',
	},

	onAdd: function (map) {
		return $('<div class="leaflet-bar leaflet-control"><a title="settings" href="#" data-toggle="modal" data-target="#settings"><i class="fa fa-lg fa-cog"></i></a><a href="#" title="channels" data-toggle="modal" data-target="#channels"><i class="fa fa-lg fa-location-arrow"></i></a></div>').get(0)
	},
})
map.addControl(new gisControl())

var data = new vis.DataSet()
var layers = {}
data.on('*', function(event, properties, sender) {
	properties.items.forEach(function(id) {
		switch (event) {
		case 'add':
			var d = data.get(id)

			layers[id] = L.geoJson(d['geojson']).addTo(map)
			channel[id] = true
			break
		case 'update':
			var d = data.get(id)
			var o = properties.data[id]

			layers[id].clearLayers()
			layers[id].addData(d['geojson'])
			break
		case 'remove':
			map.removeLayer(layers[id])
			delete layers[id]
			delete channel[id]
			break
		}
	})
})

var now = new Date()
var timelineStart = new Date(now.getTime() - 10*60000)
	, timelineEnd = new Date(now.getTime() + 5*60000)
var timeline = new vis.Timeline($('#timeline').get(0), data, {
	orientation: 'top',
	type: 'point',
	start: timelineStart,
	end: timelineEnd,
	editable: {
		updateGroup: true,
		remove: true,
	},
})

timeline.on('rangechanged', function(props) {
	timelineStart = props.start
	timelineEnd = props.end
	updateHistory();
})

var xhr = {}
$('#channels #refresh').click(function(event) {
	function cleanup() {
		$('#channellist #refresh i').toggleClass('fa-spin')
		delete xhr['refresh']
	}

	if (xhr['refresh'] !== undefined) {
		xhr['refresh'].abort()
		cleanup()
		return
	}

	$('#channellist #refresh i').toggleClass('fa-spin')

	xhr['refresh'] = $.ajax({
		dataType: 'jsonp',
		jsonp: 'callback',
		url: '/channel?callback=?',
		success: function(data) {
			cleanup()

			var p = {}
			$('#channellist tr[id]').map(function() { p[this.id] = 1 })

			Object.keys(data.channels).filter(function(i) { return p[i] === undefined }).forEach(function(id) {
				if (!data.channels[id].registered && !$('#channels #unregistered').hasClass('active'))
					return

				var type = (data.channels[id].registered) ? 'history' : 'plus'

				$('#channellist > tbody').append('<tr id="'+id+'" class="fa-lg"><th style="width: 100%;">'+id+'</th><td class="gisrec inactive" id="location-arrow"><a href="#"><i class="fa fa-location-arrow"></i></a></td><td class="gisrec inactive" id="'+type+'"><a href="#"><i class="fa fa-'+type+'"></i></a></td><td class="gisrec inactive" id="trash"><a href="#"><i class="fa fa-trash"></i></a></td></tr>')
				p[id] = 1
			})

			Object.keys(p).filter(function(id) { return data.channels[id] === undefined }).forEach(function(id) {
				$('#devicelist #'+id).remove()
				data.remove(id)
			})
		},
		error: function(error) {
			cleanup()
		}
	})
})
$('#channels #refresh').click()

function addRealtime(channel, geojson) {
	var o = data.get(channel)

	if (o !== null && o.geojson.properties.time > geojson.properties.time)
		return

	data.update({
		id: channel,
		type: 'box',
		content: channel,
		start: new Date(geojson.properties.time * 1000),
		geojson: geojson
	})
}

function updateHistory() {
	$('#channellist tr[id]:has(#history:not(.inactive))').map(function() {
		var id = this.id

		xhr['get history '+id] = $.ajax({
			dataType: 'jsonp',
			jsonp: 'callback',
			url: '/channel/'+id+'?callback=?&start=' + timelineStart.getTime() + '&end=' + timelineEnd.getTime(),
			success: function(geojson) {
				delete xhr['get channel '+id]
			},
			error: function(error) {
				delete xhr['get channel '+id]
			}
		})
	})
}

var tag = 0
var channel = { }
var connection = new WebSocket('ws://' + location.host)
connection.onopen = function(){
	function log(m, force){
		if (force || debug)
			console.log('GISrec:ws: '+m)
	}

	function send(m){
		m['tag'] = tag++
		connection.send(JSON.stringify(m))
		return m['tag']
	}

	log('connected')

	connection.onclose = function(e){
		log('disconnected: '+e)
	}
	connection.onmessage = function(e){
		log("message: "+e.data)

		var message = JSON.parse(e.data)

		switch (message.type){
		case 'error':
			log("error: "+e.data, true)
			break
		case 'realtime':
			if (channel[message.channel] === undefined) {	
				log("realtime on non-joined channel '"+message.channel+"', leaving")
				send({ type: 'error', text: "unsolicited realtime message for channel '"+message.channel+"', leaving" })
				send({ type: 'prune', channel: [ message.channel ] })
				break
			}

			addRealtime(message.channel, message.geojson)
			break
		case 'channel':
			if (!$('#channels #unregistered').hasClass('active')) {
				log("channel when not-requested, leaving")
				send({ type: 'error', text: "unsolicited channel message, leaving" })
				send({ type: 'prune', channel: [ null ] })

				break
			}

			if (!$('#channellist').find('#'+message.channel).length)
				$('#channellist > tbody').append('<tr id="'+message.channel+'" class="fa-lg"><th style="width: 100%;">'+message.channel+'</th><td class="gisrec inactive" id="location-arrow"><a href="#"><i class="fa fa-location-arrow"></i></a></td><td class="gisrec inactive" id="plus"><a href="#"><i class="fa fa-plus"></i></a></td><td class="gisrec inactive" id="trash"><a href="#"><i class="fa fa-trash"></i></a></td></tr>')
			break
		default:
			log('unknown message type: '+message.type, true)
		}
	}

	$('#channellist').click(function(event){
		var i = $(event.target).closest('tr').attr('id')
		var a = $(event.target).closest('td')

		switch (a.attr('id')) {
		case 'location-arrow':
			a.toggleClass('inactive')

			var type
			if (a.hasClass('inactive')) {
				type = 'prune'

				if (xhr['get channel '+i] !== undefined)
					xhr['get channel '+i].abort()
				data.remove(i)
			} else {
				type = 'join'

				xhr['get channel '+i] = $.ajax({
					dataType: 'jsonp',
					jsonp: 'callback',
					url: '/channel/'+i+'?callback=?',
					success: function(geojson) {
						delete xhr['get channel '+i]
						addRealtime(i, geojson)
					},
					error: function(error) {
						delete xhr['get channel '+i]
					}
				})
			}

			send({
				type: type,
				channel: [ i ],
			})
			break
		case 'history':
			a.toggleClass('inactive')
			updateHistory()
			break
		case 'plus':
			if (xhr['put channel '+i] !== undefined)
				xhr['put channel '+i].abort()

			xhr['put channel '+i] = $.ajax({
				dataType: 'jsonp',
				jsonp: 'callback',
				type: 'PUT',
				url: '/channel/'+i+'?callback=?',
				success: function(data) {
					delete xhr['put channel '+i]
					$('#channellist #'+i).remove()
					$('#channellist > tbody').append('<tr id="'+i+'" class="fa-lg"><th style="width: 100%;">'+i+'</th><td class="gisrec inactive" id="location-arrow"><a href="#"><i class="fa fa-location-arrow"></i></a></td><td class="gisrec inactive" id="history"><a href="#"><i class="fa fa-history"></i></a></td><td class="gisrec inactive" id="trash"><a href="#"><i class="fa fa-trash"></i></a></td></tr>')
				},
				error: function(error) {
					delete xhr['delete channel '+i]
				}
			})

			break
		case 'trash':
			if (xhr['delete channel '+i] !== undefined)
				xhr['delete channel '+i].abort()

			xhr['delete channel '+i] = $.ajax({
				dataType: 'jsonp',
				jsonp: 'callback',
				type: 'DELETE',
				url: '/channel/'+i+'?callback=?',
				success: function(data) {
					delete xhr['delete channel '+i]
					$('#channellist #'+i).remove()
					data.remove(i)
				},
				error: function(error) {
					delete xhr['delete channel '+i]
				}
			})
			break
		}
	})

	$('#channels #unregistered').click(function(event) {
		$(this).button('toggle')

		send({
			type: $(this).hasClass('active') ? 'join' : 'prune',
			channel: [ null ],
		})
	})
}
