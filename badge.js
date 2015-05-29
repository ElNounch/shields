var domain = require('domain');
var fs = require('fs');
var path = require('path');
var SVGO = require('svgo');
var dot = require('dot');
var LruCache = require('./lru-cache.js');
var defined = require('defined');

var iconsCache = new LruCache(64, 'unit');
var measureTextCache = new LruCache(256, 'unit');

var iconShortcuts = {
  'linux': 'f17c',
  'windows': 'f17a',
  'apple': 'f179',
  'android': 'f17b',
  'dollar': 'f155',
  'euro': 'f153',
  'bug': 'f188',
  'diamond': 'f219',
  'book': 'f02d',
  'code': 'f121',
  'eye': 'f06e',
  'check': 'f00c',
  'cloud': 'f0c2',
  'cloud-download': 'f0ed',
  'github': 'f09b',
  'html5': 'f13b',
  'smile-o': 'f118',
  'frown-o': 'f119',
  'user': 'f007',
  'users': 'f0c0',
  'info': 'f129',
  'heart': 'f004',
};
var glyphsPath = path.join(__dirname, 'icons', 'awesome', 'svg');

// Initialize what will be used for automatic text measurement.
var Canvas = require('canvas');
var canvasElement = new Canvas(0, 0);   // Width and height are irrelevant.
var canvasContext = canvasElement.getContext('2d');
var CanvasFont = Canvas.Font;
try {
  var opensans = new CanvasFont('Verdana',
      path.join(__dirname, 'Verdana.ttf'));
  canvasContext.addFont(opensans);
} catch(e) {}
canvasContext.font = '11px Verdana, "DejaVu Sans"';

// cache templates.
var templates = {};
var templateFiles = fs.readdirSync(path.join(__dirname, 'templates'));
dot.templateSettings.strip = false;  // Do not strip whitespace.
templateFiles.forEach(function(filename) {
  if (filename[0] === '.') { return; }
  var templateData = fs.readFileSync(
    path.join(__dirname, 'templates', filename)).toString();
  var extension = filename.split('.').pop();
  var style = filename.slice(0, -(('-template.' + extension).length));
  templates[style + '-' + extension] = dot.template(templateData);
});

// Icons
var svgoIcons = new SVGO();
var validGlyphs = {};
(function initValidGlyphs() {
  var tmp = fs.readdirSync(glyphsPath);
  if (tmp) {
    tmp.forEach(function(e) {
      var file = /^([\w-]+)\.svg$/.exec(e);
      if (file) {
        validGlyphs[file[1]] = true;
      }
    });
  }
}());

var awaiting = {};
function loadGlyph(glyph, await) {
  if (awaiting.hasOwnProperty(glyph)) {
    awaiting[glyph].push(await);
  } else {
    awaiting[glyph] = [await];
    fs.readFile(path.join(glyphsPath, glyph + '.svg'), { encoding: 'utf-8' }, function(err, svg) {
      if (err) {
        delete validGlyphs[glyph];
        callAwaiting();
      } else {
        svgoIcons.optimize(svg, function(svgOpti) {
          iconsCache.set(glyph, 'data:image/svg+xml;utf8,' + encodeURIComponent(svgOpti.data));
          callAwaiting();
        })
      }
    })
  }
  
  function callAwaiting() {
    awaiting[glyph].forEach(function(waited) {
      if (typeof waited !== 'undefined') {
        makeImage.apply(this, waited);
      }
    })
    delete awaiting[glyph];
  }
}

// Cache for string measurements
function stringWidth( text ) {
  var result = measureTextCache.get( text );
  if( typeof result === 'undefined' ) {
    result = canvasContext.measureText( text ).width;
    measureTextCache.set( text, result );
  }
  return result;
}

function escapeXml(s) {
  return s.replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&apos;');
}
function addEscapers(data) {
  data.escapeXml = escapeXml;
}

var colorscheme = require(path.join(__dirname, 'colorscheme.json'));

var svgo = new SVGO();
function optimize(string, callback) {
  svgo.optimize(string, callback);
}

function makeImage(data, cb) {
  if (data.format !== 'json') {
    data.format = 'svg';
  }
  if (!(data.template + '-' + data.format in templates)) {
    data.template = 'default';
  }
  if (data.colorscheme) {
    var pickedColorscheme = colorscheme[data.colorscheme];
    if (!pickedColorscheme) {
      pickedColorscheme = colorscheme.red;
    }
    data.colorA = pickedColorscheme.colorA;
    data.colorB = pickedColorscheme.colorB;
  }
  // Icon/Logo.
  data.logoColor = ((typeof data.logoColor === 'string') && (data.logoColor.length)) ? data.logoColor : '#fff';
  data.logoWidth = +data.logoWidth || (data.logo? 14: 0);
  data.logoPadding = (data.logo? 3: 0);
  if ((typeof data.logo !== 'undefined') && (/^[\w-]+$/.test(data.logo))) {
    if (iconShortcuts.hasOwnProperty(data.logo)) {
      data.logo = iconShortcuts[data.logo];
    }
    var svg = iconsCache.get(data.logo);
    if (typeof svg === 'undefined') {
      if (!validGlyphs.hasOwnProperty(data.logo)) {
        data.logo = '';
      } else {
        return loadGlyph(data.logo, arguments);
      }
    } else {
      data.logo = svg;
    }
  }
  if (typeof data.logo !== 'undefined') {
    data.logo = data.logo.replace(encodeURIComponent('<svg '), encodeURIComponent('<svg fill="' + data.logoColor + '" '));
  }

  // String coercion.
  data.text[0] = '' + data.text[0];
  data.text[1] = '' + data.text[1];
  if (data.text[0].length === 0) {
    data.logoPadding = 0;
  }

  data.widths = [
    (stringWidth(data.text[0])|0) + 10
      + data.logoWidth + data.logoPadding,
    (stringWidth(data.text[1])|0) + 10,
  ];
  if (data.links === undefined) {
    data.links = ['', ''];
  }

  var template = templates[data.template + '-' + data.format];
  addEscapers(data);
  try {
    var result = template(data);
  } catch(e) {
    cb('', e);
    return;
  }

  if (data.format === 'json') {
    cb(result);
  } else {
    // Run the SVG through SVGO.
    optimize(result, function(object) { cb(object.data); });
  }
}

function encapsulatingMakeImage(data, cb) {
  var makeImageDomain = domain.create();
  makeImageDomain.on('error', function(err) {
    console.error('Badge generator error:', err.stack);
    cb('', err);
  });
  makeImageDomain.bind(makeImage).apply(this, arguments);
}

module.exports = encapsulatingMakeImage;
