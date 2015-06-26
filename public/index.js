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

var binglayers = []
new Array([ 'Aerial', 'Aerial' ], [ 'AerialWithLabels', 'Aerial With Labels' ], [ 'Road', 'Road' ]).forEach(function(i) {
	binglayers.push(new ol.layer.Tile({
		title: i[1],
		type: 'base',
		visible: false,
		preload: Infinity,
		source: new ol.source.BingMaps({
			key: 'AiacPueEKeXax2ZLDSae4M4B4sQyr9HtgHFGvvaXAVj0Sfe000usBSik9_fzKFX_',
			culture: window.navigator.languages[0] || window.navigator.userLanguage || window.navigator.language,
			imagerySet: i[0],
			maxZoom: 19
		})
	}))
})

var map = new ol.Map({
	target: 'map',
	layers: [
		new ol.layer.Tile({
			title: 'OpenStreetMap',
			type: 'base',
			visible: true,
			preload: Infinity,
			source: new ol.source.OSM({
				crossOrigin: null
			})
		}),
		new ol.layer.Group({
			title: 'Bing Maps',
			layers: binglayers
		})
	],
	controls: ol.control.defaults({
		attributionOptions: ({
				collapsible: false
		})
		}).extend([
			new ol.control.FullScreen(),
			new ol.control.ScaleLine(),
			new ol.control.LayerSwitcher({ tipLabel: 'Legend' }),
			new gisControl.channels(),
			new gisControl.settings()
		]
	),
	interactions: ol.interaction.defaults().extend([
		new ol.interaction.DragRotateAndZoom()
	]),
	view: new ol.View({
		projection: 'EPSG:900913',
		center: ol.proj.transform([0, 0], 'EPSG:4326', 'EPSG:900913'),
		zoom: 3
	})
})

var styles = {
	'Point': [new ol.style.Style({
		text: new ol.style.Text({
			text: '\uf041',
			font: '2em FontAwesome',
			textBaseline: 'Bottom',
			fill: new ol.style.Fill({
				color: 'blue',
			})
		})
	})]
}
var styleFunction = function(feature, resolution) {
	return styles[feature.getGeometry().getType()]
}

var data = new vis.DataSet()
var	groups = [],
	layers = { }
data.on('*', function(event, properties, sender) {
	if (sender === 'self')
		return

	properties.items.forEach(function(i) {
		switch (event) {
		case 'add':
			var d = data.get(i)

			if (!groups.filter(function(g) { return g.id === d.group }).length) {
				groups.push({
					id: d.group,
					content: d.group
				})
			}
			d.vector = new ol.source.Vector({
				features: (new ol.format.GeoJSON()).readFeatures(d.geojson, {
					dataProjection: 'EPSG:4326',
					featureProjection: 'EPSG:900913'
				})
			})
			d.layer = new ol.layer.Vector({
				source: d.vector,
				style: styleFunction
			})
			data.update(d, 'self')
			layers[i] = d.layer
			map.addLayer(d.layer)
			break
		case 'update':
			var d = data.get(i)
			var o = properties.data[i]

			d.vector.forEachFeature(function(f) {
				f.getGeometry().setCoordinates(
					ol.proj.transform(d.geojson.geometry.coordinates, 'EPSG:4326', 'EPSG:900913')
				)
			})
			break
		case 'remove':
			if (data.get({ filter: function(j) { return j.id === i }}).length)
				groups = groups.filter(function(g) { return j.id !== i })
			map.removeLayer(layers[i])
			delete layers[i]
			break
		}
	})
})

