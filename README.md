`gisrec` receives data over TCP in the [GPRMC format](http://aprs.gids.nl/nmea/#rmc), and then makes it available to an HTTP client.

## Features

 * supports the Xexun GPRS wire format

## Issues

 * documentation covering testing, and include some screenshots
 * for [historic playback](https://github.com/hallahan/LeafletPlayback)
 * remove 'inactive' class, figure out how to make do with just 'active'
 * [make it an app](http://www.html5rocks.com/en/mobile/fullscreen/)
 * basic configuration
  * filter unsolicited requests
 * local storage for naming/groups, plus share back to server
 * group broadcast events (reg/unreg)
 * meta data tagging/hovers/etc
 * make use of layers
 * pruner for old unreg devices
 * auto-zoom/focus
 * data storage format
  * recording coalescer
  * HTTP cache friendly
  * record *device* location, but a device can be attached for periods
 * handle the [GPRMC checksum](http://www.tigoe.com/pcomp/code/Processing/127/)
 * check xexun length and crc16
 * websocket reconnect

# Preflight

    git clone https://github.com/jimdigriz/gisrec.git
    cd gisrec
    git submodule update --init
    npm install

# Run

    npm start

# Install

    sudo update-service --add $(pwd)/runit gisrec

# Using

When running, you should open your browser to [http://192.0.2.69:27270/](http://192.0.2.69:27270/).

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

  * [Manufacturers Product Page](http://www.gpstrackerchina.com/p131-GPS-Portable-Tracker-TK201-2/)
  * [Manual](http://www.jimsgpstracker.com/manual/tk201-user-manual.pdf)
   * [SMS API](http://g-homeserver.com/attachments/harley-davidson/1653d1361528231-harley-g-5-alarmanlage-mit-gps-ortung-tracker-tracking-software-xt-009-user-manual.pdf)
