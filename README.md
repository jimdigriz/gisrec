`gisrec` receives data over TCP in the [GPRMC format](http://aprs.gids.nl/nmea/#rmc), and then makes it avaliable to an HTTP client.

## Issues

 * needs GUI
  * [LeafletJS](http://leafletjs.com/)
  * with timeline
 * basic configuration
  * filter unsolicited requests
 * data storage format
  * recording coalescer
  * HTTP cache friendly - static JSON files?
  * record *device* location, but a device can be attached for periods
  * [GeoJSON](http://geojson.org/geojson-spec.html) seems unsuitable for temporal data and [JTS](http://eagleio.readthedocs.org/en/latest/reference/historic/jts.html) looks nuts
 * handle the [GPRMC checksum](http://www.tigoe.com/pcomp/code/Processing/127/)

# Preflight

    git clone https://github.com/jimdigriz/gisrec.git
    cd gisrec
    npm install

# Run

    npm start

# Install

    sudo update-service --add $(pwd)/runit gisrec