var timeline = new vis.Timeline($('#timeline').get(0), data, {
	orientation: 'top',
	type: 'point',
	start: new Date(new Date().getTime() - 10*60000),
	end: new Date(new Date().getTime() + 5*60000),
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
var timelineRangeChanged;
timeline.on('rangechanged', function(props) {
	if (timelineRangeChanged !== undefined)
		clearTimeout(timelineRangeChanged)

	if (props.byUser) {
		timelineRangeChanged = setTimeout(function(){
			timelineRangeChanged = undefined
			history()
		}, 500)
	} else {
		history()
	}
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
		url: '/channel',
		success: function(jp) {
			cleanup()

			var p = {}
			$('#channellist tr[id]').map(function() { p[this.id] = 1 })

			Object.keys(jp.channels).filter(function(i) { return p[i] === undefined }).forEach(function(id) {
				var type = (jp.channels[id].registered) ? 'history' : 'plus';
				$('#channellist > tbody').append('<tr id="'+id+'" class="fa-lg"><th>'+id+'</th><td class="gisrec inactive" id="location-arrow"><a href="#"><i class="fa fa-location-arrow"></i></a></td><td class="gisrec inactive" id="'+type+'"><a href="#"><i class="fa fa-'+type+'"></i></a></td><td class="gisrec inactive" id="trash"><a href="#"><i class="fa fa-trash"></i></a></td></tr>')
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
	var timelineRange = timeline.getWindow()

	$('#channellist tr[id]:has(#history:not(.inactive))').map(function() {
		var id = this.id

		data.remove(data.get({
			filter: function(i) {
				return i.group === id && (i.start.getTime() < timelineRange.start.getTime() || i.start.getTime() > timelineRange.end.getTime())
			}})
		)

		if (xhr['channel '+id] !== undefined)
			xhr['channel '+id].abort()

		xhr['channel '+id] = $.ajax({
			dataType: 'jsonp',
			url: '/channel/'+id,
			data: { start: timelineRange.start.getTime(), end: timelineRange.end.getTime() },
			success: function(jp) {
				delete xhr['channel '+id]
				jp.files.forEach(function(f){
					if (xhr['channel '+id+' '+f] !== undefined)
						return

					xhr['channel '+id+' '+f] = $.ajax({
						dataType: 'json',
						url: '/channel/'+id+'/'+f+'.json',
						success: function(j){
							delete xhr['channel '+id+' '+f]

							var results = []

							switch (j.type) {
							case 'Feature':
								if (j.properties.time * 1000 < timelineRange.start.getTime() || j.properties.time * 1000 > timelineRange.end.getTime())
									return
								results.push({
									id: id+':'+j.properties.time,
									start: new Date(j.properties.time * 1000),
									group: id,
									geojson: j
								})
								break
							case 'FeatureCollection':
								j.features.forEach(function(i){
									if (i.properties.time * 1000 < timelineRange.start.getTime() || i.properties.time * 1000 > timelineRange.end.getTime())
										return
									results.push({
										id: id+':'+i.properties.time,
										start: new Date(i.properties.time * 1000),
										group: id,
										geojson: i
									})
								})
								break
							default:
								console.log('unknown GeoJSON format for '+id+':'+f+': '+j.type)
								return
							}

							data.update(results)
						},
						error: function(j){
							delete xhr['channel '+id+' '+f]
						}
					})
				})
			},
			error: function(jp) {
				delete xhr['channel '+id]
			}
		})
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
				id: message.channel+':realtime',
				type: 'box',
				content: message.channel,
				start: new Date(message.geojson.properties.time * 1000),
				subgroup: message.channel,
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
				subs = subs.filter(function(s) { return s !== '^'+i+'$' })
				data.remove(data.get({
					filter: function(j) {
						return j.group === undefined && j.subgroup === i
					}})
				)
			} else {
				subs.push('^'+i+'$')
				send({ type: 'realtime', channel: i })
			}
			send({ type: 'subscribe', rules: subs })
			break
		case 'history':
			a.toggleClass('inactive')
			if (a.hasClass('inactive')) {
				data.remove(data.get({
					filter: function(j) {
						return j.group === i
					}})
				)
			} else {
				history()
			}
			break
		case 'plus':
			if (xhr['put channel '+i] !== undefined)
				xhr['put channel '+i].abort()

			xhr['put channel '+i] = $.ajax({
				dataType: 'jsonp',
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
