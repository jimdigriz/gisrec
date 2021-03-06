var debug = $('#debug').hasClass('active')
$('#debug').click(function(event) {
	$(this).button('toggle')
	debug = $(this).hasClass('active')
})

var	xhr = {}
	timeout = {}

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

var popupElement = document.getElementById('popup')
var popup = new ol.Overlay({
	element: popupElement,
	positioning: 'bottom-center',
	stopEvent: false
})
map.addOverlay(popup)

function popupText(prop) {
	return '<b>speed:</b>&nbsp;'+prop.gprmc['speed']+'&nbsp;m/s<br/>\
		<b>orien:</b>&nbsp;'+prop.gprmc['course-made-good']
}

map.on('click', function(e) {
	var features = getFeaturesAtPoint(e.pixel)
	if (features && features.length === 1) {
		var geometry = features[0].getGeometry()
		var coord = geometry.getCoordinates()
		map.getOverlays().item(0).setPosition(coord)
		$(popupElement).popover({
			'placement': 'top',
			'html': true,
			'content': popupText(features[0].getProperties())
		})
		$(popupElement).popover('show')
		timeline.setSelection(features[0].getProperties().id+':'+features[0].getProperties().time.toString())
	} else {
		$(popupElement).popover('destroy')
		timeline.setSelection()
	}
})
map.on('pointermove', function(e) {
	if (e.dragging) {
		$(popupElement).popover('destroy')
		timeline.setSelection()
		return
	}

	var pixel = map.getEventPixel(e.originalEvent)
	var features = getFeaturesAtPoint(pixel)
	map.getTargetElement().style.cursor = (features && features.length === 1) ? 'pointer' : '';
})

function getFeaturesAtPoint(pixel) {
	var features = []
	map.forEachFeatureAtPixel(pixel,
		function(feature, layer) {
			features = features.concat(
				// horrible hack as the cluster compounds
				feature.getProperties().features
			)
		}, undefined, function(l) {
			return (Object.keys(layers.history).map(function(i) {
					return layers.history[i].point
				}).filter(function(i) {
					return (i === l) ? 1 : undefined;
				}).length === 1)
		}
	)
	return features
}

var groups = []
var data = new vis.DataSet()
var layers = {
	realtime: new ol.layer.Vector({
		source: new ol.source.Vector(),
		style: new ol.style.Style({
			image: new ol.style.Circle({
				radius: 10,
				stroke: new ol.style.Stroke({
					color: 'lime'
				}),
				fill: new ol.style.Fill({
					color: [ 255, 255, 255, 1.0 ]
				})
			})
		})
	}),
	history: { }
}
map.getLayers().push(layers['realtime'])

var cacheClusterPointStyle = {}
var clusterPointStyle = function(feature, resolution) {
	var size = feature.get('features').length
	var style = cacheClusterPointStyle[size]
	if (!style) {
		var props = {
			image: new ol.style.Circle({
				radius: 10,
				stroke: new ol.style.Stroke({
					color: 'lightskyblue'
				}),
				fill: new ol.style.Fill({
					color: [ 255, 255, 255, 0.6 ]
				})
			})
		}
		if (size > 1) {
			props['text'] = new ol.style.Text({
				text: size.toString(),
				fill: new ol.style.Fill({
					color: 'lightskyblue'
				})
			})
		}
		style = [ new ol.style.Style(props) ]
		cacheClusterPointStyle[size] = style
	}
	return style
}

var lineStringStyle = function(feature, resolution) {
	var geometry = feature.getGeometry();
	var styles = [
		// linestring
		new ol.style.Style({
			stroke: new ol.style.Stroke({
				width: 2,
				color: 'lightskyblue'
			})
		})
	];

	geometry.forEachSegment(function(start, end) {
		var dx = end[0] - start[0];
		var dy = end[1] - start[1];
		var rotation = Math.atan2(dy, dx);
		// arrows
		styles.push(new ol.style.Style({
			geometry: new ol.geom.Point(end),
			image: new ol.style.Icon({
				src: '/arrow.png',
				anchor: [0.75, 0.5],
				rotateWithView: false,
				rotation: -rotation
			})
		}));
	});

	return styles;
}

function renderFeatures(group, features) {
	layers.history[group].point.getSource().getSource().clear()
	layers.history[group].point.getSource().getSource().addFeatures(features)

	layers.history[group].line.getSource().clear()
	layers.history[group].line.getSource().addFeature(
		new ol.Feature({
			geometry: new ol.geom.LineString(features.map(function(i) {
				return i.getGeometry().getCoordinates()
			}))
		})
	)
}

