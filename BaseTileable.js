define([
	"dojo/_base/declare",
	"dojo/has",
	"dojo/_base/window",
	"dojo/_base/lang",
	"dojo/dom",
	"dojo/dom-class",
	"dojo/dom-construct",
	"dojo/_base/sniff"
], function(declare, has, win, lang, dom, domClass, domConstruct){
	
/*
	Bbox of a tile x/y (coordinates in pixels; (left,top)-(right,bottom)): 
	(x*tileSizeX, y*tileSizeY) - ((x+1)*tileSizeX, (y+1)*tileSizeY )
*/

// feature detection
var hasTranslate3d;
if (has("webkit")) {
	var elem = win.doc.createElement("div");
	elem.style.webkitTransform = "translate3d(0px,1px,0px)";
	win.doc.documentElement.appendChild(elem);
	var v = win.doc.defaultView.getComputedStyle(elem, '')["-webkit-transform"];
	hasTranslate3d = v && v.indexOf("matrix") === 0;
	win.doc.documentElement.removeChild(elem);
}

var setSelectable = function(node, selectable){
	// dojo.setSelectable has dependency on dojo.query. Re-define our own.
	node.style.KhtmlUserSelect = selectable ? "auto" : "none";
	node.style.MozUserSelect = selectable ? "" : "none";
	node.onselectstart = selectable ? null : function(){return false;};
	if(has("ie")){
		node.unselectable = selectable ? "" : "on";
		var nodes = node.getElementsByTagName("*");
		for(var i = 0; i < nodes.length; i++){
			nodes[i].unselectable = selectable ? "" : "on";
		}
	}
};

// module:
//		tiles/BaseTileable
// summary:
//		The base class for tiles

return declare(null, {
	// summary:
	//		The base class for tiles

	maxSpeed: 500,
	scrollBar: false,
	constraint: false,
	
	numTilesX: 0,
	numTilesY: 0,
	
	tileBounds: null,
	
	// wrap the tile set horizontally?
	wrapHor: false,
	
	tiles: null,
	// left top tile
	ltTile: null,
	// right top tile
	rtTile: null,
	// left bottom tile
	lbTile: null,
	// right bottom tile
	rbTile: null,
	
	tileSize: 256,
	zoom: 0,
	center: null,
	setTileContent: null,
	
	offsetX: 0,
	offsetY: 0,

	extraTilesL: 0,
	extraTilesR: 0,
	extraTilesT: 0,
	extraTilesB: 0,
	
	swapThresholdX: 1,
	swapThresholdY: 1,
	
	// style.left of the left top tile
	_left: 0,
	// style.top of the left top tile
	_top: 0,
	
	constructor: function(kwArgs, node) {
		this.kwArgs = kwArgs;
		if (lang.isString(node)) {
			node = dom.byId(node);
		}
		this.domNode = node;
		if (!dojo.isArray(this.tileSize)) {
			this.tileSize = [this.tileSize, this.tileSize];
		}
		if (kwArgs.zoom!==undefined) {
			this.zoom = kwArgs.zoom;
		}
		if (!kwArgs.extent) {
			var _pow = Math.pow(2, this.zoom);
			this.extent = [0, 0, this.tileSize[0] * _pow, this.tileSize[1] * _pow];
		}
		if (!kwArgs.center) {
			this.center = [0,0];
		}
		if (!kwArgs.setTileContent) {
			this.setTileContent = function(){};
		}
		this.tiles = [];
		this.tileBounds = [];
		if (kwArgs.extraTiles !== undefined) {
			var extraTiles = kwArgs.extraTiles;
			this.extraTilesL = extraTiles;
			this.extraTilesR = extraTiles;
			this.extraTilesT = extraTiles;
			this.extraTilesB = extraTiles;
		}
	},
	
	_calculateTileBounds: function() {
		var bounds = this.tileBounds,
			extent = this.extent,
			size = this.tileSize;

		// all bounds are inclusive
		// TODO: consider negative extent and bounds
		bounds[0] = (extent[0]+1)/size[0];
		bounds[1] = (extent[1]+1)/size[1];
		bounds[2] = (extent[2]-1)/size[0];
		bounds[3] = (extent[3]-1)/size[1];
	},
	
	_mixin: function() {
		lang.mixin(this, this.kwArgs);
		delete this.kwArgs;
	},

	_buildRendering: function(){
		this.containerNode = domConstruct.create("div", {style: {position: "relative"}});
		this.containerNode.style.height
			= (win.global.innerHeight||win.doc.documentElement.clientHeight) * 2 + "px"; // must bigger than the screen

		this.buildTiles();
		this.domNode.appendChild(this.containerNode);
		this.touchNode = this.domNode;
		setSelectable(this.domNode, false);
	},
	
	buildTiles: function() {
		this.updateDivDimensions();

		this.numTilesX = 1 + Math.ceil(this.width/this.tileSize[0]) + this.extraTilesL + this.extraTilesR;
		this.numTilesY = 1 + Math.ceil(this.height/this.tileSize[1]) + this.extraTilesT + this.extraTilesB;

		var tiles = this.tiles,
			tileCounter = 0
		;
		for (var x=0; x<this.numTilesX; x++) {
			for (var y=0; y<this.numTilesY; y++) {
				tiles[tileCounter] = {
					empty: true,
					div: domConstruct.create("div", {
						style: {
							position: "absolute",
							left: x*this.tileSize[0]+"px",
							top: y*this.tileSize[1]+"px",
							width: this.tileSize[0]+"px",
							height: this.tileSize[1]+"px"
						}
					}, this.containerNode),
					l: (x!=0) ? tiles[tileCounter-this.numTilesY] : null,
					t: (y!=0) ? tiles[tileCounter-1] : null,
					r: null,
					b: null,
					x: x,
					y: y
				};
				if (x!=0) tiles[tileCounter-this.numTilesY].r = tiles[tileCounter];
				if (y!=0) tiles[tileCounter-1].b = tiles[tileCounter];
				tileCounter++;
			}
		};
		this.ltTile = this.tiles[0];
		this.lbTile = this.tiles[this.numTilesY-1];
		this.rtTile = this.tiles[this.numTilesY*(this.numTilesX-1)];
		this.rbTile = this.tiles[this.numTilesY*this.numTilesX-1];
	},

	_startup: function(){
		this.updateTileDivs();
	},

	doZoom: function(zoom, divX, divY) {
		this.updateDivDimensions();

		if (divX === undefined) {
			divX = this.halfWidth;
			divY = this.halfHeight;
		}
		
		var extentScaling = Math.pow(2, zoom - this.zoom);
		this.zoom = zoom;
		for (var i=0; i<4; i++) {
			this.extent[i] = Math.floor(extentScaling*this.extent[i]);
		}
		this._calculateTileBounds();
		
		// get this.containerNode offset
		var pos = this.getPos(),
		// calculate position of the click event relative to the top left corner of the tiles set
			x = -this._left + (this.x1-this.tileOffsetX)*this.tileSize[0] - pos.x + divX,
			y = -this._top + (this.y1-this.tileOffsetY)*this.tileSize[1] - pos.y + divY,
		// position after zooming
			newX = extentScaling*x,
			newY = extentScaling*y
		;

		// point in the tiles set where the click event occured remains invariant
		// calculate coordinates of the center of this.domNode
		// relative to the top left corner of the tiles set 
		this.center[0] = newX + this.halfWidth - divX,
		this.center[1] = newY + this.halfHeight - divY;
		
		this.updateTileDivs();
	},
	
	updateDivDimensions: function() {
		this.width = this.domNode.clientWidth;
		this.height = this.domNode.clientHeight;
		this.halfWidth = Math.floor(this.width/2);
		this.halfHeight = Math.floor(this.height/2);
	},
	
	updateTileDivs: function() {
		var tiles = this.tiles,
			center = this.center,
			bounds = this.tileBounds,
			left = center[0]-(this.width-this.halfWidth),
			top = center[1]-(this.height-this.halfHeight),
			offsetX = left % this.tileSize[0],
			offsetY = top % this.tileSize[1],
			x1 = (left-offsetX)/this.tileSize[0],
			y1 = (top-offsetY)/this.tileSize[1]
		;
		
		var tileOffsetX = 0,
			tileOffsetY = 0;

		if (offsetX<0) {
			var _offsetX = -offsetX;
			tileOffsetX = 1 + (_offsetX - _offsetX%this.tileSize[0])/this.tileSize[0];
			offsetX += tileOffsetX*this.tileSize[0];
		}
		if (offsetY<0) {
			var _offsetY = -offsetY;
			tileOffsetY = 1 + (_offsetY - _offsetY%this.tileSize[1])/this.tileSize[1];
			offsetY += tileOffsetY*this.tileSize[1];
		}
		offsetX += this.extraTilesL*this.tileSize[0];
		offsetY += this.extraTilesT*this.tileSize[1];

		tileOffsetX += this.extraTilesL;
		tileOffsetY += this.extraTilesT;

		if (x1<bounds[0]) {
			tileOffsetX += bounds[0]-x1;
			x1 = bounds[0];
		}
		if (y1<bounds[1]) {
			tileOffsetY += bounds[1]-y1;
			y1 = bounds[1];
		}

		// remember x1,y1,tileOffsetX,tileOffsetY
		this.x1 = x1;
		this.y1 = y1;
		this.tileOffsetX = tileOffsetX;
		this.tileOffsetY = tileOffsetY;

		var tile = this.ltTile;
		for (var i1=0; i1<this.numTilesX; i1++) {
			// the first tile in the column
			var columnTile = tile;
			for (var i2=0; i2<this.numTilesY; i2++) {
				var x = i1 + x1 - tileOffsetX,
					y = i2 + y1 - tileOffsetY,
					// is x inside horizontal bounds?
					inHorBounds = x>=bounds[0] && x<=bounds[2],
					// is y inside vertical bounds?
					inVerBounds = y>=bounds[1] && y<=bounds[3];

				if ( inVerBounds && (inHorBounds || this.wrapHor) ) {
					if (this.wrapHor && !inHorBounds) {
						if (x>bounds[2]) {
							x = bounds[0] + (x-bounds[2]-1) % (bounds[2]-bounds[0]+1);
						}
						else if (x<bounds[0]) {
							x = bounds[2] + (x-bounds[0]+1) % (bounds[2]-bounds[0]+1);
						}
					}
					if (tile.empty) tile.empty = false;
					this.setTileContent(tile, this.zoom, x, y);
				}
				else if (!tile.empty) {
					this.clearTile(tile);
				}
				tile = (tile.b) ? tile.b : columnTile.r;
			}
		}

		this.offsetX = -this._left-offsetX;
		this.offsetY = -this._top-offsetY;

		this.scrollTo({x: this.offsetX, y: this.offsetY});
	},
	
	clearTile: function(tile) {
		tile.div.removeChild(tile.img);
		delete tile.img;
		tile.empty = true;
	},
	
	_renderTile: function(tile, i1, i2) {
		var bounds = this.tileBounds;
		var x = i1 + this.x1 - this.tileOffsetX,
			y = i2 + this.y1 - this.tileOffsetY,
			// is x inside horizontal bounds?
			inHorBounds = x>=bounds[0] && x<=bounds[2],
			// is y inside vertical bounds?
			inVerBounds = y>=bounds[1] && y<=bounds[3];

		if ( inVerBounds && (inHorBounds || this.wrapHor) ) {
			if (this.wrapHor && !inHorBounds) {
				if (x>bounds[2]) {
					x = bounds[0] + (x-bounds[2]-1) % (bounds[2]-bounds[0]+1);
				}
				else if (x<bounds[0]) {
					x = bounds[2] + (x-bounds[0]+1) % (bounds[2]-bounds[0]+1);
				}
			}
			if (tile.empty) tile.empty = false;
			this.setTileContent(tile, this.zoom, x, y);
		}
		else if (!tile.empty) {
			this.clearTile(tile);
		}
	},

	onTouchMove: function(/*e*/shiftX, shiftY) {
		var pos = this.getPos(),
			// change in offsetX
			dx = pos.x-this.offsetX,
			// change in offsetY
			dy = pos.y-this.offsetY,
			// change in offsetX in integer number of tiles
			dxt = (dx - dx%this.tileSize[0])/this.tileSize[0],
			// change in offsetY in integer number of tiles
			dyt = (dy - dy%this.tileSize[1])/this.tileSize[1]
		;

		this.swapTiles(
			Math.abs(dxt) >= this.swapThresholdX ? dxt : 0,
			Math.abs(dyt) >= this.swapThresholdY ? dyt : 0
		);
		if (Math.abs(dxt) >= this.swapThresholdX) {
			this.offsetX = pos.x - dx%this.tileSize[0];
		}
		if (Math.abs(dyt) >= this.swapThresholdY) {
			this.offsetY = pos.y - dy%this.tileSize[1];
		}

		this.scrollTo({x:this.startPos.x + shiftX, y:this.startPos.y + shiftY});
	},
	
	swapTiles: function(dxt, dyt) {
		if (dxt) {
			var l1 = this.ltTile,
				l2 = l1,
				r2 = this.rtTile,
				r1 = r2,
				b1 = this.lbTile,
				b2 = this.rbTile,
				_dxt = Math.abs(dxt)
			;

			if (_dxt > 1) {
				for (var i=1; i<_dxt; i++) {
					l2 = l2.r;
					r1 = r2.l;
					b1 = b1.r;
					b2 = b2.l;
				}
			}
			
			var left = this._left;
			if (dxt<0) {
				this.ltTile = l2.r;
				this.rtTile = l2;
				this.lbTile = b1.r;
				this.rbTile = b1;
				left += this.numTilesX * this.tileSize[0];
			}
			else {
				this.ltTile = r1;
				this.rtTile = r1.l;
				this.lbTile = b2;
				this.rbTile = b2.l;
				left -= this.tileSize[0];
			}
			this._left -= dxt*this.tileSize[0];
			for (var i1=0; i1<this.numTilesY; i1++) {
				if (dxt<0) {
					var l = l1;
					for (var i2=0; i2<_dxt; i2++) {
						l.div.style.left = left+i2*this.tileSize[0]+"px";
						this._renderTile(l, this.numTilesX+i2, i1);
						l = l.r;
					}
					l2.r.l = null;
					l2.r = null;
				}
				else {
					var r = r2;
					for (var i2=0; i2<_dxt; i2++) {
						r.div.style.left = left-i2*this.tileSize[0]+"px";
						this._renderTile(r, -1-i2, i1);
						r = r.l;
					}
					r1.l.r = null;
					r1.l = null;
				}

				r2.r = l1;
				l1.l = r2;

				l1 = l1.b;
				l2 = l2.b;
				r1 = r1.b;
				r2 = r2.b;
			}
			this.x1 -= dxt;
		}

		if (dyt) {
			var b1 = this.lbTile,
				b2 = b1,
				t2 = this.ltTile,
				t1 = t2,
				r1 = this.rbTile,
				r2 = this.rtTile,
				_dyt = Math.abs(dyt)
			;

			if (_dxt > 1) {
				for (var i=1; i<_dxt; i++) {
					b2 = b2.t;
					t1 = t1.b;
					r1 = r1.t;
					r2 = r2.b;
				}
			}
			
			var top = this._top;
			if (dyt<0) {
				this.ltTile = t1.b;
				this.lbTile = t1;
				this.rtTile = r2.b;
				this.rbTile = r2;
				top += this.numTilesY * this.tileSize[1];
			}
			else {
				this.ltTile = b2;
				this.lbTile = b2.t;
				this.rtTile = r1;
				this.rbTile = r1.t;
				top -= this.tileSize[1];
			}
			this._top -= dyt*this.tileSize[1];
			for (var i1=0; i1<this.numTilesX; i1++) {
				if (dyt<0) {
					var t = t2;
					for (var i2=0; i2<_dyt; i2++) {
						t.div.style.top = top+i2*this.tileSize[1]+"px";
						this._renderTile(t, i1, this.numTilesY+i2);
						t = t.b;
					}
					t1.b.t = null;
					t1.b = null;
				}
				else {
					var b = b1;
					for (var i2=0; i2<_dyt; i2++) {
						b.div.style.top = top-i2*this.tileSize[1]+"px";
						this._renderTile(b, i1, -1-i2);
						b = b.t;
					}
					b2.t.b = null;
					b2.t = null;
				}

				t2.t = b1;
				b1.b = t2;

				b1 = b1.r;
				b2 = b2.r;
				t1 = t1.r;
				t2 = t2.r;
			}
			this.y1 -= dyt;
		}
	},
	
	slideTo: function(/*Object*/to, /*Number*/duration, /*String*/easing){
		
	},
	
	scrollTo: function(/*Object*/to){ // to: {x, y}
		// summary:
		//		Scrolls to the given position.
		var s = this.containerNode.style;
		if (has("webkit")){
			s.webkitTransform = this.makeTranslateStr(to);
		}
		else{
			s.top = Math.round(to.y) + "px";
			s.left = Math.round(to.x) + "px";
		}
		this._pos = to;
	},
	
	makeTranslateStr: function(to) {
		var y = to.y+"px";
		var x = to.x+"px";
		return hasTranslate3d ? "translate3d("+x+","+y+",0px)" : "translate("+x+","+y+")";
	},
	
	getPos: function() {
		// summary:
		//		Get the top position in the midst of animation
		return this._pos || {x:0,y:0};
	}
});
});
