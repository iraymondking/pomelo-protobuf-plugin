var fs = require('fs');
var path = require('path');
var protobuf = require("protobufjs");
var SERVER = 'server';
var CLIENT = 'client';
var logger = require('@sex-pomelo/sex-pomelo-logger').getLogger('pomelo', __filename);

module.exports = function(app, opts) {
  return new Component(app, opts);
};

var Component = function(app, opts) {
  this.app = app;
  this.version = 0;
  this.watchers = {};
  opts = opts || {};
  this.serverProtosPath = opts.serverProtos || '/config/serverProtos.json';
  this.clientProtosPath = opts.clientProtos || '/config/clientProtos.json';
};

var pro = Component.prototype;

pro.name = '__decodeIO__protobuf__';

pro.start = function(cb) {
  let self = this;
  this.setProtos(SERVER, path.join(this.app.getBase(), this.serverProtosPath));
  this.setProtos(CLIENT, path.join(this.app.getBase(), this.clientProtosPath));

  protobuf.load(path.join(this.app.getBase(), this.serverProtosPath),function (err,root) {
    self.encodeBuilder = root;
  });

  protobuf.load(path.join(this.app.getBase(), this.clientProtosPath),function (err,root) {
    self.decodeBuilder = root;
  });

  process.nextTick(cb);
};

//todo temp,need to verify
pro.check = function(type, route) {
  switch(type) {
    case SERVER:
      if(!this.encodeBuilder) {
        logger.warn('decodeIO encode builder is undefined.');
        return null;
      }
      return this.encodeBuilder.lookupType(route);
      break;
    case CLIENT:
      if(!this.decodeBuilder) {
        logger.warn('decodeIO decode builder is undefined.');
        return null;
      }
      return this.decodeBuilder.lookupType(route);
      break;
    default:
      throw new Error('decodeIO meet with error type of protos, type: ' + type + ' route: ' + route);
      break;
  }
};

pro.encode = function(route, message) {
  var Encoder = this.encodeBuilder.lookupType(route);
  var buffer = Encoder.encode(message).finish()
  return buffer;
};

pro.decode = function(route, message) {
  var Decoder = this.decodeBuilder.lookupType(route);
  // return Decoder.decode(message);
  return Decoder.toObject(message);
};

pro.getProtos = function() {
  return {
    server : this.serverProtos,
    client : this.clientProtos,
    version : this.version
  };
};

pro.getVersion = function() {
  return this.version;
};

pro.setProtos = function(type, path) {
  if(!fs.existsSync(path)) {
    return;
  }

  if(type === SERVER) {
    this.serverProtos = require(path);
  }

  if(type === CLIENT) {
    this.clientProtos = require(path);
  }

  //Set version to modify time
  var time = fs.statSync(path).mtime.getTime();
  if(this.version < time) {
    this.version = time;
  }

  //Watch file
  var watcher = fs.watch(path, this.onUpdate.bind(this, type, path));
  if (this.watchers[type]) {
    this.watchers[type].close();
  }
  this.watchers[type] = watcher;
};

pro.onUpdate = function(type, path, event) {
  if(event !== 'change') {
    return;
  }

  fs.readFile(path, 'utf8' ,function(err, data) {
    try {
      if(type === SERVER) {
        this.serverProtos = JSON.parse(data);
      } else {
        this.clientProtos = JSON.parse(data);
      }

      this.version = fs.statSync(path).mtime.getTime();
      logger.debug('change proto file , type : %j, path : %j, version : %j', type, path, this.version);
    } catch(e) {
      logger.warn("change proto file error! path : %j", path);
      logger.warn(e);
    }
  });
};

pro.stop = function(force, cb) {
  for (var type in this.watchers) {
    this.watchers[type].close();
  }
  this.watchers = {};
  process.nextTick(cb);
};
