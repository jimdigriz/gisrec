var debug = $('#debug').hasClass('active')
$('#debug').click(function(event) {
	$(this).button('toggle')
	debug = $(this).hasClass('active')
})

window.gisControl = {}
var gisControl = window.gisControl

gisControl.channels = function(opt_options) {
	var options = opt_options || {}

	var handle_click = function(e) {
		$('#channels').modal('show')
	}

	var button = $('<button title="Open Channels" type="button" class="fa fa-lg fa-location-arrow"/>').get(0)
	button.addEventListener('click', handle_click, false)
	button.addEventListener('touchstart', handle_click, false)

	var element = document.createElement('div')
	element.className = 'ol-gisrec-channels ol-unselectable ol-control'
	element.appendChild(button)

	ol.control.Control.call(this, {
		element: element,
		target: options.target
	})
}
ol.inherits(gisControl.channels, ol.control.Control)

gisControl.settings = function(opt_options) {
	var options = opt_options || {}

	var handle_click = function(e) {
		$('#settings').modal('show')
	}

	var button = $('<button title="Open Settings" type="button" class="fa fa-lg fa-cog"/>').get(0)
	button.addEventListener('click', handle_click, false)
	button.addEventListener('touchstart', handle_click, false)

	var element = document.createElement('div')
	element.className = 'ol-gisrec-settings ol-unselectable ol-control'
	element.appendChild(button)

	ol.control.Control.call(this, {
		element: element,
		target: options.target
	})
}
ol.inherits(gisControl.settings, ol.control.Control)

var map = new ol.Map({
	target: 'map',
	layers: [
		new ol.layer.Tile({
			source: new ol.source.OSM({})
		})
	],
	controls: ol.control.defaults({
		attributionOptions: ({
				collapsible: false
		})
		}).extend([
			new ol.control.FullScreen(),
			new gisControl.channels(),
			new gisControl.settings()
		]
	),
	interactions: ol.interaction.defaults().extend([
		new ol.interaction.DragRotateAndZoom()
	]),
	view: new ol.View({
		center: [0, 0],
		zoom: 3
	})
})

var data = new vis.DataSet()
var groups = []
data.on('*', function(event, properties, sender) {
	properties.items.forEach(function(i) {
		switch (event) {
		case 'add':
			var d = data.get(i)
			console.log(i);
			if (!groups.filter(function(g) { return g.id === d.group }).length) {
				groups.push({
					id: d.group,
					content: d.group
				})
			}
			break
		case 'update':
			var d = data.get(i)
			var o = properties.data[i]
 
			//layers[i].clearLayers()
			//layers[i].addData(d['geojson'])
			break
		case 'remove':
			if (!data.get({ filter: function(i) { return g.id === i }}).length)
				groups = groups.filter(function (g) { return g.id !== i })

			//map.removeLayer(layers[i])
			//delete layers[i]
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
	group: groups,
	editable: {
		updateGroup: true,
		remove: true,
	},
	stack: false,
})
timeline.on('doubleClick', function(props) {
	$('#groups').modal('show')
})
timeline.on('rangechanged', function(props) {
	timelineStart = props.start
	timelineEnd = props.end
	history()
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
		url: '/channel',
		success: function(jp) {
			cleanup()

			var p = {}
			$('#channellist tr[id]').map(function() { p[this.id] = 1 })

			Object.keys(jp.channels).filter(function(i) { return p[i] === undefined }).forEach(function(id) {
				var type = (jp.channels[id].registered) ? 'history' : 'plus'

				$('#channellist > tbody').append('<tr id="'+id+'" class="fa-lg"><th style="width: 100%;">'+id+'</th><td class="gisrec inactive" id="location-arrow"><a href="#"><i class="fa fa-location-arrow"></i></a></td><td class="gisrec inactive" id="'+type+'"><a href="#"><i class="fa fa-'+type+'"></i></a></td><td class="gisrec inactive" id="trash"><a href="#"><i class="fa fa-trash"></i></a></td></tr>')
				p[id] = 1
			})

			Object.keys(p).filter(function(id) { return jp.channels[id] === undefined }).forEach(function(id) {
				$('#devicelist #'+id).remove()
				data.id.clear()
			})
		},
		error: function(jp) {
			cleanup()
		}
	})
})
$('#channels #refresh').click()

function history() {
	$('#channellist tr[id]:has(#history:not(.inactive))').map(function() {
		var id = this.id
	})
}

var 	tag = 0,
	connection = new WebSocket('ws://' + location.host),
	subs = []
connection.onopen = function(){
	function log(m){
		if (debug)
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
		log('message: '+e.data)

		var message = JSON.parse(e.data)

		switch (message.type){
		case 'error':
			log('error: '+e.data)
			break
		case 'realtime':
			var match = false
			subs.forEach(function(sub) {
				var re = new RegExp(sub)
				if (re.test(message.channel))
					match = true
			})
			if (!match) {
				log("realtime on non-joined channel '"+message.channel+"', leaving")
				send({ type: 'error', text: "unsolicited realtime message for channel '"+message.channel+"', leaving" })
				send({ type: 'subscribe', rules: subs })
				break
			}
			data.update({
				type: 'box',
				content: 'realtime',
				start: new Date(message.geojson.properties.time * 1000),
				group: message.channel,
				geojson: message.geojson
			})
			break
		default:
			log('unknown message type: '+message.type)
		}
	}

	$('#channellist').click(function(event){
		var i = $(event.target).closest('tr').attr('id')
		var a = $(event.target).closest('td')

		switch (a.attr('id')) {
		case 'location-arrow':
			a.toggleClass('inactive')
			if (a.hasClass('inactive')) {
				data.remove(data.get({
					filter: function (j) {
						return j.group === i && j.content === 'realtime'
					}})
				)
			} else {
				subs.push('^'+i+'$')
				send({ type: 'subscribe', rules: subs })
				send({ type: 'realtime', channel: i })
			}
			break
		case 'history':
			a.toggleClass('inactive')
			if (a.hasClass('inactive'))
				data.i.clear()		// FIXME should remove all but realtime
			updateHistory()
			break
		case 'plus':
			if (xhr['put channel '+i] !== undefined)
				xhr['put channel '+i].abort()

			xhr['put channel '+i] = $.ajax({
				dataType: 'jsonp',
				jsonp: 'callback',
				type: 'PUT',
				url: '/channel/'+i,
				success: function(jp) {
					delete xhr['put channel '+i]
					$('#channellist #'+i).remove()
					$('#channels #refresh').click()
				},
				error: function(jp) {
					delete xhr['put channel '+i]
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
				url: '/channel/'+i,
				success: function(jp) {
					delete xhr['delete channel '+i]
					$('#channellist #'+i).remove()
					data.i.clear()
				},
				error: function(jp) {
					delete xhr['delete channel '+i]
				}
			})
			break
		}
	})
}