data.on('*', function(event, properties, sender) {
	for (var n = 0; n < properties.items.length; n++ ) {
		var i = properties.items[n]

		switch (event) {
		case 'add':
			var d = data.get(i)

			switch (sender) {
			case 'realtime':
				var f = new ol.Feature({
					geometry: new ol.geom.Point(
						(new ol.format.GeoJSON()).readFeature(d.geojson, {
						dataProjection: 'EPSG:4326',
							featureProjection: 'EPSG:900913'
						}).getGeometry().getCoordinates()
					)
				})
				f.setId(i)
				layers['realtime'].getSource().addFeature(f)
				break
			case 'history':
				if (!groups.filter(function(g) { return g.id === d.group }).length) {
					groups.push({
						id: d.group,
						content: d.group
					})

					var length = map.getLayers().getLength()

					layers.history[d.group] = { }

					layers.history[d.group].point = new ol.layer.Vector({
						source: new ol.source.Cluster({
							source: new ol.source.Vector()
						}),
						style: clusterPointStyle
					})
					map.getLayers().insertAt(length - 1, layers.history[d.group].point)

					layers.history[d.group].line = new ol.layer.Vector({
						source: new ol.source.Vector(),
						style: lineStringStyle
					})
					map.getLayers().insertAt(length - 1, layers.history[d.group].line)
				}

				if (timeout[d.group])
					clearTimeout(timeout[d.group])
				timeout[d.group] = setTimeout(function() {
					timeout[d.group] = undefined

					var features = getFeatures(d.group)
					renderFeatures(d.group, features)
					resizeView()
				}.bind(d), 100)
				break
			}
			break
		case 'update':
			var d = data.get(i)
			var o = properties.data[n]

			switch (sender) {
			case 'realtime':
				layers['realtime'].getSource().getFeatureById(i).setGeometry(
					(new ol.format.GeoJSON()).readFeature(d.geojson, {
						dataProjection: 'EPSG:4326',
						featureProjection: 'EPSG:900913'
					}).getGeometry()
				)
				if (!$('#channellist #'+i+' #history').hasClass('inactive')) {
					data.update({
						id: i+':'+o.geojson.properties.time,
						start: new Date(o.geojson.properties.time * 1000),
						group: i,
						geojson: o.geojson
					}, 'history')
				}
				break
			}
			break
		case 'remove':
			switch (sender) {
			case 'realtime':
				layers['realtime'].getSource().removeFeature(
					layers['realtime'].getSource().getFeatureById(i)
				)
				break
			case 'history':
				var g = i.replace(/:.*$/, '')
				if (timeout[g])
					clearTimeout(timeout[g])
				timeout[g] = setTimeout(function() {
					timeout[g] = undefined

					var features = getFeatures(g)
					if (features.length) {
						renderFeatures(g, features)
					} else {
						map.removeLayer(layers.history[g].point)
						map.removeLayer(layers.history[g].line)
						delete layers.history[g]
						groups = groups.filter(function(h) { return h.id !== g })
					}
				}.bind(g), 100)
				break
			}
			break
		}
	}
})

function resizeView() {
	var extent = ol.extent.createEmpty()
	Object.keys(layers.history).forEach(function(j) {
		extent = ol.extent.extend(extent, layers.history[j].line.getSource().getExtent())
	})

	map.beforeRender(
		ol.animation.pan({
			source: map.getView().getCenter()
		}),
		ol.animation.zoom({
			resolution: map.getView().getResolution()
		})
	)

	map.getView().fitExtent(extent, map.getSize())

	timeline.fit({
		duration: 1000
	})
}

function getFeatures(group) {
	return new ol.format.GeoJSON().readFeatures({
		type: 'FeatureCollection',
		features: data.get({ filter: function(i) {
				return i.group === group
			}}).sort(function(a, b) {
				a.geojson.properties.time - b.geojson.properties.time
			}).map(function(i) {
				return i.geojson
			})
		}, {
			dataProjection: 'EPSG:4326',
			featureProjection: 'EPSG:900913'
		}).map(function(f) {
			f.setId(f.getProperties().id+':'+f.getProperties().time.toString())
			return f
		})
}

var tz = jstz.determine().name()
var timeline = new vis.Timeline($('#timeline').get(0), data, {
	orientation: 'top',
	type: 'point',
	start: new Date(new Date().getTime() - 10*60000),
	end: new Date(new Date().getTime() + 5*60000),
	group: groups,
	stack: false
})
timeline.on('select', function(props) {
	var feature;
	Object.keys(layers.history).forEach(function(i) {
		var f = layers.history[i].point.getSource().getSource().getFeatureById(props.items[0])
		if (f)
			feature = f
	})
	if (!feature)
		return
	var geometry = feature.getGeometry()
	var coord = geometry.getCoordinates()
	map.getOverlays().item(0).setPosition(coord)
	$(popupElement).popover({
		'placement': 'top',
		'html': true,
		'content': popupText(feature.getProperties())
	})
	$(popupElement).popover('show')
})
timeline.on('doubleClick', function(props) {
	$('#groups').modal('show')
})
timeline.on('rangechanged', function(props) {
	if (timeout['_timeline'])
		clearTimeout(timeout['_timeline'])
	if (props.byUser) {
		timeout['_timeline'] = setTimeout(function() {
			timeout['_timeline'] = undefined
			history()
		}, 250)
	} else {
		history()
	}
})

