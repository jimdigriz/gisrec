`gisrec` receives data over TCP in the [GPRMC format](http://aprs.gids.nl/nmea/#rmc), and then makes it avaliable to an HTTP client.

## Features

 * supports the Xexun GPRS wire format

## Issues

 * needs GUI
  * [LeafletJS](http://leafletjs.com/)
  * for [historic playback](https://github.com/hallahan/LeafletPlayback)
  * for [live plotting](https://github.com/perliedman/leaflet-realtime)
 * basic configuration
  * filter unsolicited requests
 * data storage format
  * move to [GeoJSON](http://geojson.org/geojson-spec.html)
  * recording coalescer
  * HTTP cache friendly
  * record *device* location, but a device can be attached for periods
 * handle the [GPRMC checksum](http://www.tigoe.com/pcomp/code/Processing/127/)
 * check xexun length and crc16

# Preflight

    git clone https://github.com/jimdigriz/gisrec.git
    cd gisrec
    npm install

# Run

    npm start

# Install

    sudo update-service --add $(pwd)/runit gisrec

# Using

## Xexun TK201-2 (and possibly others)

SMS the following to the phone number of the SIM in your Xexun tracker (where `192.0.2.69` is the IP address of your server and `giffgaff.com` is your APN):

    begin123456
    adminip123456 192.0.2.69 27271
    apn123456 giffgaff.com

**N.B.** `123456` is the default factory password

To configure the device to send a data point once every five seconds send it:

    t005s***n123456

To disable auto-track, send:

    notn123456

### Related Links

  * [manufacturers product page]((http://www.gpstrackerchina.com/p131-GPS-Portable-Tracker-TK201-2/))
  * [manual](http://www.jimsgpstracker.com/manual/tk201-user-manual.pdf)