$('#channels #refresh').click(function(event) {
	function cleanup() {
		$('#channellist #refresh i').toggleClass('fa-spin')
		delete xhr['refresh']
	}

	if (xhr['refresh']) {
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

			Object.keys(jp.channels).filter(function(i) { return p[i] === undefined }).forEach(function(i) {
				var type = (jp.channels[i].registered) ? 'history' : 'plus';
				$('#channellist > tbody').append('<tr id="'+i+'" class="fa-lg"><th>'+i+'</th><td class="gisrec inactive" id="location-arrow"><a href="#"><i class="fa fa-location-arrow"></i></a></td><td class="gisrec inactive" id="'+type+'"><a href="#"><i class="fa fa-'+type+'"></i></a></td><td class="gisrec inactive" id="trash"><a href="#"><i class="fa fa-trash"></i></a></td></tr>')
				p[i] = 1
			})

			Object.keys(p).filter(function(i) { return jp.channels[i] === undefined }).forEach(function(i) {
				if (!$('#channellist #'+i+' #location-arrow').hasClass('inactive'))
					$('#channellist #'+i+' #location-arrow a').click()
				if (!$('#channellist #'+i+' #history').hasClass('inactive'))
					$('#channellist #'+i+' #history a').click()
				$('#channellist #'+i).remove()
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
			}
		}), 'history')

		if (xhr['channel '+id])
			xhr['channel '+id].abort()

		var	start = WallTime.WallTimeToUTC(tz, timelineRange.start).getTime()
			end = WallTime.WallTimeToUTC(tz, timelineRange.end).getTime()
		xhr['channel '+id] = $.ajax({
			dataType: 'jsonp',
			url: '/channel/'+id,
			data: { start: start, end: end },
			success: function(jp) {
				delete xhr['channel '+id]
				jp.files.forEach(function(f) {
					if (xhr['channel '+id+' '+f])
						return

					xhr['channel '+id+' '+f] = $.ajax({
						dataType: 'json',
						url: '/channel/'+id+'/'+f+'.json',
						success: function(j) {
							delete xhr['channel '+id+' '+f]

							var results = []

							switch (j.type) {
							case 'Feature':
								j = { type: 'FeatureCollection', features: [ j ] }
							case 'FeatureCollection':
								j.features.forEach(function(i) {
									var time = new Date(i.properties.time * 1000)
									if (time.getTime() < start || time.getTime() > end)
										return
									if (data.get(id+':'+i.properties.time) === null) {
										results.push({
											id: id+':'+i.properties.time,
											start: time,
											group: id,
											geojson: i
										})
									}
								})
								break
							default:
								console.log('unknown GeoJSON format for '+id+':'+f+': '+j.type)
								return
							}

							data.update(results, 'history')
						},
						error: function(j) {
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
connection.onopen = function() {
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

	connection.onclose = function(e) {
		log('disconnected: '+e)
	}
	connection.onmessage = function(e) {
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
				id: message.channel,
				type: 'box',
				content: message.channel,
				start: new Date(message.geojson.properties.time * 1000),
				group: 'realtime',
				subgroup: message.channel,
				geojson: message.geojson
			}, 'realtime')
			break
		default:
			log('unknown message type: '+message.type)
		}
	}

	$('#channellist').click(function(event) {
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
					}
				}), 'realtime')
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
					}
				}), 'history')
			} else {
				history()
			}
			break
		case 'plus':
			if (xhr['put channel '+i])
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
			if (xhr['delete channel '+i])
				xhr['delete channel '+i].abort()

			xhr['delete channel '+i] = $.ajax({
				dataType: 'jsonp',
				type: 'DELETE',
				url: '/channel/'+i,
				success: function(jp) {
					delete xhr['delete channel '+i]
					if (!$('#channellist #'+i+' #location-arrow').hasClass('inactive'))
						$('#channellist #'+i+' #location-arrow a').click()
					if (!$('#channellist #'+i+' #history').hasClass('inactive'))
						$('#channellist #'+i+' #history a').click()
					$('#channellist #'+i).remove()
				},
				error: function(jp) {
					delete xhr['delete channel '+i]
				}
			})
			break
		}
	})
}
